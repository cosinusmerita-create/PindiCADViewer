import { useMemo, useRef, type ReactNode } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useModelStore } from '../hooks/useModelState'
import { THEME_COLORS } from '../utils/themeColors'
import type { AxisLevel } from '../types/model'

const PITCH_COLOR = '#ffaa00'
// Beyond this many face-to-face steps along one axis the chain would be an
// unreadable comb of labels: only the overall cote is drawn then (the full
// breakdown stays in the Fiche technique panel).
const MAX_CHAIN_STEPS = 12
const MIN_STEP_MM = 0.01
// A cote seen (nearly) end-on - the "l" depth cote in a front view -
// collapses to a stub with its label sitting on top of the others: hidden
// when it runs within ~30° of the line of sight, or is too short on screen,
// and shown again as soon as the view turns.
const MIN_SCREEN_LENGTH_PX = 18
const MAX_VIEW_ALIGNMENT = 0.85

function formatMm(value: number) {
  return `${value.toFixed(2)} mm`
}

function formatDeg(radians: number) {
  return `${THREE.MathUtils.radToDeg(radians).toFixed(1)}°`
}

function boxEdgeSegments(min: THREE.Vector3, max: THREE.Vector3): THREE.Vector3[] {
  const corners = [
    new THREE.Vector3(min.x, min.y, min.z),
    new THREE.Vector3(max.x, min.y, min.z),
    new THREE.Vector3(max.x, max.y, min.z),
    new THREE.Vector3(min.x, max.y, min.z),
    new THREE.Vector3(min.x, min.y, max.z),
    new THREE.Vector3(max.x, min.y, max.z),
    new THREE.Vector3(max.x, max.y, max.z),
    new THREE.Vector3(min.x, max.y, max.z),
  ]
  const edges: [number, number][] = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 0],
    [4, 5],
    [5, 6],
    [6, 7],
    [7, 4],
    [0, 4],
    [1, 5],
    [2, 6],
    [3, 7],
  ]
  const points: THREE.Vector3[] = []
  for (const [a, b] of edges) points.push(corners[a], corners[b])
  return points
}

function makeCirclePoints(center: THREE.Vector3, axis: THREE.Vector3, radius: number, segments = 48) {
  const helper = Math.abs(axis.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const u = new THREE.Vector3().crossVectors(helper, axis).normalize()
  const v = new THREE.Vector3().crossVectors(axis, u).normalize()
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2
    points.push(center.clone().addScaledVector(u, Math.cos(t) * radius).addScaledVector(v, Math.sin(t) * radius))
  }
  return points
}

function Arrow({ tip, direction, size, color }: { tip: THREE.Vector3; direction: THREE.Vector3; size: number; color: string }) {
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction), [direction])
  return (
    <mesh position={tip} quaternion={quaternion}>
      <coneGeometry args={[size * 0.35, size, 10]} />
      <meshBasicMaterial color={color} />
    </mesh>
  )
}

// A single SolidWorks-style linear cote: extension lines from the real
// geometry out to the offset dimension line, the dimension line itself with
// arrows at both ends, and a camera-facing label centered on it.
function DimensionLine({
  start,
  end,
  extFromA,
  extFromB,
  label,
  color,
  arrowSize,
}: {
  start: THREE.Vector3
  end: THREE.Vector3
  extFromA?: THREE.Vector3
  extFromB?: THREE.Vector3
  label: string
  color: string
  arrowSize: number
}) {
  const direction = useMemo(() => end.clone().sub(start).normalize(), [start, end])
  const mid = useMemo(() => start.clone().add(end).multiplyScalar(0.5), [start, end])
  const groupRef = useRef<THREE.Group>(null)
  const labelRef = useRef<HTMLDivElement>(null)
  const ndcA = useMemo(() => new THREE.Vector3(), [])
  const ndcB = useMemo(() => new THREE.Vector3(), [])
  const viewDir = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera, size }) => {
    ndcA.copy(start).project(camera)
    ndcB.copy(end).project(camera)
    const px = Math.hypot(((ndcA.x - ndcB.x) * size.width) / 2, ((ndcA.y - ndcB.y) * size.height) / 2)
    camera.getWorldDirection(viewDir)
    const visible = px >= MIN_SCREEN_LENGTH_PX && Math.abs(viewDir.dot(direction)) <= MAX_VIEW_ALIGNMENT
    if (groupRef.current) groupRef.current.visible = visible
    if (labelRef.current) labelRef.current.style.display = visible ? '' : 'none'
  })

  return (
    <group ref={groupRef}>
      {extFromA && <Line points={[extFromA, start]} color={color} lineWidth={1} transparent opacity={0.5} />}
      {extFromB && <Line points={[extFromB, end]} color={color} lineWidth={1} transparent opacity={0.5} />}
      <Line points={[start, end]} color={color} lineWidth={1.5} />
      <Arrow tip={start} direction={direction.clone().negate()} size={arrowSize} color={color} />
      <Arrow tip={end} direction={direction} size={arrowSize} color={color} />
      <Html position={mid} center pointerEvents="none">
        <div
          ref={labelRef}
          className="whitespace-nowrap rounded border border-white/10 bg-[#16162a]/90 px-1.5 py-0.5 text-[11px] font-medium shadow"
          style={{ color }}
        >
          {label}
        </div>
      </Html>
    </group>
  )
}

