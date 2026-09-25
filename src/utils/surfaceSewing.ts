import type { ParsedStep } from './stepLoader'

// IGES files usually carry a solid as loose trimmed surfaces (SOLIDWORKS'
// default IGES export does): OpenCascade then returns one mesh per face,
// each with its own arbitrary orientation. Shown as-is, a single part would
// appear as N "parts" in the tree, and inconsistent winding breaks everything
// that relies on a closed, outward-facing surface (section caps, volume,
// 3D-print splitting, collision).
//
// This "sews" them for display: faces that share edges are grouped into one
// body, triangle winding is made consistent across shared edges (flood fill
// over edge adjacency) and each closed body is turned outward (positive
// signed volume). Vertices are only welded *logically* (by rounded position)
// to find adjacency - the vertex arrays are kept as read, so sharp edges keep
// their per-face normals. Each original face stays a brepFaces range of its
// body, so face picking still selects the true CAD face.

interface FaceRef {
  mesh: number // index into parsed.meshes
}

export function sewSurfaces(parsed: ParsedStep, fileName: string): ParsedStep {
  const meshes = parsed.meshes
  if (meshes.length < 2) return parsed

  // Weld tolerance relative to the model size (positions are in mm).
  let span = 0
  for (const m of meshes) {
    for (let i = 0; i < m.position.length; i++) span = Math.max(span, Math.abs(m.position[i]))
  }
  const tol = Math.max(span * 1e-6, 1e-6)
  const key = (x: number, y: number, z: number) =>
    `${Math.round(x / tol)},${Math.round(y / tol)},${Math.round(z / tol)}`

  // Global triangle list with welded vertex ids.
  const weld = new Map<string, number>()
  const triFace: number[] = []
  const triLocal: number[] = [] // triangle index inside its face mesh
  const triVerts: [number, number, number][] = []
  meshes.forEach((m, f) => {
    const vid: number[] = []
    for (let i = 0; i < m.position.length; i += 3) {
      const k = key(m.position[i], m.position[i + 1], m.position[i + 2])
      let id = weld.get(k)
      if (id === undefined) {
        id = weld.size
        weld.set(k, id)
      }
      vid.push(id)
    }
    for (let t = 0; t < m.index.length; t += 3) {
      triFace.push(f)
      triLocal.push(t / 3)
      triVerts.push([vid[m.index[t]], vid[m.index[t + 1]], vid[m.index[t + 2]]])
    }
  })

  // Directed edge -> triangles, to find neighbours and compare winding.
  const edgeKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`)
  const edges = new Map<string, number[]>()
  triVerts.forEach((v, t) => {
    for (let j = 0; j < 3; j++) {
      const k = edgeKey(v[j], v[(j + 1) % 3])
      const list = edges.get(k)
      if (list) list.push(t)
      else edges.set(k, [t])
    }
  })
  const directed = (t: number, a: number, b: number) => {
    const v = triVerts[t]
    for (let j = 0; j < 3; j++) if (v[j] === a && v[(j + 1) % 3] === b) return true
    return false
  }

  // Flood fill: body id + flip flag per triangle.
  const body = new Int32Array(triVerts.length).fill(-1)
  const flip = new Uint8Array(triVerts.length)
  let bodies = 0
  for (let seed = 0; seed < triVerts.length; seed++) {
    if (body[seed] !== -1) continue
    body[seed] = bodies
    const stack = [seed]
    while (stack.length) {
      const t = stack.pop()!
      const v = triVerts[t]
      for (let j = 0; j < 3; j++) {
        // Edge a->b as t is *displayed* (after its own flip).
        let a = v[j]
        let b = v[(j + 1) % 3]
        if (flip[t]) [a, b] = [b, a]
        for (const n of edges.get(edgeKey(a, b)) ?? []) {
          if (n === t || body[n] !== -1) continue
          body[n] = bodies
          // Consistent winding: the neighbour must run the shared edge b->a.
          flip[n] = directed(n, a, b) ? 1 : 0
          stack.push(n)
        }
      }
    }
    bodies++
  }

  // Per original face, the majority decision (faces are consistent inside),
  // and per body the sign of the enclosed volume.
  const faceBody = new Int32Array(meshes.length).fill(-1)
  const faceFlipVotes = new Int32Array(meshes.length)
  triVerts.forEach((_, t) => {
    faceBody[triFace[t]] = body[t]
    faceFlipVotes[triFace[t]] += flip[t] ? 1 : -1
  })
  const faceFlip = (f: number) => faceFlipVotes[f] > 0

  const signedVolume = new Float64Array(bodies)
  meshes.forEach((m, f) => {
    const s = faceFlip(f) ? -1 : 1
    const p = m.position
    for (let t = 0; t < m.index.length; t += 3) {
      const a = m.index[t] * 3
      const b = m.index[t + 1] * 3
      const c = m.index[t + 2] * 3
      signedVolume[faceBody[f]] +=
        (s *
          (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
            p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
            p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]))) /
        6
    }
  })

  // Rebuild: one mesh per body, faces concatenated as brepFaces ranges.
  const out: ParsedStep['meshes'] = []
  for (let bi = 0; bi < bodies; bi++) {
    const faces: FaceRef[] = []
    meshes.forEach((_, f) => {
      if (faceBody[f] === bi) faces.push({ mesh: f })
    })
    if (faces.length === 0) continue
    const outward = signedVolume[bi] < 0 ? -1 : 1 // flip the whole body inward -> outward
    let vCount = 0
    let iCount = 0
    for (const { mesh } of faces) {
      vCount += meshes[mesh].position.length
      iCount += meshes[mesh].index.length
    }
    const position = new Float32Array(vCount)
    const normal = new Float32Array(vCount)
    const index = new Uint32Array(iCount)
    const brepFaces: { first: number; last: number }[] = []
    let vOff = 0
    let iOff = 0
    for (const { mesh } of faces) {
      const m = meshes[mesh]
      const reverse = (faceFlip(mesh) ? -1 : 1) * outward < 0
      position.set(m.position, vOff)
      if (m.normal) {
        for (let i = 0; i < m.normal.length; i++) normal[vOff + i] = reverse ? -m.normal[i] : m.normal[i]
      }
      const base = vOff / 3
      const firstTri = iOff / 3
      for (let t = 0; t < m.index.length; t += 3) {
        const [a, b, c] = [m.index[t], m.index[t + 1], m.index[t + 2]]
        index[iOff++] = base + a
        index[iOff++] = base + (reverse ? c : b)
        index[iOff++] = base + (reverse ? b : c)
      }
      brepFaces.push({ first: firstTri, last: iOff / 3 - 1 })
      vOff += m.position.length
    }
    out.push({
      name: bodies === 1 ? fileName : `Corps ${out.length + 1}`,
      color: null,
      position,
      normal: meshes.every((m) => m.normal) ? normal : null,
      index,
      brepFaces,
    })
  }

  return {
    meshes: out,
    root: out.length === 1 ? null : { name: fileName, meshes: out.map((_, i) => i), children: [] },
  }
}
