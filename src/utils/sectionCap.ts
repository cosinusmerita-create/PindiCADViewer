import * as THREE from 'three'
import earcut from 'earcut'

// Duplicated rather than imported from clippingCap.ts (which imports this
// module to build the cap mesh) purely to avoid a circular import - both
// sides just need to agree on the same userData flag.
function isClipCapMesh(object: THREE.Object3D): boolean {
  return object.userData.isClipCap === true
}

interface Segment {
  a: THREE.Vector3
  b: THREE.Vector3
}

const WELD_EPSILON = 1e-6

function keyFor(v: THREE.Vector3): string {
  const s = 1 / WELD_EPSILON
  return `${Math.round(v.x * s)}_${Math.round(v.y * s)}_${Math.round(v.z * s)}`
}

// For every triangle of every visible, clip-eligible mesh in the model
// (in world space, so parts with their own placement transform are handled
// correctly), finds the segment where the plane actually crosses it - a
// straddling triangle crosses exactly two of its three edges, so linearly
// interpolating along those two gives the one segment of true cut contour
// that triangle contributes.
export function collectPlaneSegments(object: THREE.Object3D, plane: THREE.Plane): Segment[] {
  const segments: Segment[] = []
  const v0 = new THREE.Vector3()
  const v1 = new THREE.Vector3()
  const v2 = new THREE.Vector3()

  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.visible || isClipCapMesh(child)) return
    const geometry = child.geometry
    const position = geometry.attributes.position as THREE.BufferAttribute | undefined
    if (!position) return
    const index = geometry.getIndex()
    const triangleCount = index ? index.count / 3 : position.count / 3
    const matrixWorld = child.matrixWorld

    for (let t = 0; t < triangleCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2
      v0.fromBufferAttribute(position, i0).applyMatrix4(matrixWorld)
      v1.fromBufferAttribute(position, i1).applyMatrix4(matrixWorld)
      v2.fromBufferAttribute(position, i2).applyMatrix4(matrixWorld)

      const d0 = plane.distanceToPoint(v0)
      const d1 = plane.distanceToPoint(v1)
      const d2 = plane.distanceToPoint(v2)

      const crossings: THREE.Vector3[] = []
      if (d0 >= 0 !== d1 >= 0) crossings.push(v0.clone().lerp(v1, d0 / (d0 - d1)))
      if (d1 >= 0 !== d2 >= 0) crossings.push(v1.clone().lerp(v2, d1 / (d1 - d2)))
      if (d2 >= 0 !== d0 >= 0) crossings.push(v2.clone().lerp(v0, d2 / (d2 - d0)))

      if (crossings.length === 2) segments.push({ a: crossings[0], b: crossings[1] })
    }
  })

  return segments
}

// Chains the (unordered, per-triangle) crossing segments into closed loops
// by welding shared endpoints - the same degree-2-chain-walk used for the
// hole/boss loops in edgeAnalysis.ts. A slice through a genuinely closed,
// watertight surface always closes; any chain that doesn't (a topology
// defect in the source tessellation) is simply dropped rather than risking
// a wrong or oversized fill - a small gap in the cap is a far safer failure
// mode than a fill that bleeds past the part's outline.
export function chainSegmentsIntoLoops(segments: Segment[]): THREE.Vector3[][] {
  const pointByKey = new Map<string, THREE.Vector3>()
  const adjacency = new Map<string, string[]>()

  for (const seg of segments) {
    const ak = keyFor(seg.a)
    const bk = keyFor(seg.b)
    if (ak === bk) continue
    if (!pointByKey.has(ak)) pointByKey.set(ak, seg.a)
    if (!pointByKey.has(bk)) pointByKey.set(bk, seg.b)
    if (!adjacency.has(ak)) adjacency.set(ak, [])
    if (!adjacency.has(bk)) adjacency.set(bk, [])
    adjacency.get(ak)!.push(bk)
    adjacency.get(bk)!.push(ak)
  }

  const visited = new Set<string>()
  const loops: THREE.Vector3[][] = []

  for (const startKey of adjacency.keys()) {
    if (visited.has(startKey)) continue
    const startNeighbors = adjacency.get(startKey)!
    if (startNeighbors.length !== 2) {
      visited.add(startKey)
      continue
    }

    const loopKeys: string[] = [startKey]
    const loopSet = new Set<string>([startKey])
    let prev = startKey
    let current = startNeighbors[0]
    let closed = false

    while (true) {
      if (current === startKey) {
        closed = true
        break
      }
      const neighbors = adjacency.get(current)
      if (!neighbors || neighbors.length !== 2 || loopSet.has(current)) break
      loopKeys.push(current)
      loopSet.add(current)
      const next = neighbors[0] === prev ? neighbors[1] : neighbors[0]
      prev = current
      current = next
    }

    for (const k of loopKeys) visited.add(k)
    if (closed && loopKeys.length >= 3) {
      loops.push(loopKeys.map((k) => pointByKey.get(k)!))
    }
  }

  return loops
}

