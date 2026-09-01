import * as THREE from 'three'

export interface CylindricalPatch {
  center: THREE.Vector3
  axis: THREE.Vector3
  radius: number
  startAngle: number
  angularSpan: number
  concave: boolean
  // `center` sits at the axial MIDPOINT of the whole patch (its "center of
  // gravity"), which is the wrong point for a rim/diameter measurement on a
  // bore or boss that spans real height. These are the signed offsets
  // (along `axis`, from `center`) of the patch's two ends, letting a caller
  // reconstruct the actual near/far end center instead of the midpoint.
  axialMin: number
  axialMax: number
}

export interface PatchData {
  patches: CylindricalPatch[]
  // Face index -> index into `patches`, or -1 if that face isn't part of
  // any detected cylindrical patch. Lets hover be an O(1) lookup instead of
  // re-analyzing neighboring triangles on every mouse move.
  facePatch: Int32Array
}

const SMOOTH_ANGLE_THRESHOLD = 15 * (Math.PI / 180)
const MIN_PATCH_FACES = 8
const MIN_ANGULAR_SPAN = 8 * (Math.PI / 180)
const MAX_FIT_SAMPLES = 80
const RADIUS_TOLERANCE = 0.02
const FULL_CIRCLE_SPAN = 350 * (Math.PI / 180)
// A pair of near-parallel normals gives a numerically unstable radius
// estimate (the fit divides by |N_i - N_j|^2, so noise near zero explodes
// into wild outliers) even though it's nowhere near mathematically
// degenerate - excluding low-separation pairs outright is more reliable
// than trying to filter the resulting outliers back out afterwards.
const MIN_PAIR_ANGLE = 3 * (Math.PI / 180)

interface FaceInfo {
  normal: THREE.Vector3
  centroid: THREE.Vector3
}

function edgeKey(a: number, b: number): string {
  return a < b ? `${a}_${b}` : `${b}_${a}`
}

const WELD_EPSILON = 1e-5

