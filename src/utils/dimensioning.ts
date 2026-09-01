import * as THREE from 'three'
import type {
  ComponentNode,
  DiameterGroup,
  DimensionReport,
  HeightLevel,
  PitchCircleInfo,
  TopSegment,
} from '../types/model'
import { collectMeshes, collectPartNodeIds } from './componentTree'
import type { MeshEdgeData } from './edgeAnalysis'
import { isFullCircle } from './surfacePatches'

// Classic mesh-volume formula: the signed volume of the tetrahedron formed
// by each triangle and the origin, summed over every triangle. Correct
// regardless of where the origin sits as long as the mesh is a closed,
// consistently-wound 2-manifold (true of a solid STEP/STL part); the
// triangle's own cross-product magnitude gives its area for the surface
// total in the same pass.
export function computeMeshVolumeAndSurface(mesh: THREE.Mesh): { volume: number; surface: number } {
  const geometry = mesh.geometry
  const position = geometry.attributes.position
  const index = geometry.getIndex()
  if (!position) return { volume: 0, surface: 0 }
  const triangleCount = index ? index.count / 3 : position.count / 3

  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const edge1 = new THREE.Vector3()
  const edge2 = new THREE.Vector3()
  const cross = new THREE.Vector3()
  let volume = 0
  let surface = 0

  for (let t = 0; t < triangleCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2
    a.fromBufferAttribute(position, i0)
    b.fromBufferAttribute(position, i1)
    c.fromBufferAttribute(position, i2)

    cross.crossVectors(b, c)
    volume += a.dot(cross) / 6

    edge1.subVectors(b, a)
    edge2.subVectors(c, a)
    surface += edge1.cross(edge2).length() / 2
  }

  return { volume: Math.abs(volume), surface }
}

interface RawCircle {
  center: THREE.Vector3
  radius: number
  axis: THREE.Vector3
  concave: boolean | null
  // True for a real B-Rep boundary-edge loop (an actual rim, at its true
  // position); false for a bare cylindrical surface patch, whose `center`
  // is only the axial MIDPOINT of the whole wall - never a real point on
  // the part. Lets clusterByAxisLine below prefer the accurate one.
  fromEdge: boolean
}

function collectRawCircles(node: ComponentNode, edgeData: Map<string, MeshEdgeData>): RawCircle[] {
  const raw: RawCircle[] = []
  for (const leafId of collectPartNodeIds(node)) {
    const data = edgeData.get(leafId)
    if (!data) continue
    for (const circle of data.circles) {
      raw.push({ center: circle.center, radius: circle.radius, axis: circle.normal, concave: null, fromEdge: true })
    }
    for (const patch of data.surfacePatches.patches) {
      if (!isFullCircle(patch.angularSpan)) continue
      raw.push({ center: patch.center, radius: patch.radius, axis: patch.axis, concave: patch.concave, fromEdge: false })
    }
  }
  return raw
}

function distanceToAxisLine(point: THREE.Vector3, lineOrigin: THREE.Vector3, axis: THREE.Vector3): number {
  const rel = new THREE.Vector3().subVectors(point, lineOrigin)
  const along = rel.dot(axis)
  return rel.addScaledVector(axis, -along).length()
}

