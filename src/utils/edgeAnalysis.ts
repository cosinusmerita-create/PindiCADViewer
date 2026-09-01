import * as THREE from 'three'
import { analyzeSurfacePatches, type PatchData } from './surfacePatches'
import { computeBrepEdgesGeometry } from './brepEdges'

export interface EdgeSegment {
  a: THREE.Vector3
  b: THREE.Vector3
}

export interface DetectedCircle {
  center: THREE.Vector3
  radius: number
  normal: THREE.Vector3
}

export interface MeshEdgeData {
  segments: EdgeSegment[]
  circles: DetectedCircle[]
  surfacePatches: PatchData
}

const EDGE_ANGLE_THRESHOLD = 15
const VERTEX_MERGE_EPSILON = 1e-5
const CIRCLE_RADIUS_TOLERANCE = 0.02
const MIN_LOOP_SIZE = 6

function keyFor(v: THREE.Vector3): string {
  const s = 1 / VERTEX_MERGE_EPSILON
  return `${Math.round(v.x * s)}_${Math.round(v.y * s)}_${Math.round(v.z * s)}`
}

// Newell's method: a robust plane normal for a near-planar ordered polygon,
// tolerant of tessellation noise (unlike a 3-point cross product).
function newellNormal(points: THREE.Vector3[]): THREE.Vector3 | null {
  const n = new THREE.Vector3()
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    const q = points[(i + 1) % points.length]
    n.x += (p.y - q.y) * (p.z + q.z)
    n.y += (p.z - q.z) * (p.x + q.x)
    n.z += (p.x - q.x) * (p.y + q.y)
  }
  if (n.lengthSq() < 1e-12) return null
  return n.normalize()
}

