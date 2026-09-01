import * as THREE from 'three'
import { analyzeSurfacePatches } from './surfacePatches'

interface BrepFaceRange {
  first: number
  last: number
}

const WELD_EPSILON = 1e-5

function keyFor(v: THREE.Vector3): string {
  const s = 1 / WELD_EPSILON
  return `${Math.round(v.x * s)}_${Math.round(v.y * s)}_${Math.round(v.z * s)}`
}

// ~2.5° - deliberately tight. Two independently-averaged vertex normals at
// the exact same welded position, on a genuinely continuous surface, land
// far closer than this; even a tangent (G1) transition between two
// different real surfaces samples slightly off the mathematical boundary
// on each side, where the two surfaces' curvatures have already started to
// diverge, so it reads as a bigger gap than that. Tight is the safer
// direction to be wrong in: this only ever SUPPRESSES a candidate that the
// topology check already flagged as a boundary, so erring loose would risk
// erasing a real edge, while erring tight only risks leaving an occasional
// seam undetected - the topology check alone already handles most of those.
const NORMAL_CONTINUITY_THRESHOLD = 0.999

// Every distinct normal direction seen at each welded position, from every
// vertex there regardless of which triangle/face it belongs to - a
// position where all of them agree is geometrically smooth right there,
// whatever the topology says.
function buildNormalDiversityMap(
  position: THREE.BufferAttribute,
  normal: THREE.BufferAttribute,
): Map<string, THREE.Vector3[]> {
  const map = new Map<string, THREE.Vector3[]>()
  const v = new THREE.Vector3()
  const n = new THREE.Vector3()
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i)
    const key = keyFor(v)
    n.fromBufferAttribute(normal, i)
    let list = map.get(key)
    if (!list) {
      list = []
      map.set(key, list)
    }
    if (!list.some((existing) => existing.dot(n) > NORMAL_CONTINUITY_THRESHOLD)) list.push(n.clone())
  }
  return map
}