// A diameter: the circle itself, and (when labelled) a leader from a point
// ON the rim straight out to the label, so the value visibly belongs to that
// circle. Extra instances of a hole pattern are drawn without a label - the
// first one carries "4× ⌀ ..." for the whole group.
function DiameterCallout({
  center,
  axis,
  radius,
  label,
  dir,
  labelGap,
  color,
}: {
  center: THREE.Vector3
  axis: THREE.Vector3
  radius: number
  label?: string
  dir: THREE.Vector3
  labelGap: number
  color: string
}) {
  const points = useMemo(() => makeCirclePoints(center, axis, radius), [center, axis, radius])
  const rimPoint = useMemo(() => center.clone().addScaledVector(dir, radius), [center, dir, radius])
  const labelPos = useMemo(() => center.clone().addScaledVector(dir, radius + labelGap), [center, dir, radius, labelGap])
  return (
    <group>
      <Line points={points} color={color} lineWidth={2} />
      {label && (
        <>
          <Line points={[rimPoint, labelPos]} color={color} lineWidth={1} transparent opacity={0.6} />
          <Html position={labelPos} center pointerEvents="none">
            <div className="whitespace-nowrap rounded border border-white/10 bg-[#16162a]/90 px-1.5 py-0.5 text-[11px] font-medium shadow" style={{ color }}>
              {label}
            </div>
          </Html>
        </>
      )}
    </group>
  )
}

