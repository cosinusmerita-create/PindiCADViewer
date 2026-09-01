import * as THREE from 'three'
import { isFullCircle } from './surfacePatches'
import type { DetectedCircle, EdgeSegment, MeshEdgeData } from './edgeAnalysis'

export type SnapType = 'vertex' | 'midpoint' | 'edge' | 'circle'
export type PointerKind = 'mouse' | 'touch'

export interface SnapCircle {
  center: THREE.Vector3
  radius: number
  normal: THREE.Vector3
  // A hole/boss rim (detected from its boundary edge loop) is always a full
  // circle. A bare curved surface (detected from face curvature - the
  // middle of a shaft, a fillet) carries the actual arc it covers, so a
  // partial band can be labelled "R" instead of "⌀".
  startAngle: number
  angularSpan: number
}

export interface SnapResult {
  type: SnapType
  point: THREE.Vector3
  segmentStart: THREE.Vector3 | null
  segmentEnd: THREE.Vector3 | null
  // The full length of the edge/segment this snap landed on, when known -
  // lets a hover preview show "L = XX.XX mm" without the caller having to
  // recompute it from segmentStart/segmentEnd itself.
  length: number | null
  circle: SnapCircle | null
}

const VERTEX_PIXEL_THRESHOLD = 5
const EDGE_PIXEL_THRESHOLD = 3
const CIRCLE_PIXEL_THRESHOLD = 6
// Touch input has no hover and a fingertip is far coarser than a mouse
// cursor, so every screen-space threshold gets its own, much wider,
// touch-specific value (20-25px) instead of just scaling the mouse ones.
const VERTEX_TOUCH_THRESHOLD = 25
const EDGE_TOUCH_THRESHOLD = 22
const CIRCLE_TOUCH_THRESHOLD = 28

function closestPointOnSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  const ab = new THREE.Vector3().subVectors(b, a)
  const lengthSq = ab.lengthSq()
  if (lengthSq < 1e-12) return a.clone()
  const t = THREE.MathUtils.clamp(new THREE.Vector3().subVectors(p, a).dot(ab) / lengthSq, 0, 1)
  return a.clone().addScaledVector(ab, t)
}

function projectToScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  width: number,
  height: number,
): { x: number; y: number } | null {
  const ndc = point.clone().project(camera)
  if (ndc.z > 1 || ndc.z < -1) return null
  return { x: ((ndc.x + 1) / 2) * width, y: ((1 - ndc.y) / 2) * height }
}

function closestPointOnCircle(point: THREE.Vector3, circle: DetectedCircle): THREE.Vector3 | null {
  const rel = new THREE.Vector3().subVectors(point, circle.center)
  const inPlane = rel.clone().sub(circle.normal.clone().multiplyScalar(rel.dot(circle.normal)))
  if (inPlane.lengthSq() < 1e-12) return null
  return circle.center.clone().addScaledVector(inPlane.normalize(), circle.radius)
}

// A point that lands within a circle's own disk (near its plane, and
// within its radius of the axis) even though it's nowhere near the rim
// itself - clicking the flat bottom of a blind hole, or anywhere on a face
// inside a bore's rim, rather than exactly on its boundary edge.
function pointInCircleDisk(
  point: THREE.Vector3,
  center: THREE.Vector3,
  normal: THREE.Vector3,
  radius: number,
  planeTolerance: number,
): boolean {
  const rel = new THREE.Vector3().subVectors(point, center)
  const alongNormal = rel.dot(normal)
  if (Math.abs(alongNormal) > planeTolerance) return false
  const inPlaneDistSq = rel.lengthSq() - alongNormal * alongNormal
  return inPlaneDistSq <= radius * radius
}

