import { useMemo, type ReactNode } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { useModelStore } from '../hooks/useModelState'
import { THEME_COLORS } from '../utils/themeColors'

const PITCH_COLOR = '#ffaa00'
const MAX_RENDERED_HEIGHT_LINES = 4

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

  return (
    <group>
      {extFromA && <Line points={[extFromA, start]} color={color} lineWidth={1} transparent opacity={0.35} />}
      {extFromB && <Line points={[extFromB, end]} color={color} lineWidth={1} transparent opacity={0.35} />}
      <Line points={[start, end]} color={color} lineWidth={1.5} />
      <Arrow tip={start} direction={direction.clone().negate()} size={arrowSize} color={color} />
      <Arrow tip={end} direction={direction} size={arrowSize} color={color} />
      <Html position={mid} center pointerEvents="none">
        <div
          className="whitespace-nowrap rounded border border-white/10 bg-[#16162a]/90 px-1.5 py-0.5 text-[11px] font-medium shadow"
          style={{ color }}
        >
          {label}
        </div>
      </Html>
    </group>
  )
}

function DiameterCallout({
  center,
  axis,
  radius,
  label,
  offsetDir,
  color,
}: {
  center: THREE.Vector3
  axis: THREE.Vector3
  radius: number
  label: string
  offsetDir: THREE.Vector3
  color: string
}) {
  const points = useMemo(() => makeCirclePoints(center, axis, radius), [center, axis, radius])
  const labelPos = useMemo(() => center.clone().addScaledVector(offsetDir, radius * 1.6), [center, offsetDir, radius])
  return (
    <group>
      <Line points={points} color={color} lineWidth={2} />
      <Line points={[center, labelPos]} color={color} lineWidth={1} transparent opacity={0.5} />
      <Html position={labelPos} center pointerEvents="none">
        <div className="whitespace-nowrap rounded border border-white/10 bg-[#16162a]/90 px-1.5 py-0.5 text-[11px] font-medium shadow" style={{ color }}>
          {label}
        </div>
      </Html>
    </group>
  )
}