// One circle can legitimately show up more than once in the raw data for a
// single physical hole: a through-hole has a rim at BOTH ends (two separate
// edge-loop circles), and a bore is often found twice over - once as its
// rim, once as its cylindrical wall's surface patch. Clustering by "same
// axis line" (not just matching center) collapses all of these into one
// hole instance, which is what makes the "N× ⌀X mm" counts trustworthy
// instead of silently doubling or quadrupling real hole counts.
function clusterByAxisLine(circles: RawCircle[]): RawCircle[] {
  const clusters: RawCircle[][] = []
  for (const circle of circles) {
    let placed = false
    for (const cluster of clusters) {
      const ref = cluster[0]
      if (Math.abs(circle.axis.dot(ref.axis)) <= 0.99) continue
      const avgRadius = (circle.radius + ref.radius) / 2
      if (distanceToAxisLine(circle.center, ref.center, ref.axis) > Math.max(avgRadius * 0.1, 0.2)) continue
      cluster.push(circle)
      placed = true
      break
    }
    if (!placed) clusters.push([circle])
  }

  return clusters.map((cluster) => {
    // A real edge-loop rim's center is exact; a surface patch's is only
    // the axial midpoint of the whole wall - averaging the two together
    // would drag an otherwise-correct rim position toward that midpoint,
    // so prefer the edge-loop instances alone whenever the cluster has any.
    const edgeInstances = cluster.filter((c) => c.fromEdge)
    const centerSource = edgeInstances.length > 0 ? edgeInstances : cluster
    const center = new THREE.Vector3()
    for (const c of centerSource) center.add(c.center)
    center.divideScalar(centerSource.length)
    const radius = cluster.reduce((sum, c) => sum + c.radius, 0) / cluster.length
    const concave = cluster.some((c) => c.concave === true)
      ? true
      : cluster.some((c) => c.concave === false)
        ? false
        : null
    return { center, radius, axis: cluster[0].axis.clone(), concave, fromEdge: edgeInstances.length > 0 }
  })
}

const DIAMETER_RADIUS_TOLERANCE_MM = 0.1

// Groups every detected circle (hole rims + cylindrical surface patches,
// deduplicated per clusterByAxisLine above) by radius, so "4 identical
// Ø5.5mm holes" reads as one group with count=4 rather than four separate
// entries.
export function extractDiameterGroups(
  node: ComponentNode,
  edgeData: Map<string, MeshEdgeData>,
  radiusTolerance = DIAMETER_RADIUS_TOLERANCE_MM,
): DiameterGroup[] {
  const raw = collectRawCircles(node, edgeData)
  if (raw.length === 0) return []

  const sorted = [...raw].sort((a, b) => a.radius - b.radius)
  const radiusBuckets: RawCircle[][] = []
  for (const circle of sorted) {
    const last = radiusBuckets[radiusBuckets.length - 1]
    if (last && circle.radius - last[0].radius <= radiusTolerance) last.push(circle)
    else radiusBuckets.push([circle])
  }

  const groups: DiameterGroup[] = radiusBuckets.map((bucket) => {
    const instances = clusterByAxisLine(bucket)
    const radius = instances.reduce((sum, i) => sum + i.radius, 0) / instances.length
    const concave = instances.some((i) => i.concave === true)
      ? true
      : instances.some((i) => i.concave === false)
        ? false
        : null
    return {
      radius,
      count: instances.length,
      center: instances[0].center.clone(),
      axis: instances[0].axis.clone(),
      concave,
      instanceCenters: instances.map((i) => i.center.clone()),
    }
  })

  groups.sort((a, b) => b.radius - a.radius)
  return groups
}