// occt-import-js doesn't weld vertices across a curved BREP face's own
// tessellation seam (e.g. where a cylinder's parametrization wraps back to
// its start): triangles on either side are geometrically touching but use
// different vertex indices, so plain index-based adjacency sees a false
// boundary there and a genuinely full 360° cylinder fragments into several
// disconnected ~170° regions. Building a position-based "welded" index
// first (quantized to merge near-duplicate vertices) reunites those seams
// before adjacency is built, so one physical cylinder stays one region.
function buildWeldedIndices(position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Int32Array {
  const welded = new Int32Array(position.count)
  const seen = new Map<string, number>()
  const scale = 1 / WELD_EPSILON

  for (let i = 0; i < position.count; i++) {
    const key = `${Math.round(position.getX(i) * scale)}_${Math.round(position.getY(i) * scale)}_${Math.round(position.getZ(i) * scale)}`
    const existing = seen.get(key)
    if (existing !== undefined) {
      welded[i] = existing
    } else {
      seen.set(key, i)
      welded[i] = i
    }
  }

  return welded
}

// Groups the mesh's triangles into "smooth" regions - connected components
// where every pair of adjacent faces bends less than the same 15° angle
// three.js's own EdgesGeometry uses to decide what counts as a visible
// feature edge. A cylindrical surface (a bore, a shaft, a fillet) tessellates
// into exactly one such region regardless of how big it is, which is what
// makes this scale-independent: no fixed search radius to get wrong for a
// huge boss vs. a tiny hole.
function buildSmoothRegions(
  index: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  faces: FaceInfo[],
): number[][] {
  const triangleCount = faces.length
  const welded = buildWeldedIndices(position)
  const edgeToFaces = new Map<string, number[]>()

  for (let t = 0; t < triangleCount; t++) {
    const i0 = welded[index.getX(t * 3)]
    const i1 = welded[index.getX(t * 3 + 1)]
    const i2 = welded[index.getX(t * 3 + 2)]
    for (const [a, b] of [
      [i0, i1],
      [i1, i2],
      [i2, i0],
    ]) {
      const key = edgeKey(a, b)
      const list = edgeToFaces.get(key)
      if (list) list.push(t)
      else edgeToFaces.set(key, [t])
    }
  }

  const adjacency: number[][] = Array.from({ length: triangleCount }, () => [])
  for (const facesOnEdge of edgeToFaces.values()) {
    if (facesOnEdge.length !== 2) continue
    const [fa, fb] = facesOnEdge
    if (faces[fa].normal.angleTo(faces[fb].normal) < SMOOTH_ANGLE_THRESHOLD) {
      adjacency[fa].push(fb)
      adjacency[fb].push(fa)
    }
  }

  const visited = new Uint8Array(triangleCount)
  const regions: number[][] = []
  const stack: number[] = []

  for (let start = 0; start < triangleCount; start++) {
    if (visited[start]) continue
    const region: number[] = []
    stack.push(start)
    visited[start] = 1
    while (stack.length) {
      const current = stack.pop()!
      region.push(current)
      for (const neighbor of adjacency[current]) {
        if (!visited[neighbor]) {
          visited[neighbor] = 1
          stack.push(neighbor)
        }
      }
    }
    regions.push(region)
  }

  return regions
}

function fitPatch(faceIndices: number[], faces: FaceInfo[]): CylindricalPatch | null {
  if (faceIndices.length < MIN_PATCH_FACES) return null

  // Bound the fit cost for very large patches (a whole big cylinder can be
  // thousands of triangles) by sampling an even stride through the region.
  const stride = Math.max(1, Math.floor(faceIndices.length / MAX_FIT_SAMPLES))
  const samples: FaceInfo[] = []
  for (let i = 0; i < faceIndices.length; i += stride) samples.push(faces[faceIndices[i]])

  const avgNormal = new THREE.Vector3()
  for (const s of samples) avgNormal.add(s.normal)
  avgNormal.normalize()
  const maxSpread = Math.max(...samples.map((s) => s.normal.angleTo(avgNormal)))
  if (maxSpread < MIN_ANGULAR_SPAN) return null // essentially flat

  const radii: number[] = []
  const axisAccumulator = new THREE.Vector3()
  let axisReference: THREE.Vector3 | null = null

  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      const ni = samples[i].normal
      const nj = samples[j].normal
      if (ni.angleTo(nj) < MIN_PAIR_ANGLE) continue
      const diffN = new THREE.Vector3().subVectors(ni, nj)
      const diffNLenSq = diffN.lengthSq()

      // Signed, not clamped to positive: a convex surface (a shaft, a
      // boss) has its outward normal pointing away from the axis, same
      // direction as the point itself relative to center, so this comes
      // out positive - but a concave one (a bore's inner wall) has its
      // outward-from-material normal pointing back IN toward the axis,
      // the opposite direction, so the exact same formula comes out
      // negative there. Discarding negative results here used to reject
      // every single sample pair for any bore/hole, since normal-from-
      // computeVertexNormals always faces outward from the solid - never
      // fitting a patch for one at all. The sign is kept (not abs'd) all
      // the way through median below, since it's what makes the axis-point
      // step-back direction come out right for either case; only the
      // final reported radius takes the magnitude.
      const diffP = new THREE.Vector3().subVectors(samples[i].centroid, samples[j].centroid)
      const r = diffP.dot(diffN) / diffNLenSq
      if (r !== 0) radii.push(r)

      const axisCandidate = new THREE.Vector3().crossVectors(ni, nj)
      if (axisCandidate.lengthSq() < 1e-8) continue
      axisCandidate.normalize()
      if (!axisReference) axisReference = axisCandidate.clone()
      else if (axisCandidate.dot(axisReference) < 0) axisCandidate.negate()
      axisAccumulator.add(axisCandidate)
    }
  }

  if (radii.length < 5 || axisAccumulator.lengthSq() < 1e-8) return null

  // Median + median-absolute-deviation rather than mean/stddev: a handful
  // of pairs can still land close enough to MIN_PAIR_ANGLE to produce a
  // wild outlier, and MAD is unaffected by a few of those in a way a
  // variance-based measure isn't.
  radii.sort((a, b) => a - b)
  const median = radii[Math.floor(radii.length / 2)]
  if (median === 0) return null
  const deviations = radii.map((r) => Math.abs(r - median)).sort((a, b) => a - b)
  const mad = deviations[Math.floor(deviations.length / 2)]
  if (mad / Math.abs(median) > RADIUS_TOLERANCE * 5) return null

  const axis = axisAccumulator.normalize()

  // A point on the axis: for a true cylinder, stepping back from any
  // surface sample by `radius` along its own normal lands on the axis -
  // average that over the samples for a stable estimate.
  const axisPoint = new THREE.Vector3()
  for (const s of samples) axisPoint.addScaledVector(s.centroid.clone().addScaledVector(s.normal, -median), 1)
  axisPoint.divideScalar(samples.length)
  // Re-center onto the axis line itself (remove any component of the
  // average that drifted along the axis direction from sample to sample).
  const reference = samples[0].centroid.clone().addScaledVector(samples[0].normal, -median)
  const center = reference.clone().addScaledVector(axis, axisPoint.clone().sub(reference).dot(axis))

  const helper = Math.abs(axis.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const u = new THREE.Vector3().crossVectors(helper, axis).normalize()
  const v = new THREE.Vector3().crossVectors(axis, u).normalize()

  const angles = samples
    .map((s) => {
      const rel = new THREE.Vector3().subVectors(s.centroid, center)
      const inPlane = rel.sub(axis.clone().multiplyScalar(rel.dot(axis)))
      if (inPlane.lengthSq() < 1e-12) return null
      return Math.atan2(inPlane.dot(v), inPlane.dot(u))
    })
    .filter((a): a is number => a !== null)
    .map((a) => (a < 0 ? a + Math.PI * 2 : a))
    .sort((a, b) => a - b)

  if (angles.length < 3) return null

  let axialMin = Infinity
  let axialMax = -Infinity
  for (const s of samples) {
    const t = s.centroid.clone().sub(center).dot(axis)
    if (t < axialMin) axialMin = t
    if (t > axialMax) axialMax = t
  }

  let largestGap = 0
  let gapStart = 0
  for (let i = 0; i < angles.length; i++) {
    const next = angles[(i + 1) % angles.length]
    const gap = i === angles.length - 1 ? angles[0] + Math.PI * 2 - angles[i] : next - angles[i]
    if (gap > largestGap) {
      largestGap = gap
      gapStart = i
    }
  }
  const angularSpan = Math.PI * 2 - largestGap
  const startAngle = angles[(gapStart + 1) % angles.length]

  let inward = 0
  for (const s of samples) {
    const toAxis = center.clone().addScaledVector(axis, s.centroid.clone().sub(center).dot(axis)).sub(s.centroid)
    if (toAxis.dot(s.normal) > 0) inward++
  }

  return {
    center,
    axis,
    radius: Math.abs(median),
    startAngle,
    angularSpan: Math.min(angularSpan, Math.PI * 2),
    concave: inward > samples.length / 2,
    axialMin,
    axialMax,
  }
}