// Auto-generated overview cotes for the currently active dimension report:
// the bounding-box wireframe, a chain of face-to-face cotes plus the overall
// L/H/l cote along each axis (see the layout notes below), every detected
// diameter group highlighted and labelled ("N× ⌀X mm") and the pitch circle
// if one was found.
export function AutoDimensions() {
  const showAutoDimensions = useModelStore((s) => s.showAutoDimensions)
  const report = useModelStore((s) => s.dimensionReport)
  const theme = useModelStore((s) => s.theme)

  if (!showAutoDimensions || !report) return null

  const linearColor = THEME_COLORS[theme].dimensionLinear
  const diameterColor = THEME_COLORS[theme].dimensionDiameter

  const { boundingBoxMin: min, boundingBoxMax: max, size, diameterGroups, largestGroupIndex, centralBoreGroupIndex, pitchCircle } = report

  const spanRef = Math.max(size.x, size.y, size.z, 1)
  // Distance between successive rows of cotes (chain row, then overall row).
  const step = spanRef * 0.17
  const arrowSize = spanRef * 0.012

  const boxPoints = boxEdgeSegments(min, max)

  // Linear cotes, drawn the way a drawing sheet shows them: along each world
  // axis, a CHAIN row cotes every step between consecutive planar faces
  // (wall, opening, wall...), and a row further out gives the overall size.
  // Every extension line starts on the real face it measures (its extent
  // nearest the cote), so each value visibly belongs to its faces.
  //  - X (L): under the part, in the front plane (z = max.z).
  //  - Y (H): right of the part, in the front plane.
  //  - Z (l): under the part's right edge.
  // Chains with a single step (nothing between the two outer faces) are the
  // overall cote itself and aren't repeated.
  const front = max.z
  type Stop = { pos: number; anchor: THREE.Vector3 }
  function stops(levels: AxisLevel[], lo: number, hi: number, anchorOf: (pos: number, level: AxisLevel | null) => THREE.Vector3): Stop[] {
    const result: Stop[] = levels.map((level) => ({ pos: level.pos, anchor: anchorOf(level.pos, level) }))
    if (result.length === 0 || result[0].pos - lo > MIN_STEP_MM) result.unshift({ pos: lo, anchor: anchorOf(lo, null) })
    if (hi - result[result.length - 1].pos > MIN_STEP_MM) result.push({ pos: hi, anchor: anchorOf(hi, null) })
    return result.filter((stop, i) => i === 0 || stop.pos - result[i - 1].pos > MIN_STEP_MM)
  }
  const hasChain = (list: Stop[]) => list.length > 2 && list.length - 1 <= MAX_CHAIN_STEPS

  const xStops = stops(report.axisLevels.x, min.x, max.x, (pos, level) => new THREE.Vector3(pos, level ? level.min.y : min.y, front))
  const yStops = stops(report.axisLevels.y, min.y, max.y, (pos, level) => new THREE.Vector3(level ? level.max.x : max.x, pos, front))
  const zStops = stops(report.axisLevels.z, min.z, max.z, (pos, level) =>
    level ? new THREE.Vector3(level.max.x, level.min.y, pos) : new THREE.Vector3(max.x, min.y, pos),
  )

  const xChainY = min.y - step
  const xTotalY = min.y - step * (hasChain(xStops) ? 2 : 1)
  const yChainX = max.x + step
  const yTotalX = max.x + step * (hasChain(yStops) ? 2 : 1)
  const zChainY = min.y - step
  const zTotalY = min.y - step * (hasChain(zStops) ? 2 : 1)

  const linear: ReactNode[] = []
  function chain(key: string, list: Stop[], at: (pos: number) => THREE.Vector3) {
    if (!hasChain(list)) return
    for (let i = 1; i < list.length; i++) {
      linear.push(
        <DimensionLine
          key={`${key}-${i}`}
          start={at(list[i - 1].pos)}
          end={at(list[i].pos)}
          extFromA={list[i - 1].anchor}
          extFromB={list[i].anchor}
          label={formatMm(list[i].pos - list[i - 1].pos)}
          color={linearColor}
          arrowSize={arrowSize}
        />,
      )
    }
  }
  chain('cx', xStops, (x) => new THREE.Vector3(x, xChainY, front))
  chain('cy', yStops, (y) => new THREE.Vector3(yChainX, y, front))
  chain('cz', zStops, (z) => new THREE.Vector3(max.x, zChainY, z))

  // Diameter labels. The old layout pushed every label out from its circle's
  // center along the same direction, so on a turned part (all circles
  // concentric) they piled up in one column over the middle of the part.
  // Now:
  //  - circles on the part's own axis (bores, bosses, flange) and the pitch
  //    circle each get their own angle around that axis, spread evenly,
  //    largest first at the front-right;
  //  - an off-axis hole puts its label radially outward, away from the part.
  // Each leader starts on the rim and the label sits just outside it.
  const labelGap = spanRef * 0.12
  const partCenter = min.clone().add(max).multiplyScalar(0.5)
  const planeBasis = (axis: THREE.Vector3) => {
    const helper = Math.abs(axis.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    const u = new THREE.Vector3().crossVectors(helper, axis).normalize()
    const v = new THREE.Vector3().crossVectors(axis, u).normalize()
    return { u, v }
  }
  const inPlaneOffset = (point: THREE.Vector3, axis: THREE.Vector3) => {
    const rel = new THREE.Vector3().subVectors(point, partCenter)
    return rel.addScaledVector(axis, -rel.dot(axis))
  }
  const isCentral = (center: THREE.Vector3, axis: THREE.Vector3, radius: number) =>
    inPlaneOffset(center, axis).length() < Math.max(radius * 0.2, spanRef * 0.02)

  type Spread = { key: string; axis: THREE.Vector3; radius: number }
  const spread: Spread[] = []
  diameterGroups.forEach((group, groupIndex) => {
    if (group.count === 1 && isCentral(group.center, group.axis, group.radius))
      spread.push({ key: `d-${groupIndex}`, axis: group.axis, radius: group.radius })
  })
  if (pitchCircle) spread.push({ key: 'pcd', axis: pitchCircle.axis, radius: pitchCircle.diameter / 2 })
  spread.sort((a, b) => b.radius - a.radius)
  const spreadDir = new Map<string, THREE.Vector3>()
  spread.forEach((item, i) => {
    const angle = (3 * Math.PI) / 4 + (i * 2 * Math.PI) / spread.length
    const { u, v } = planeBasis(item.axis)
    spreadDir.set(item.key, u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v, Math.sin(angle)))
  })

  const elements: ReactNode[] = []

  diameterGroups.forEach((group, groupIndex) => {
    const isLargest = groupIndex === largestGroupIndex
    const isCentralBore = groupIndex === centralBoreGroupIndex
    const tag = isLargest ? ' (ext. max)' : isCentralBore ? ' (alésage central)' : ''
    const label = group.count > 1 ? `${group.count}× ⌀ ${formatMm(group.radius * 2)}${tag}` : `⌀ ${formatMm(group.radius * 2)}${tag}`
    group.instanceCenters.forEach((center, i) => {
      let dir = spreadDir.get(`d-${groupIndex}`)
      if (!dir) {
        const outward = inPlaneOffset(center, group.axis)
        dir = outward.lengthSq() > 1e-9 ? outward.normalize() : planeBasis(group.axis).u
      }
      elements.push(
        <DiameterCallout
          key={`d-${groupIndex}-${i}`}
          center={center}
          axis={group.axis}
          radius={group.radius}
          label={i === 0 ? label : undefined}
          dir={dir}
          labelGap={labelGap}
          color={diameterColor}
        />,
      )
    })
  })

  if (pitchCircle) {
    const pcdPoints = makeCirclePoints(pitchCircle.center, pitchCircle.axis, pitchCircle.diameter / 2)
    const dir = spreadDir.get('pcd') ?? planeBasis(pitchCircle.axis).u
    const rimPoint = pitchCircle.center.clone().addScaledVector(dir, pitchCircle.diameter / 2)
    const labelPos = pitchCircle.center.clone().addScaledVector(dir, pitchCircle.diameter / 2 + labelGap)
    const label = pitchCircle.angleStep
      ? `Entraxe ⌀ ${formatMm(pitchCircle.diameter)} · tous les ${formatDeg(pitchCircle.angleStep)}`
      : `Entraxe ⌀ ${formatMm(pitchCircle.diameter)}`
    elements.push(
      <group key="pcd">
        <Line points={pcdPoints} color={PITCH_COLOR} lineWidth={1.5} dashed dashSize={pitchCircle.diameter * 0.02} gapSize={pitchCircle.diameter * 0.015} />
        <Line points={[rimPoint, labelPos]} color={PITCH_COLOR} lineWidth={1} transparent opacity={0.6} />
        <Html position={labelPos} center pointerEvents="none">
          <div className="whitespace-nowrap rounded border border-white/10 bg-[#16162a]/90 px-1.5 py-0.5 text-[11px] font-medium shadow" style={{ color: PITCH_COLOR }}>
            {label}
          </div>
        </Html>
      </group>,
    )
  }

  return (
    <group>
      <Line points={boxPoints} segments color="#66aaff" lineWidth={1} dashed dashSize={spanRef * 0.01} gapSize={spanRef * 0.006} transparent opacity={0.6} />

      <DimensionLine
        start={new THREE.Vector3(min.x, xTotalY, front)}
        end={new THREE.Vector3(max.x, xTotalY, front)}
        extFromA={new THREE.Vector3(min.x, min.y, front)}
        extFromB={new THREE.Vector3(max.x, min.y, front)}
        label={`L ${formatMm(size.x)}`}
        color={linearColor}
        arrowSize={arrowSize}
      />
      <DimensionLine
        start={new THREE.Vector3(yTotalX, min.y, front)}
        end={new THREE.Vector3(yTotalX, max.y, front)}
        extFromA={new THREE.Vector3(max.x, min.y, front)}
        extFromB={new THREE.Vector3(max.x, max.y, front)}
        label={`H ${formatMm(size.y)}`}
        color={linearColor}
        arrowSize={arrowSize}
      />
      <DimensionLine
        start={new THREE.Vector3(max.x, zTotalY, min.z)}
        end={new THREE.Vector3(max.x, zTotalY, max.z)}
        extFromA={new THREE.Vector3(max.x, min.y, min.z)}
        extFromB={new THREE.Vector3(max.x, min.y, max.z)}
        label={`l ${formatMm(size.z)}`}
        color={linearColor}
        arrowSize={arrowSize}
      />

      {linear}

      {elements}
    </group>
  )
}