// Fits a circle through a diameter group's own hole instances (Kasa
// algebraic fit, same technique as edgeAnalysis.ts's boundary-loop circle
// fit, but for an unordered point set using the group's own known axis as
// the fit plane's normal instead of re-deriving one from point order) and
// reports it as a pitch circle only if the points genuinely lie close to
// that circle. Requires at least 4 holes rather than the geometric minimum
// of 3: any 3 points fit *some* circle exactly by construction (zero
// residual, no matter how incidental their layout), so a fit alone can't
// distinguish a real bolt pattern from three unrelated holes that happen to
// be roughly equidistant from a point - only a 4th point actually tests
// the claim.
export function detectPitchCircle(group: DiameterGroup): PitchCircleInfo | null {
  if (group.count < 4) return null
  const axis = group.axis
  const centroid = new THREE.Vector3()
  for (const c of group.instanceCenters) centroid.add(c)
  centroid.divideScalar(group.instanceCenters.length)

  const helper = Math.abs(axis.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const u = new THREE.Vector3().crossVectors(helper, axis).normalize()
  const v = new THREE.Vector3().crossVectors(axis, u).normalize()

  const points2d = group.instanceCenters.map((c) => {
    const rel = new THREE.Vector3().subVectors(c, centroid)
    return { x: rel.dot(u), y: rel.dot(v) }
  })

  let sumX = 0
  let sumY = 0
  let sumXX = 0
  let sumYY = 0
  let sumXY = 0
  let sumXXX = 0
  let sumYYY = 0
  let sumXYY = 0
  let sumXXY = 0
  const n = points2d.length
  for (const { x, y } of points2d) {
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

  const radii = points2d.map(({ x, y }) => Math.hypot(x - cx, y - cy))
  const meanRadius = radii.reduce((sum, r) => sum + r, 0) / n
  if (meanRadius < 1e-6) return null
  const maxDeviation = Math.max(...radii.map((r) => Math.abs(r - meanRadius)))
  if (maxDeviation / meanRadius > 0.05) return null

  const angles = points2d.map(({ x, y }) => Math.atan2(y - cy, x - cx)).sort((a, b) => a - b)
  const gaps: number[] = []
  for (let i = 0; i < angles.length; i++) {
    const next = angles[(i + 1) % angles.length]
    gaps.push(i === angles.length - 1 ? next + Math.PI * 2 - angles[i] : next - angles[i])
  }
  const avgGap = gaps.reduce((sum, g) => sum + g, 0) / gaps.length
  const evenlySpaced = gaps.every((g) => Math.abs(g - avgGap) / avgGap < 0.2)

  const center = centroid.clone().addScaledVector(u, cx).addScaledVector(v, cy)
  return { diameter: meanRadius * 2, center, axis: axis.clone(), angleStep: evenlySpaced ? avgGap : null, holeCount: n }
}

const HEIGHT_LEVEL_TOLERANCE_MM = 0.05

// Buckets every triangle whose normal points along `verticalAxis` (a flat,
// "horizontal" face - a shoulder, a top or bottom) by its position along
// that axis, weighted by triangle area so a real structural step shows up
// as a strong peak and a stray sliver (a chamfer cap, a fillet's flat top)
// doesn't. Levels within tolerance of each other are merged, giving the
// ordered set of distinct Y-levels the part actually steps through.
function extractVerticalLevels(
  meshes: THREE.Mesh[],
  verticalAxis: 'x' | 'y' | 'z',
  tolerance = HEIGHT_LEVEL_TOLERANCE_MM,
): number[] {
  const buckets = new Map<number, number>()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const normal = new THREE.Vector3()

  for (const mesh of meshes) {
    const geometry = mesh.geometry
    const position = geometry.attributes.position
    if (!position) continue
    const index = geometry.getIndex()
    const triangleCount = index ? index.count / 3 : position.count / 3

    for (let t = 0; t < triangleCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2
      a.fromBufferAttribute(position, i0)
      b.fromBufferAttribute(position, i1)
      c.fromBufferAttribute(position, i2)
      normal.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a))
      const area = normal.length() / 2
      if (area < 1e-9) continue
      normal.normalize()

      const normalComponent = verticalAxis === 'x' ? normal.x : verticalAxis === 'y' ? normal.y : normal.z
      if (Math.abs(normalComponent) < 0.95) continue

      const avgPos =
        verticalAxis === 'x'
          ? (a.x + b.x + c.x) / 3
          : verticalAxis === 'y'
            ? (a.y + b.y + c.y) / 3
            : (a.z + b.z + c.z) / 3
      const key = Math.round(avgPos / tolerance) * tolerance
      buckets.set(key, (buckets.get(key) ?? 0) + area)
    }
  }

  const totalArea = [...buckets.values()].reduce((sum, area) => sum + area, 0)
  const significant = [...buckets.entries()]
    .filter(([, area]) => area > totalArea * 0.01)
    .map(([level]) => level)
    .sort((x, y) => x - y)

  const merged: number[] = []
  for (const level of significant) {
    if (merged.length === 0 || level - merged[merged.length - 1] > tolerance * 2) merged.push(level)
  }
  return merged
}

function buildHeightBreakdown(levels: number[]): HeightLevel[] {
  if (levels.length < 2) return []
  const result: HeightLevel[] = []
  for (let i = 1; i < levels.length; i++) {
    result.push({ label: levels.length === 2 ? 'Hauteur' : `Niveau ${i}`, value: levels[i] - levels[i - 1] })
  }
  if (levels.length > 2) {
    result.push({ label: 'Total', value: levels[levels.length - 1] - levels[0] })
  }
  return result
}