// Auto-generated overview cotes for the currently active dimension report:
// an overall bounding-box wireframe + L/W/H cotes, every detected diameter
// group highlighted and labelled ("N× ⌀X mm"), the pitch circle if one was
// found, and up to a handful of the part's characteristic height levels -
// each successive tier of similar cotes nudged progressively further out
// so they don't land on top of each other.
export function AutoDimensions() {
  const showAutoDimensions = useModelStore((s) => s.showAutoDimensions)
  const report = useModelStore((s) => s.dimensionReport)
  const theme = useModelStore((s) => s.theme)

  if (!showAutoDimensions || !report) return null

  const linearColor = THEME_COLORS[theme].dimensionLinear
  const diameterColor = THEME_COLORS[theme].dimensionDiameter

  const { boundingBoxMin: min, boundingBoxMax: max, size, diameterGroups, largestGroupIndex, centralBoreGroupIndex, pitchCircle, heights } = report

  const spanRef = Math.max(size.x, size.y, size.z, 1)
  const offsetX = Math.max(size.x, spanRef * 0.2) * 0.09
  const offsetY = Math.max(size.y, spanRef * 0.2) * 0.09
  const arrowSize = spanRef * 0.012

  const boxPoints = boxEdgeSegments(min, max)

  // Longueur (X): pulled below-front. Largeur (Z, depth in this app's Y-up
  // scene): pulled below-front too but shifted right, so it doesn't sit on
  // top of the length cote. Hauteur (Y): pulled out to the right.
  const lengthY = min.y - offsetY
  const lengthStart = new THREE.Vector3(min.x, lengthY, min.z)
  const lengthEnd = new THREE.Vector3(max.x, lengthY, min.z)

  const widthX = max.x + offsetX
  const widthStart = new THREE.Vector3(widthX, lengthY, min.z)
  const widthEnd = new THREE.Vector3(widthX, lengthY, max.z)

  const heightX = max.x + offsetX * 2.2
  const heightStart = new THREE.Vector3(heightX, min.y, min.z)
  const heightEnd = new THREE.Vector3(heightX, max.y, min.z)

  const heightEntries = heights.filter((h) => h.label !== 'Total').slice(0, MAX_RENDERED_HEIGHT_LINES)
  const cumulativeLevels: number[] = [min.y]
  for (const h of heightEntries) cumulativeLevels.push(cumulativeLevels[cumulativeLevels.length - 1] + h.value)

  const usedDirections = new Set<string>()
  function diameterOffsetDirection(axis: THREE.Vector3): THREE.Vector3 {
    const helper = Math.abs(axis.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    const base = new THREE.Vector3().crossVectors(helper, axis).normalize()
    const key = `${axis.x.toFixed(2)},${axis.y.toFixed(2)},${axis.z.toFixed(2)}`
    const count = usedDirections.has(key) ? 1 : 0
    usedDirections.add(key)
    return count === 0 ? base : base.clone().negate()
  }

  const elements: ReactNode[] = []

  diameterGroups.forEach((group, groupIndex) => {
    const isLargest = groupIndex === largestGroupIndex
    const isCentralBore = groupIndex === centralBoreGroupIndex
    const tag = isLargest ? ' (ext. max)' : isCentralBore ? ' (alésage central)' : ''
    const label = group.count > 1 ? `${group.count}× ⌀ ${formatMm(group.radius * 2)}${tag}` : `⌀ ${formatMm(group.radius * 2)}${tag}`
    const offsetDir = diameterOffsetDirection(group.axis)
    group.instanceCenters.forEach((center, i) => {
      elements.push(
        <DiameterCallout
          key={`d-${groupIndex}-${i}`}
          center={center}
          axis={group.axis}
          radius={group.radius}
          label={i === 0 ? label : `⌀ ${formatMm(group.radius * 2)}`}
          offsetDir={offsetDir}
          color={diameterColor}
        />,
      )
    })
  })

  if (pitchCircle) {
    const pcdPoints = makeCirclePoints(pitchCircle.center, pitchCircle.axis, pitchCircle.diameter / 2)
    const helper = Math.abs(pitchCircle.axis.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    const dir = new THREE.Vector3().crossVectors(helper, pitchCircle.axis).normalize()
    const labelPos = pitchCircle.center.clone().addScaledVector(dir, (pitchCircle.diameter / 2) * 1.15)
    const label = pitchCircle.angleStep
      ? `Entraxe ⌀ ${formatMm(pitchCircle.diameter)} · tous les ${formatDeg(pitchCircle.angleStep)}`
      : `Entraxe ⌀ ${formatMm(pitchCircle.diameter)}`
    elements.push(
      <group key="pcd">
        <Line points={pcdPoints} color={PITCH_COLOR} lineWidth={1.5} dashed dashSize={pitchCircle.diameter * 0.02} gapSize={pitchCircle.diameter * 0.015} />
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
        start={lengthStart}
        end={lengthEnd}
        extFromA={new THREE.Vector3(min.x, min.y, min.z)}
        extFromB={new THREE.Vector3(max.x, min.y, min.z)}
        label={`L ${formatMm(size.x)}`}
        color={linearColor}
        arrowSize={arrowSize}
      />
      <DimensionLine
        start={widthStart}
        end={widthEnd}
        extFromA={new THREE.Vector3(max.x, min.y, min.z)}
        extFromB={new THREE.Vector3(max.x, min.y, max.z)}
        label={`l ${formatMm(size.z)}`}
        color={linearColor}
        arrowSize={arrowSize}
      />
      <DimensionLine
        start={heightStart}
        end={heightEnd}
        extFromA={new THREE.Vector3(max.x, min.y, min.z)}
        extFromB={new THREE.Vector3(max.x, max.y, min.z)}
        label={`H ${formatMm(size.y)}`}
        color={linearColor}
        arrowSize={arrowSize}
      />

      {heightEntries.map((h, i) => {
        const x = heightX + offsetX * (i + 1.6)
        const y0 = cumulativeLevels[i]
        const y1 = cumulativeLevels[i + 1]
        return (
          <DimensionLine
            key={`h-${i}`}
            start={new THREE.Vector3(x, y0, min.z)}
            end={new THREE.Vector3(x, y1, min.z)}
            extFromA={new THREE.Vector3(heightX, y0, min.z)}
            extFromB={new THREE.Vector3(heightX, y1, min.z)}
            label={`${h.label} ${formatMm(h.value)}`}
            color={linearColor}
            arrowSize={arrowSize}
          />
        )
      })}

      {elements}
    </group>
  )
}