// Finds the nearest snap-worthy feature to the cursor, measured in screen
// pixels so the snap distance stays consistent regardless of zoom. Priority:
// hole/boss rim circle > vertex > midpoint > plain edge point > bare curved
// surface (a shaft's middle, a boss's outer diameter, a fillet - detected
// from face curvature rather than an edge, see surfacePatches.ts) > a known
// circle whose disk the point simply falls inside (clicking the middle of a
// hole rather than its rim). Edge-based features win when the cursor is
// genuinely near one; everything past the raycasted face itself is only a
// fallback once none of those match, exactly like SolidWorks favors a
// precise edge over the open face behind it.
export function findSnap(
  mesh: THREE.Mesh,
  edgeData: MeshEdgeData,
  hitPointWorld: THREE.Vector3,
  faceIndex: number | undefined,
  camera: THREE.Camera,
  cursorX: number,
  cursorY: number,
  canvasWidth: number,
  canvasHeight: number,
  pointerKind: PointerKind = 'mouse',
): SnapResult | null {
  const localPoint = mesh.worldToLocal(hitPointWorld.clone())
  const geometry = mesh.geometry
  if (!geometry.boundingSphere) geometry.computeBoundingSphere()
  const searchRadius = Math.max((geometry.boundingSphere?.radius || 1) * 0.15, 1e-6)
  const isTouch = pointerKind === 'touch'
  const vertexThreshold = isTouch ? VERTEX_TOUCH_THRESHOLD : VERTEX_PIXEL_THRESHOLD
  const edgeThreshold = isTouch ? EDGE_TOUCH_THRESHOLD : EDGE_PIXEL_THRESHOLD
  const circleThreshold = isTouch ? CIRCLE_TOUCH_THRESHOLD : CIRCLE_PIXEL_THRESHOLD

  const toWorld = (p: THREE.Vector3) => p.clone().applyMatrix4(mesh.matrixWorld)
  const worldScale = mesh.getWorldScale(new THREE.Vector3()).x
  const screenDist = (localP: THREE.Vector3) => {
    const projected = projectToScreen(toWorld(localP), camera, canvasWidth, canvasHeight)
    return projected ? Math.hypot(projected.x - cursorX, projected.y - cursorY) : Infinity
  }
  const circleSnapResult = (
    center: THREE.Vector3,
    radius: number,
    normal: THREE.Vector3,
    startAngle: number,
    angularSpan: number,
    point: THREE.Vector3,
  ): SnapResult => ({
    type: 'circle',
    point: toWorld(point),
    segmentStart: null,
    segmentEnd: null,
    length: null,
    circle: {
      center: toWorld(center),
      radius: radius * worldScale,
      normal: normal.clone().transformDirection(mesh.matrixWorld),
      startAngle,
      angularSpan,
    },
  })

  let bestCircle: DetectedCircle | null = null
  let bestCircleDist = Infinity
  for (const circle of edgeData.circles) {
    if (circle.center.distanceTo(localPoint) > searchRadius * 3) continue
    const closest = closestPointOnCircle(localPoint, circle)
    if (!closest) continue
    const dist = screenDist(closest)
    if (dist < circleThreshold && dist < bestCircleDist) {
      bestCircle = circle
      bestCircleDist = dist
    }
  }
  if (bestCircle) {
    const snapPoint = closestPointOnCircle(localPoint, bestCircle) ?? bestCircle.center
    return circleSnapResult(bestCircle.center, bestCircle.radius, bestCircle.normal, 0, Math.PI * 2, snapPoint)
  }

  const candidates = edgeData.segments.filter(
    (seg) =>
      seg.a.distanceTo(localPoint) < searchRadius * 4 || seg.b.distanceTo(localPoint) < searchRadius * 4,
  )

  let bestVertex: { point: THREE.Vector3; dist: number } | null = null
  let bestMidpoint: { point: THREE.Vector3; seg: EdgeSegment; dist: number } | null = null
  let bestEdge: { point: THREE.Vector3; seg: EdgeSegment; dist: number } | null = null

  for (const seg of candidates) {
    for (const vertex of [seg.a, seg.b]) {
      const dist = screenDist(vertex)
      if (dist < vertexThreshold && (!bestVertex || dist < bestVertex.dist)) {
        bestVertex = { point: vertex, dist }
      }
    }

    const mid = seg.a.clone().add(seg.b).multiplyScalar(0.5)
    const midDist = screenDist(mid)
    if (midDist < edgeThreshold && (!bestMidpoint || midDist < bestMidpoint.dist)) {
      bestMidpoint = { point: mid, seg, dist: midDist }
    }

    const closestLocal = closestPointOnSegment(localPoint, seg.a, seg.b)
    const dist = screenDist(closestLocal)
    if (dist < edgeThreshold && (!bestEdge || dist < bestEdge.dist)) {
      bestEdge = { point: closestLocal, seg, dist }
    }
  }

  if (bestVertex) {
    return {
      type: 'vertex',
      point: toWorld(bestVertex.point),
      segmentStart: null,
      segmentEnd: null,
      length: null,
      circle: null,
    }
  }
  if (bestMidpoint) {
    return {
      type: 'midpoint',
      point: toWorld(bestMidpoint.point),
      segmentStart: toWorld(bestMidpoint.seg.a),
      segmentEnd: toWorld(bestMidpoint.seg.b),
      length: bestMidpoint.seg.a.distanceTo(bestMidpoint.seg.b) * worldScale,
      circle: null,
    }
  }
  if (bestEdge) {
    return {
      type: 'edge',
      point: toWorld(bestEdge.point),
      segmentStart: toWorld(bestEdge.seg.a),
      segmentEnd: toWorld(bestEdge.seg.b),
      length: bestEdge.seg.a.distanceTo(bestEdge.seg.b) * worldScale,
      circle: null,
    }
  }

  // Nothing edge-like nearby: fall back to whatever cylindrical surface
  // patch the raycasted face itself belongs to, if any (an O(1) lookup -
  // see surfacePatches.ts for how these were precomputed at load time).
  if (faceIndex !== undefined) {
    const patchIndex = edgeData.surfacePatches.facePatch[faceIndex]
    if (patchIndex !== undefined && patchIndex >= 0) {
      const patch = edgeData.surfacePatches.patches[patchIndex]
      // `patch.center` sits at the axial midpoint of the whole cylindrical
      // wall (a bore/boss's "center of gravity"), which is never a real
      // point on the part - a rim/diameter measurement always belongs at
      // one of its actual ends. Snap to whichever end is nearer the
      // clicked point along the axis instead of that midpoint.
      const alongAxis = new THREE.Vector3().subVectors(localPoint, patch.center).dot(patch.axis)
      const nearEndOffset =
        Math.abs(alongAxis - patch.axialMin) < Math.abs(alongAxis - patch.axialMax) ? patch.axialMin : patch.axialMax
      const rimCenter = patch.center.clone().addScaledVector(patch.axis, nearEndOffset)
      const snapPoint =
        closestPointOnCircle(localPoint, { center: rimCenter, radius: patch.radius, normal: patch.axis }) ?? rimCenter
      return circleSnapResult(rimCenter, patch.radius, patch.axis, patch.startAngle, patch.angularSpan, snapPoint)
    }
  }

  // Last resort: the point didn't land near any edge, rim, or curved wall,
  // but it might still be sitting on a flat face inside a hole's own rim
  // (its blind bottom, or the flat annulus around a counterbore) - check
  // whether it falls inside a known circle's disk, picking the smallest
  // (innermost) one that contains it in case of concentric/nested holes.
  const planeTolerance = searchRadius * 2
  let bestDisk: { center: THREE.Vector3; radius: number; normal: THREE.Vector3 } | null = null
  for (const circle of edgeData.circles) {
    if (!pointInCircleDisk(localPoint, circle.center, circle.normal, circle.radius, planeTolerance)) continue
    if (!bestDisk || circle.radius < bestDisk.radius) bestDisk = circle
  }
  for (const patch of edgeData.surfacePatches.patches) {
    if (!isFullCircle(patch.angularSpan)) continue
    if (!pointInCircleDisk(localPoint, patch.center, patch.axis, patch.radius, planeTolerance)) continue
    if (!bestDisk || patch.radius < bestDisk.radius) bestDisk = { center: patch.center, radius: patch.radius, normal: patch.axis }
  }
  if (bestDisk) {
    const snapPoint = closestPointOnCircle(localPoint, bestDisk) ?? bestDisk.center
    return circleSnapResult(bestDisk.center, bestDisk.radius, bestDisk.normal, 0, Math.PI * 2, snapPoint)
  }

  return null
}