// A single B-Rep face - straight from OpenCascade via occt-import-js's
// brep_faces table (see step.worker.js) - is by construction exactly one
// underlying analytic surface, so its triangle range is a far more reliable
// region source than smoothness-angle flood-fill: no tessellation-seam
// fragmentation to weld back together (the whole point of
// buildWeldedIndices below), and no risk of merging two genuinely different
// faces that happen to meet at a shallow angle. STL/OBJ meshes carry no
// such table (they were never a B-Rep to begin with), so they fall back to
// the flood-fill approach.
function regionsFromBrepFaces(brepFaces: { first: number; last: number }[]): number[][] {
  return brepFaces.map(({ first, last }) => {
    const region: number[] = []
    for (let t = first; t <= last; t++) region.push(t)
    return region
  })
}

// Perpendicular distance from `point` to the infinite line through `center`
// along `axis`.
function distanceToAxisLine(point: THREE.Vector3, center: THREE.Vector3, axis: THREE.Vector3): number {
  const rel = point.clone().sub(center)
  const along = rel.dot(axis)
  return rel.addScaledVector(axis, -along).length()
}

// A real STEP file frequently represents one physically continuous
// cylinder (a bore, a shaft) as TWO separate B-Rep faces split along its
// own seam - verified empirically against the test assembly used
// throughout this codebase (as1-oc-214.stp): every bolt's head and shaft
// each come in as a *pair* of ~177-179° half-cylinder brep_faces sharing
// one radius, axis and center, rather than one ~360° face. Left unmerged,
// each half reads as a fillet-sized arc ("R 7.5mm") instead of the full
// bore/shaft it actually is ("⌀ 15mm"), which is exactly backwards for the
// primary case this whole detector exists for. So brep_faces-derived
// regions get one extra pass: any two whose independently-fitted patches
// share a radius and an axis line are the same physical cylinder and get
// merged (triangles unioned, then refit as one), repeated until no more
// pairs match.
function mergeCoincidentCylinderRegions(regions: number[][], faces: FaceInfo[]): number[][] {
  interface Candidate {
    region: number[]
    patch: CylindricalPatch | null
  }
  const candidates: Candidate[] = regions.map((region) => ({ region, patch: fitPatch(region, faces) }))

  let mergedAny = true
  while (mergedAny) {
    mergedAny = false
    for (let i = 0; i < candidates.length && !mergedAny; i++) {
      const a = candidates[i]
      if (!a.patch) continue
      for (let j = i + 1; j < candidates.length; j++) {
        const b = candidates[j]
        if (!b.patch) continue
        const axisAligned = Math.abs(a.patch.axis.dot(b.patch.axis)) > 0.999
        const radiusMatches = Math.abs(a.patch.radius - b.patch.radius) / a.patch.radius < RADIUS_TOLERANCE * 3
        if (!axisAligned || !radiusMatches) continue
        if (distanceToAxisLine(b.patch.center, a.patch.center, a.patch.axis) > a.patch.radius * 0.05) continue

        const combinedRegion = [...a.region, ...b.region]
        candidates[i] = { region: combinedRegion, patch: fitPatch(combinedRegion, faces) }
        candidates.splice(j, 1)
        mergedAny = true
        break
      }
    }
  }

  return candidates.map((c) => c.region)
}