// True topological edges instead of an angle-threshold guess: occt-import-js
// tessellates each B-Rep face independently (see stepLoader.ts's brepFaces),
// and - verified empirically against this app's own test assembly - two
// adjacent faces never actually share vertex INDICES at their common
// boundary, even though they sample the exact same 3D curve there. So the
// edge to draw isn't "shared by two different faces' triangles" by vertex
// index (that never happens); it's "touched by only ONE triangle within its
// own face's triangle range" - the boundary of that face's own little
// triangulated patch, found per face and independent of every other face.
// That boundary is exactly the face's real edge loop(s): a bore's rim, a
// chamfer's two bounding edges, and - critically - a tangent (G1)
// fillet-to-cylinder transition, which EdgesGeometry's angle threshold can
// never catch at any value (a genuinely tangent transition has ~0° dihedral
// angle at the tessellation, indistinguishable by angle from the interior
// of one smooth face).
//
// A periodic face (a cylinder, typically) has a boundary of its OWN kind
// too: OpenCascade can't tessellate a surface that wraps all the way around
// (u=0 meeting u=2π) into a mesh without cutting it somewhere, and that cut
// duplicates a whole column of vertices - geometrically coincident with
// themselves, but distinct indices, so each column-edge along the cut also
// reads as "touched by only one triangle" on both sides of the duplicate,
// exactly like a real boundary would (verified empirically: a bolt's shaft
// face shows exactly 2 such self-matching boundary edges, one whole seam
// segment, alongside its genuine rim boundaries). Position-welding alone
// can't tell that apart from a real cross-face edge, since both are just
// "two boundary edges that land on the same coincident points" - the
// distinguishing fact is which FACE each one came from: a real edge is
// always contributed by two *different* faces, while a seam's two halves
// are always contributed by the *same* face tessellating itself. So each
// welded position-key tracks the set of face indices that contributed to
// it, and only pairs spanning 2+ different faces are kept.
//
// "Different face" means different physical surface, not just a different
// brep_faces table entry, though: OpenCascade frequently represents one
// continuous cylinder (a bolt's shaft, a bore) as TWO separate ~178°
// half-cylinder faces rather than one full one (see surfacePatches.ts's
// mergeCoincidentCylinderRegions, verified against this app's own test
// assembly) - naively, the seam between those two halves looks exactly
// like a real edge by the rule above, since it genuinely is contributed by
// two different brep_faces entries. Reusing that same cylinder-merge
// detection here (its facePatch table already answers "which triangles are
// really the same physical cylinder, across however many original faces it
// got split into") and keying on the merged patch instead of the raw face
// index for any triangle that's part of one is what tells that apart from
// a real edge - a flat face with no cylindrical patch just keys on its own
// raw index, unchanged.
//
// That merge only fires when there's enough tessellation density for
// mergeCoincidentCylinderRegions's own cylinder fit to succeed, though - a
// small hole (an Ø5.5mm bore, say) can tessellate each half with too few
// triangles to fit reliably, so the merge silently doesn't happen and its
// seam would still pass the "different group" test above. A second,
// independent check catches that case without depending on the fit at all:
// occt-import-js supplies no vertex normals of its own (verified directly
// against this app's own test files), so stepLoader.ts always falls back
// to three.js's own computeVertexNormals() - which averages face normals
// per vertex INDEX, not position, so the two (index-distinct, position-
// identical) sides of a seam get their own independently-averaged normal.
// On a genuinely smooth surface those two independent averages still land
// almost exactly on top of each other; at a real edge they don't. So a
// boundary candidate that already cleared the group check is suppressed
// anyway if BOTH its endpoints turn out to have only one distinct normal
// direction there - still geometrically smooth despite the topology
// disagreement, so still a seam.
export function computeBrepEdgesGeometry(mesh: THREE.Mesh): THREE.BufferGeometry | null {
  const brepFaces = mesh.userData.brepFaces as BrepFaceRange[] | undefined
  if (!brepFaces || brepFaces.length === 0) return null

  const position = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined
  const index = mesh.geometry.getIndex()
  if (!position || !index) return null

  const triangleCount = index.count / 3
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const segments = new Map<string, { a: THREE.Vector3; b: THREE.Vector3; groups: Set<number> }>()

  // Every triangle in one original brep_faces range lands in the same
  // merged region (mergeCoincidentCylinderRegions only ever unions whole
  // regions, never splits one), so checking the range's first triangle is
  // enough to know the whole face's canonical group.
  const { facePatch } = analyzeSurfacePatches(mesh)
  const patchGroupOffset = brepFaces.length
  const canonicalGroup = brepFaces.map(({ first }, faceIndex) => {
    const patchIndex = facePatch[first]
    return patchIndex >= 0 ? patchGroupOffset + patchIndex : faceIndex
  })

  brepFaces.forEach(({ first, last }, faceIndex) => {
    // Scoped to this one face's own triangle range - an edge touched by
    // exactly one triangle here is a boundary edge of this face's patch,
    // regardless of what any other face's triangles do.
    const edgeCount = new Map<string, number>()
    for (let t = first; t <= last && t < triangleCount; t++) {
      const i0 = index.getX(t * 3)
      const i1 = index.getX(t * 3 + 1)
      const i2 = index.getX(t * 3 + 2)
      for (const [va, vb] of [
        [i0, i1],
        [i1, i2],
        [i2, i0],
      ] as const) {
        const key = va < vb ? `${va}_${vb}` : `${vb}_${va}`
        edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1)
      }
    }

    for (const [key, count] of edgeCount) {
      if (count !== 1) continue
      const [vaStr, vbStr] = key.split('_')
      a.fromBufferAttribute(position, Number(vaStr))
      b.fromBufferAttribute(position, Number(vbStr))
      const segKey = [keyFor(a), keyFor(b)].sort().join('|')
      let entry = segments.get(segKey)
      if (!entry) {
        entry = { a: a.clone(), b: b.clone(), groups: new Set() }
        segments.set(segKey, entry)
      }
      entry.groups.add(canonicalGroup[faceIndex])
    }
  })

  const normalAttr = mesh.geometry.attributes.normal as THREE.BufferAttribute | undefined
  const normalDiversity = normalAttr ? buildNormalDiversityMap(position, normalAttr) : null

  const kept: { a: THREE.Vector3; b: THREE.Vector3 }[] = []
  for (const { a: pa, b: pb, groups } of segments.values()) {
    if (groups.size < 2) continue
    if (normalDiversity) {
      const distinctAtA = normalDiversity.get(keyFor(pa))?.length ?? 2
      const distinctAtB = normalDiversity.get(keyFor(pb))?.length ?? 2
      if (distinctAtA <= 1 && distinctAtB <= 1) continue
    }
    kept.push({ a: pa, b: pb })
  }
  if (kept.length === 0) return null

  const positions = new Float32Array(kept.length * 6)
  let i = 0
  for (const { a: pa, b: pb } of kept) {
    positions[i++] = pa.x
    positions[i++] = pa.y
    positions[i++] = pa.z
    positions[i++] = pb.x
    positions[i++] = pb.y
    positions[i++] = pb.z
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return geometry
}