// A dedicated, much simpler snap for placing a flow-path point: unlike
// findSnap() above (built for precise CAD picking, where a vertex/edge
// under the cursor should always win), a hole/boss's own dense curved-wall
// tessellation means nearly every click near it lands within a few pixels
// of SOME mesh vertex - vertex-priority there would defeat "snap to this
// hole's center" almost every time (see the flow-tool bug report this
// fixes). So this only ever checks disk membership (is the click within,
// or just past, a known circle's own radius and near its plane?),
// checking real B-Rep edge-loop circles before bare cylindrical surface
// patches (a patch's own center is only the wall's axial midpoint, an
// approximation - see surfacePatches.ts), and preferring the SMALLEST
// match when several are nested (a counterbore's inner bore over its own
// wider counterbore). Falls through to null (no snap - caller uses the
// raw raycast hit) once nothing containing the click is found at all.
const FLOW_DISK_RADIUS_MARGIN = 1.3

export function findFlowCircle(mesh: THREE.Mesh, edgeData: MeshEdgeData, hitPointWorld: THREE.Vector3): SnapCircle | null {
  const localPoint = mesh.worldToLocal(hitPointWorld.clone())
  const geometry = mesh.geometry
  if (!geometry.boundingSphere) geometry.computeBoundingSphere()
  const planeTolerance = Math.max((geometry.boundingSphere?.radius || 1) * 0.3, 1e-6)
  const worldScale = mesh.getWorldScale(new THREE.Vector3()).x

  let best: { center: THREE.Vector3; radius: number; normal: THREE.Vector3 } | null = null
  for (const circle of edgeData.circles) {
    if (!pointInCircleDisk(localPoint, circle.center, circle.normal, circle.radius * FLOW_DISK_RADIUS_MARGIN, planeTolerance)) continue
    if (!best || circle.radius < best.radius) best = circle
  }
  if (!best) {
    for (const patch of edgeData.surfacePatches.patches) {
      if (!isFullCircle(patch.angularSpan)) continue
      if (!pointInCircleDisk(localPoint, patch.center, patch.axis, patch.radius * FLOW_DISK_RADIUS_MARGIN, planeTolerance)) continue
      // No real rim edge nearby - only the wall's own surface patch
      // matched, whose `center` is just the axial MIDPOINT of the whole
      // wall (never a real point on the part). Snap to whichever real end
      // (top/bottom) is nearer the click along the patch's own axis
      // instead, same fix already applied to the animation pivot.
      const alongAxis = new THREE.Vector3().subVectors(localPoint, patch.center).dot(patch.axis)
      const nearEndOffset =
        Math.abs(alongAxis - patch.axialMin) < Math.abs(alongAxis - patch.axialMax) ? patch.axialMin : patch.axialMax
      const rimCenter = patch.center.clone().addScaledVector(patch.axis, nearEndOffset)
      if (!best || patch.radius < best.radius) best = { center: rimCenter, radius: patch.radius, normal: patch.axis }
    }
  }
  if (!best) return null

  return {
    center: best.center.clone().applyMatrix4(mesh.matrixWorld),
    radius: best.radius * worldScale,
    normal: best.normal.clone().transformDirection(mesh.matrixWorld),
    startAngle: 0,
    angularSpan: Math.PI * 2,
  }
}