const TOP_SEGMENT_TOLERANCE_MM = 0.05

// The longest distinct straight-edge lengths in the model, deduped so a
// symmetric part's repeated equal-length edges (all 4 sides of a square
// plate, say) collapse to one representative entry instead of padding out
// the list with duplicates.
export function extractTopSegments(
  node: ComponentNode,
  edgeData: Map<string, MeshEdgeData>,
  maxCount = 5,
): TopSegment[] {
  const all: TopSegment[] = []
  for (const leafId of collectPartNodeIds(node)) {
    const data = edgeData.get(leafId)
    if (!data) continue
    for (const seg of data.segments) {
      all.push({ length: seg.a.distanceTo(seg.b), a: seg.a.clone(), b: seg.b.clone() })
    }
  }
  all.sort((a, b) => b.length - a.length)

  const result: TopSegment[] = []
  for (const seg of all) {
    if (result.some((r) => Math.abs(r.length - seg.length) < TOP_SEGMENT_TOLERANCE_MM)) continue
    result.push(seg)
    if (result.length >= maxCount) break
  }
  return result
}

// Builds the full dimensional report for `node` (a single part, or an
// entire assembly's root) - everything the auto-dimension panel and 3D
// overlay need, computed once from the already-precomputed edge/circle/
// surface-patch data (see edgeAnalysis.ts) plus the raw mesh geometry for
// volume/surface/height analysis.
export function buildDimensionReport(
  node: ComponentNode,
  edgeData: Map<string, MeshEdgeData>,
  fallbackName: string,
): DimensionReport {
  const meshes = collectMeshes(node)
  const boundingBox = new THREE.Box3()
  let volumeMm3 = 0
  let surfaceMm2 = 0
  let triangleCount = 0

  for (const mesh of meshes) {
    boundingBox.expandByObject(mesh)
    const { volume, surface } = computeMeshVolumeAndSurface(mesh)
    volumeMm3 += volume
    surfaceMm2 += surface
    const index = mesh.geometry.getIndex()
    triangleCount += index ? index.count / 3 : mesh.geometry.attributes.position.count / 3
  }

  const diameterGroups = extractDiameterGroups(node, edgeData)
  const largestGroupIndex = diameterGroups.length > 0 ? 0 : null // already sorted descending by radius

  let centralBoreGroupIndex: number | null = null
  if (diameterGroups.length > 1) {
    const boxCenter = boundingBox.getCenter(new THREE.Vector3())
    let bestIndex = -1
    let bestDistance = Infinity
    diameterGroups.forEach((group, i) => {
      if (i === largestGroupIndex) return
      const distance = new THREE.Vector3()
        .subVectors(group.center, boxCenter)
        .addScaledVector(group.axis, -new THREE.Vector3().subVectors(group.center, boxCenter).dot(group.axis))
        .length()
      if (distance < bestDistance) {
        bestDistance = distance
        bestIndex = i
      }
    })
    const referenceRadius = diameterGroups[largestGroupIndex ?? 0]?.radius ?? 5
    if (bestIndex >= 0 && bestDistance < Math.max(referenceRadius, 5) * 0.15) centralBoreGroupIndex = bestIndex
  }

  const pitchCircle = diameterGroups.map((g) => detectPitchCircle(g)).find((p): p is PitchCircleInfo => p !== null) ?? null

  const verticalLevels = extractVerticalLevels(meshes, 'y')
  const heights = buildHeightBreakdown(verticalLevels)
  const topSegments = extractTopSegments(node, edgeData)

  return {
    nodeId: node.id,
    name: node.name || fallbackName,
    size: boundingBox.getSize(new THREE.Vector3()),
    boundingBoxMin: boundingBox.min.clone(),
    boundingBoxMax: boundingBox.max.clone(),
    diameterGroups,
    largestGroupIndex,
    centralBoreGroupIndex,
    pitchCircle,
    heights,
    topSegments,
    volumeMm3,
    surfaceMm2,
    triangleCount: Math.round(triangleCount),
  }
}