interface Loop2D {
  points3d: THREE.Vector3[]
  points2d: { x: number; y: number }[]
  area: number
}

function pointInPolygon(pt: { x: number; y: number }, ring: { x: number; y: number }[]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const pi = ring[i]
    const pj = ring[j]
    const crosses = pi.y > pt.y !== pj.y > pt.y && pt.x < ((pj.x - pi.x) * (pt.y - pi.y)) / (pj.y - pi.y) + pi.x
    if (crosses) inside = !inside
  }
  return inside
}

// Turns the closed 3D loops into triangles: projects each onto the plane's
// own 2D basis, classifies every loop as either an outer boundary or a hole
// of a larger one already found (by centroid containment, processed largest
// first - correct for the common CAD case of at most one level of nesting,
// e.g. a tube's outer wall with its bore as a hole), then triangulates each
// outer+holes group with earcut, exactly like the reference three.js
// clipping example does with THREE.ShapeGeometry for a single convex plane.
export function triangulateLoops(
  loops: THREE.Vector3[][],
  planeNormal: THREE.Vector3,
  planeOrigin: THREE.Vector3,
): { positions: Float32Array; indices: number[] } | null {
  if (loops.length === 0) return null

  const helper = Math.abs(planeNormal.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const u = new THREE.Vector3().crossVectors(helper, planeNormal).normalize()
  const v = new THREE.Vector3().crossVectors(planeNormal, u).normalize()

  const loops2d: Loop2D[] = loops.map((points3d) => {
    const points2d = points3d.map((p) => {
      const rel = new THREE.Vector3().subVectors(p, planeOrigin)
      return { x: rel.dot(u), y: rel.dot(v) }
    })
    let area = 0
    for (let i = 0; i < points2d.length; i++) {
      const a = points2d[i]
      const b = points2d[(i + 1) % points2d.length]
      area += a.x * b.y - b.x * a.y
    }
    return { points3d, points2d, area: area * 0.5 }
  })

  loops2d.sort((a, b) => Math.abs(b.area) - Math.abs(a.area))

  const groups: { outer: Loop2D; holes: Loop2D[] }[] = []
  for (const loop of loops2d) {
    const centroid = loop.points2d.reduce(
      (acc, p) => ({ x: acc.x + p.x / loop.points2d.length, y: acc.y + p.y / loop.points2d.length }),
      { x: 0, y: 0 },
    )
    const container = groups.find((g) => pointInPolygon(centroid, g.outer.points2d))
    if (container) container.holes.push(loop)
    else groups.push({ outer: loop, holes: [] })
  }

  const positions: number[] = []
  const indices: number[] = []

  for (const group of groups) {
    const flatCoords: number[] = []
    const holeIndices: number[] = []
    const worldPoints: THREE.Vector3[] = []

    for (const { x, y } of group.outer.points2d) flatCoords.push(x, y)
    worldPoints.push(...group.outer.points3d)

    for (const hole of group.holes) {
      holeIndices.push(flatCoords.length / 2)
      for (const { x, y } of hole.points2d) flatCoords.push(x, y)
      worldPoints.push(...hole.points3d)
    }

    const triangles = earcut(flatCoords, holeIndices.length ? holeIndices : null, 2)
    if (triangles.length === 0) continue

    const baseIndex = positions.length / 3
    for (const p of worldPoints) positions.push(p.x, p.y, p.z)
    for (const idx of triangles) indices.push(baseIndex + idx)
  }

  if (indices.length === 0) return null
  return { positions: new Float32Array(positions), indices }
}

// Builds a mesh that exactly hugs the model's true cross-section at `plane`
// (world space), or null if the plane doesn't cross any visible geometry.
// Every vertex gets an explicit uniform normal along the plane rather than
// one computed from the triangulation's winding, since earcut's output
// winding isn't guaranteed to match the plane's own normal direction and a
// MeshStandardMaterial with side:DoubleSide only needs a consistent normal
// to light both faces correctly either way.
export function computeSectionGeometry(object: THREE.Object3D, plane: THREE.Plane): THREE.BufferGeometry | null {
  const segments = collectPlaneSegments(object, plane)
  if (segments.length === 0) return null

  const loops = chainSegmentsIntoLoops(segments)
  if (loops.length === 0) return null

  const planeOrigin = plane.normal.clone().multiplyScalar(-plane.constant)
  const result = triangulateLoops(loops, plane.normal, planeOrigin)
  if (!result) return null

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(result.positions, 3))
  geometry.setIndex(result.indices)

  const normals = new Float32Array(result.positions.length)
  for (let i = 0; i < normals.length; i += 3) {
    normals[i] = plane.normal.x
    normals[i + 1] = plane.normal.y
    normals[i + 2] = plane.normal.z
  }
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

  return geometry
}