// Closest point to `point` on the INFINITE line through `lineA`/`lineB`,
// not clamped to the segment - "distance from a point to a line" is
// conventionally the true perpendicular distance regardless of where along
// the edge that perpendicular foot happens to land.
export function closestPointOnLine(point: THREE.Vector3, lineA: THREE.Vector3, lineB: THREE.Vector3): THREE.Vector3 {
  const dir = new THREE.Vector3().subVectors(lineB, lineA)
  const lengthSq = dir.lengthSq()
  if (lengthSq < 1e-12) return lineA.clone()
  const t = new THREE.Vector3().subVectors(point, lineA).dot(dir) / lengthSq
  return lineA.clone().addScaledVector(dir, t)
}

// Resolves what a second measure-mode click, landing on `snapB`, means in
// relation to the first click's `snapA`: two parallel edges measure their
// perpendicular separation, a line and a circle measure from the circle's
// center to the line, two circles measure center-to-center, and anything
// else (a vertex, a midpoint, empty space) falls back to the plain
// point-to-point distance between whatever was actually clicked.
export function resolveDistanceMeasurement(
  pointA: THREE.Vector3,
  snapA: SnapResult | null,
  pointB: THREE.Vector3,
  snapB: SnapResult | null,
): { a: THREE.Vector3; b: THREE.Vector3; distance: number } {
  const circleA = snapA?.type === 'circle' ? snapA.circle : null
  const circleB = snapB?.type === 'circle' ? snapB.circle : null
  const edgeA = snapA?.type === 'edge' && snapA.segmentStart && snapA.segmentEnd ? snapA : null
  const edgeB = snapB?.type === 'edge' && snapB.segmentStart && snapB.segmentEnd ? snapB : null

  if (circleA && circleB) {
    return { a: circleA.center, b: circleB.center, distance: circleA.center.distanceTo(circleB.center) }
  }
  if (circleA && edgeB) {
    const foot = closestPointOnLine(circleA.center, edgeB.segmentStart!, edgeB.segmentEnd!)
    return { a: circleA.center, b: foot, distance: circleA.center.distanceTo(foot) }
  }
  if (circleB && edgeA) {
    const foot = closestPointOnLine(circleB.center, edgeA.segmentStart!, edgeA.segmentEnd!)
    return { a: foot, b: circleB.center, distance: circleB.center.distanceTo(foot) }
  }
  if (edgeA && edgeB) {
    const dirA = edgeA.segmentEnd!.clone().sub(edgeA.segmentStart!).normalize()
    const dirB = edgeB.segmentEnd!.clone().sub(edgeB.segmentStart!).normalize()
    const isParallel = Math.abs(dirA.dot(dirB)) > 0.999
    if (isParallel) {
      const foot = closestPointOnLine(pointA, edgeB.segmentStart!, edgeB.segmentEnd!)
      return { a: pointA, b: foot, distance: pointA.distanceTo(foot) }
    }
    const closest = closestPointsBetweenSegments(
      edgeA.segmentStart!,
      edgeA.segmentEnd!,
      edgeB.segmentStart!,
      edgeB.segmentEnd!,
    )
    return { a: closest.a, b: closest.b, distance: closest.a.distanceTo(closest.b) }
  }

  return { a: pointA, b: pointB, distance: pointA.distanceTo(pointB) }
}