export function analyzeSurfacePatches(mesh: THREE.Mesh): PatchData {
  const geometry = mesh.geometry
  const position = geometry.attributes.position
  const index = geometry.getIndex()
  if (!position || !index) return { patches: [], facePatch: new Int32Array(0) }

  const triangleCount = index.count / 3
  const faces: FaceInfo[] = new Array(triangleCount)
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()

  for (let t = 0; t < triangleCount; t++) {
    const i0 = index.getX(t * 3)
    const i1 = index.getX(t * 3 + 1)
    const i2 = index.getX(t * 3 + 2)
    a.fromBufferAttribute(position, i0)
    b.fromBufferAttribute(position, i1)
    c.fromBufferAttribute(position, i2)
    const normal = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize()
    const centroid = a.clone().add(b).add(c).divideScalar(3)
    faces[t] = { normal, centroid }
  }

  const brepFaces = mesh.userData.brepFaces as { first: number; last: number }[] | undefined
  const regions =
    brepFaces && brepFaces.length > 0
      ? mergeCoincidentCylinderRegions(regionsFromBrepFaces(brepFaces), faces)
      : buildSmoothRegions(index, position, faces)
  const patches: CylindricalPatch[] = []
  const facePatch = new Int32Array(triangleCount).fill(-1)

  for (const region of regions) {
    const patch = fitPatch(region, faces)
    if (!patch) continue
    const patchIndex = patches.length
    patches.push(patch)
    for (const faceIndex of region) facePatch[faceIndex] = patchIndex
  }

  return { patches, facePatch }
}

export function isFullCircle(angularSpan: number): boolean {
  return angularSpan >= FULL_CIRCLE_SPAN
}