// Algebraic (Kasa) least-squares circle fit of an ordered, near-planar loop.
// Rejects anything whose points aren't actually close to constant radius
// (e.g. a rectangular hole's boundary, which forms a closed loop too but
// isn't remotely circular) or close to the fitted plane.
function fitCircle(points: THREE.Vector3[]): DetectedCircle | null {
  if (points.length < MIN_LOOP_SIZE) return null

  const centroid = new THREE.Vector3()
  for (const p of points) centroid.add(p)
  centroid.divideScalar(points.length)

  const normal = newellNormal(points)
  if (!normal) return null

  const helper = Math.abs(normal.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const u = new THREE.Vector3().crossVectors(helper, normal).normalize()
  const v = new THREE.Vector3().crossVectors(normal, u).normalize()

  let maxPlaneDeviation = 0
  const coords2d: { x: number; y: number }[] = []
  for (const p of points) {
    const rel = new THREE.Vector3().subVectors(p, centroid)
    maxPlaneDeviation = Math.max(maxPlaneDeviation, Math.abs(rel.dot(normal)))
    coords2d.push({ x: rel.dot(u), y: rel.dot(v) })
  }

  let sumX = 0
  let sumY = 0
  let sumXX = 0
  let sumYY = 0
  let sumXY = 0
  let sumXXX = 0
  let sumYYY = 0
  let sumXYY = 0
  let sumXXY = 0
  const n = coords2d.length
  for (const { x, y } of coords2d) {
    sumX += x
    sumY += y
    sumXX += x * x
    sumYY += y * y
    sumXY += x * y
    sumXXX += x * x * x
    sumYYY += y * y * y
    sumXYY += x * y * y
    sumXXY += x * x * y
  }

  const A = n * sumXX - sumX * sumX
  const B = n * sumXY - sumX * sumY
  const C = n * sumYY - sumY * sumY
  const D = 0.5 * (n * sumXYY - sumX * sumYY + n * sumXXX - sumX * sumXX)
  const E = 0.5 * (n * sumXXY - sumY * sumXX + n * sumYYY - sumY * sumYY)
  const denom = A * C - B * B
  if (Math.abs(denom) < 1e-9) return null

  const cx = (D * C - B * E) / denom
  const cy = (A * E - B * D) / denom

  let sumR = 0
  const radii: number[] = []
  for (const { x, y } of coords2d) {
    const r = Math.hypot(x - cx, y - cy)
    radii.push(r)
    sumR += r
  }
  const meanRadius = sumR / n
  if (meanRadius < 1e-6) return null

  let maxDeviation = 0
  for (const r of radii) maxDeviation = Math.max(maxDeviation, Math.abs(r - meanRadius))

  if (maxDeviation / meanRadius > CIRCLE_RADIUS_TOLERANCE) return null
  if (maxPlaneDeviation / meanRadius > CIRCLE_RADIUS_TOLERANCE * 2) return null

  const center = centroid.clone().addScaledVector(u, cx).addScaledVector(v, cy)
  return { center, radius: meanRadius, normal }
}

// At a branch (degree > 2), picks whichever neighbor keeps the walk
// heading in roughly the same direction it was already going - the same
// "continue straight through" disambiguation curve-network extraction
// normally uses at a T-junction. Real B-Rep boundary graphs aren't always
// purely degree-2: a small chamfer or fillet right at a hole's rim adds a
// short extra edge exactly where the rim's own loop passes, so the vertex
// there is genuinely degree 3 even though the rim itself is still a clean
// circle - failing outright the moment ANY branch is touched (the simpler
// alternative) would silently lose that rim's circle entirely rather than
// just correctly excluding the chamfer's own tiny spur from it. Returns
// null (a real ambiguity, not a "continue straight" call) when no
// candidate stays within 45° of the incoming heading.
function pickStraightContinuation(
  prevPoint: THREE.Vector3,
  currentPoint: THREE.Vector3,
  currentKey: string,
  neighbors: string[],
  excludeKey: string,
  vertexKeyToPoint: Map<string, THREE.Vector3>,
): string | null {
  const incoming = new THREE.Vector3().subVectors(currentPoint, prevPoint).normalize()
  let best: string | null = null
  let bestDot = 0.7 // ~45 degrees - anything less "straight" is a real ambiguity, not a spur
  for (const key of neighbors) {
    if (key === excludeKey || key === currentKey) continue
    const point = vertexKeyToPoint.get(key)
    if (!point) continue
    const outgoing = new THREE.Vector3().subVectors(point, currentPoint).normalize()
    const dot = incoming.dot(outgoing)
    if (dot > bestDot) {
      bestDot = dot
      best = key
    }
  }
  return best
}

// Walks a chain back to its start, following the "straight through" branch
// at any T-junction it meets along the way (see pickStraightContinuation).
// Returns the ordered loop of vertex keys if it closes cleanly; null for a
// dead end or a branch with no clear straight continuation - marking every
// vertex it touched as visited either way, so each chain is only ever
// attempted once.
function traceLoop(
  startKey: string,
  adjacency: Map<string, string[]>,
  vertexKeyToPoint: Map<string, THREE.Vector3>,
  visited: Set<string>,
): string[] | null {
  // The start itself is never disambiguated (there's no incoming direction
  // yet to judge "straight" against) - only requires a plain degree-2
  // vertex, which findCircles has plenty of to try even on a loop that
  // touches a branch elsewhere.
  const startNeighbors = adjacency.get(startKey)
  if (!startNeighbors || startNeighbors.length !== 2) {
    visited.add(startKey)
    return null
  }

  const loop: string[] = [startKey]
  const loopSet = new Set<string>([startKey])
  let prev = startKey
  let current = startNeighbors[0]

  while (current !== startKey) {
    if (loopSet.has(current)) {
      for (const k of loop) visited.add(k)
      visited.add(current)
      return null
    }

    const neighbors = adjacency.get(current)
    if (!neighbors || neighbors.length < 2) {
      for (const k of loop) visited.add(k)
      if (current) visited.add(current)
      return null
    }

    loop.push(current)
    loopSet.add(current)

    let next: string | null
    if (neighbors.length === 2) {
      next = neighbors[0] === prev ? neighbors[1] : neighbors[0]
    } else {
      const prevPoint = vertexKeyToPoint.get(prev)
      const currentPoint = vertexKeyToPoint.get(current)
      next =
        prevPoint && currentPoint
          ? pickStraightContinuation(prevPoint, currentPoint, current, neighbors, prev, vertexKeyToPoint)
          : null
    }

    if (!next) {
      for (const k of loop) visited.add(k)
      return null
    }

    prev = current
    current = next
  }

  for (const k of loop) visited.add(k)
  return loop
}

function findCircles(segments: EdgeSegment[]): DetectedCircle[] {
  const vertexKeyToPoint = new Map<string, THREE.Vector3>()
  const adjacency = new Map<string, string[]>()

  for (const seg of segments) {
    const ak = keyFor(seg.a)
    const bk = keyFor(seg.b)
    if (!vertexKeyToPoint.has(ak)) vertexKeyToPoint.set(ak, seg.a)
    if (!vertexKeyToPoint.has(bk)) vertexKeyToPoint.set(bk, seg.b)
    if (!adjacency.has(ak)) adjacency.set(ak, [])
    if (!adjacency.has(bk)) adjacency.set(bk, [])
    adjacency.get(ak)!.push(bk)
    adjacency.get(bk)!.push(ak)
  }

  const visited = new Set<string>()
  const circles: DetectedCircle[] = []

  for (const startKey of adjacency.keys()) {
    if (visited.has(startKey)) continue
    const loop = traceLoop(startKey, adjacency, vertexKeyToPoint, visited)
    if (loop && loop.length >= MIN_LOOP_SIZE) {
      const points = loop.map((k) => vertexKeyToPoint.get(k)!)
      const circle = fitCircle(points)
      if (circle) circles.push(circle)
    }
  }

  return circles
}

// Extracts feature-edge segments and identifies which closed loops among
// them are circles, plus (see surfacePatches.ts) which smoothly-curved
// regions of the surface itself are cylindrical - covering hole/boss rims
// found from their edges and open curved surfaces (a shaft's middle, a
// boss's outer diameter) found from their faces alike. Everything is in the
// mesh's own local space.
//
// The segments themselves come from the real B-Rep face topology when it's
// available (see brepEdges.ts - the same source the shaded-edges/wireframe
// display modes use), not an angle threshold: a hole's rim or a fillet's
// boundary is a genuine edge in the source STEP model regardless of how
// smooth the transition looks locally, which an angle threshold can miss
// entirely for a tangent (G1) transition. STL/OBJ meshes have no B-Rep face
// table to derive that from, so they fall back to the angle-threshold
// approach, same as before.
export function analyzeMeshEdges(mesh: THREE.Mesh): MeshEdgeData {
  const edgesGeometry = computeBrepEdgesGeometry(mesh) ?? new THREE.EdgesGeometry(mesh.geometry, EDGE_ANGLE_THRESHOLD)
  const position = edgesGeometry.attributes.position
  const segments: EdgeSegment[] = []

  for (let i = 0; i < position.count; i += 2) {
    segments.push({
      a: new THREE.Vector3().fromBufferAttribute(position, i),
      b: new THREE.Vector3().fromBufferAttribute(position, i + 1),
    })
  }
  edgesGeometry.dispose()

  return {
    segments,
    circles: findCircles(segments),
    surfacePatches: analyzeSurfacePatches(mesh),
  }
}