// Classic segment-segment closest point (Ericson, "Real-Time Collision
// Detection"), used for edge-to-edge measurement.
export function closestPointsBetweenSegments(
  p1: THREE.Vector3,
  q1: THREE.Vector3,
  p2: THREE.Vector3,
  q2: THREE.Vector3,
): { a: THREE.Vector3; b: THREE.Vector3 } {
  const d1 = new THREE.Vector3().subVectors(q1, p1)
  const d2 = new THREE.Vector3().subVectors(q2, p2)
  const r = new THREE.Vector3().subVectors(p1, p2)
  const a = d1.dot(d1)
  const e = d2.dot(d2)
  const f = d2.dot(r)
  const EPS = 1e-9

  let s = 0
  let t = 0

  if (a <= EPS && e <= EPS) {
    return { a: p1.clone(), b: p2.clone() }
  }
  if (a <= EPS) {
    s = 0
    t = THREE.MathUtils.clamp(f / e, 0, 1)
  } else {
    const c = d1.dot(r)
    if (e <= EPS) {
      t = 0
      s = THREE.MathUtils.clamp(-c / a, 0, 1)
    } else {
      const b = d1.dot(d2)
      const denom = a * e - b * b
      s = denom !== 0 ? THREE.MathUtils.clamp((b * f - c * e) / denom, 0, 1) : 0
      t = (b * s + f) / e
      if (t < 0) {
        t = 0
        s = THREE.MathUtils.clamp(-c / a, 0, 1)
      } else if (t > 1) {
        t = 1
        s = THREE.MathUtils.clamp((b - c) / a, 0, 1)
      }
    }
  }

  return {
    a: p1.clone().addScaledVector(d1, s),
    b: p2.clone().addScaledVector(d2, t),
  }
}
