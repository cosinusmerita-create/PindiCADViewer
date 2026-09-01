import { useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import { useModelStore } from '../hooks/useModelState'
import type { Measurement } from '../types/model'
import { isFullCircle } from '../utils/surfacePatches'

const MARKER_COLOR = '#ef4444'
const LINE_COLOR = '#fde047'
const CIRCLE_COLOR = '#00ff00'
const LEADER_COLOR = '#f8fafc'
const DEFAULT_AXIS = new THREE.Vector3(0, 1, 0)

function formatCoord(value: number) {
  return `${value.toFixed(2)}mm`
}

function formatMm(value: number) {
  return `${value.toFixed(2)} mm`
}

function formatDeg(radians: number) {
  return `${THREE.MathUtils.radToDeg(radians).toFixed(2)}°`
}

function formatAxis(axis: THREE.Vector3) {
  return `(${axis.x.toFixed(2)}, ${axis.y.toFixed(2)}, ${axis.z.toFixed(2)})`
}

// Draws the actual arc a detected patch covers: a hole/boss rim or a full
// cylinder (angularSpan ~= 2*PI, or unset for legacy edge-loop circles)
// reads as a closed circle, a fillet/rounded blend reads as its real arc.
function makeCirclePoints(
  center: THREE.Vector3,
  axis: THREE.Vector3,
  radius: number,
  startAngle: number,
  angularSpan: number,
  segments = 48,
) {
  const helper = Math.abs(axis.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
  const u = new THREE.Vector3().crossVectors(helper, axis).normalize()
  const v = new THREE.Vector3().crossVectors(axis, u).normalize()
  const full = isFullCircle(angularSpan)
  const span = full ? Math.PI * 2 : angularSpan
  const start = full ? 0 : startAngle
  const points: THREE.Vector3[] = []
  for (let i = 0; i <= segments; i++) {
    const t = start + (i / segments) * span
    points.push(center.clone().addScaledVector(u, Math.cos(t) * radius).addScaledVector(v, Math.sin(t) * radius))
  }
  return points
}

function Arrow({ tip, direction, size }: { tip: THREE.Vector3; direction: THREE.Vector3; size: number }) {
  const quaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction),
    [direction],
  )
  return (
    <mesh position={tip} quaternion={quaternion}>
      <coneGeometry args={[size * 0.35, size, 12]} />
      <meshBasicMaterial color={LINE_COLOR} />
    </mesh>
  )
}

function labelClass(isTouch: boolean) {
  return isTouch
    ? 'rounded border border-white/10 bg-[#16162a]/98 px-2.5 py-1.5 text-center text-base font-bold shadow-lg'
    : 'rounded border border-white/10 bg-[#16162a]/90 px-2 py-1 text-center text-xs shadow-lg'
}

function DistanceMeasurement({
  measurement,
  markerRadius,
  isTouch,
}: {
  measurement: Measurement
  markerRadius: number
  isTouch: boolean
}) {
  const { point1, point2 } = measurement
  const safePoint2 = point2 ?? point1
  const mid = useMemo(() => point1.clone().add(safePoint2).multiplyScalar(0.5), [point1, safePoint2])
  const direction = useMemo(() => safePoint2.clone().sub(point1).normalize(), [point1, safePoint2])
  const delta = useMemo(() => safePoint2.clone().sub(point1), [point1, safePoint2])
  const arrowSize = markerRadius * 1.8

  if (!point2) return null

  return (
    <group>
      <mesh position={point1}>
        <sphereGeometry args={[markerRadius, 16, 16]} />
        <meshBasicMaterial color={MARKER_COLOR} />
      </mesh>
      <mesh position={point2}>
        <sphereGeometry args={[markerRadius, 16, 16]} />
        <meshBasicMaterial color={MARKER_COLOR} />
      </mesh>
      <Line points={[point1, point2]} color={LINE_COLOR} lineWidth={1.5} />
      <Arrow tip={point1} direction={direction.clone().negate()} size={arrowSize} />
      <Arrow tip={point2} direction={direction} size={arrowSize} />
      <Html position={mid} center pointerEvents="none">
        <div className={`${labelClass(isTouch)} text-slate-100`}>
          <p className="font-medium whitespace-nowrap">{formatMm(measurement.distance ?? 0)}</p>
          <p className="mt-0.5 whitespace-nowrap text-[10px] text-slate-400">
            ΔX {delta.x.toFixed(2)} · ΔY {delta.y.toFixed(2)} · ΔZ {delta.z.toFixed(2)}
          </p>
        </div>
      </Html>
    </group>
  )
}

function DiameterMeasurement({
  measurement,
  markerRadius,
  isTouch,
}: {
  measurement: Measurement
  markerRadius: number
  isTouch: boolean
}) {
  const { point1, axis, center, radius, startAngle, angularSpan } = measurement
  const safeAxis = axis ?? DEFAULT_AXIS
  const safeCenter = center ?? point1
  const safeRadius = radius ?? 0
  const safeStartAngle = startAngle ?? 0
  const safeAngularSpan = angularSpan ?? Math.PI * 2
  const full = isFullCircle(safeAngularSpan)

  const circlePoints = useMemo(
    () => makeCirclePoints(safeCenter, safeAxis, safeRadius, safeStartAngle, safeAngularSpan),
    [safeCenter, safeAxis, safeRadius, safeStartAngle, safeAngularSpan],
  )
  // Label sits just outside the circle, offset along the plane's own "up"
  // basis vector so it doesn't sit right on top of the rim.
  const labelPosition = useMemo(() => {
    const helper = Math.abs(safeAxis.y) < 0.99 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0)
    const up = new THREE.Vector3().crossVectors(safeAxis, helper).normalize()
    return safeCenter.clone().addScaledVector(up, safeRadius + markerRadius * 3)
  }, [safeCenter, safeAxis, safeRadius, markerRadius])

  if (!axis || !center || radius == null) return null

  return (
    <group>
      <mesh position={point1}>
        <sphereGeometry args={[markerRadius, 16, 16]} />
        <meshBasicMaterial color={MARKER_COLOR} />
      </mesh>
      <Line points={circlePoints} color={CIRCLE_COLOR} lineWidth={2} />
      <Line points={[center, labelPosition]} color={LEADER_COLOR} lineWidth={1} />
      <mesh position={center}>
        <sphereGeometry args={[markerRadius * 0.6, 12, 12]} />
        <meshBasicMaterial color={CIRCLE_COLOR} />
      </mesh>
      <Html position={labelPosition} center pointerEvents="none">
        <div className={labelClass(isTouch)}>
          <p className="font-medium whitespace-nowrap text-emerald-400">
            {full ? `⌀ ${formatMm(radius * 2)} · R ${formatMm(radius)}` : `R ${formatMm(radius)}`}
          </p>
          {!full && (
            <p className="mt-0.5 whitespace-nowrap text-[10px] text-emerald-500/80">
              {formatDeg(safeAngularSpan)} · arc {formatMm(radius * safeAngularSpan)}
            </p>
          )}
          <p className="mt-0.5 whitespace-nowrap text-[10px] text-slate-400">
            Centre: {formatCoord(center.x)}, {formatCoord(center.y)}, {formatCoord(center.z)}
          </p>
          <p className="mt-0.5 whitespace-nowrap text-[10px] text-slate-400">Axe: {formatAxis(axis)}</p>
          {measurement.approx && <p className="mt-0.5 text-[10px] text-slate-500">(approx)</p>}
        </div>
      </Html>
    </group>
  )
}

export function MeasurementsGroup({ markerRadius, isTouch = false }: { markerRadius: number; isTouch?: boolean }) {
  const measurements = useModelStore((s) => s.measurements)

  return (
    <group>
      {measurements.map((m) =>
        m.type === 'distance' ? (
          <DistanceMeasurement key={m.id} measurement={m} markerRadius={markerRadius} isTouch={isTouch} />
        ) : (
          <DiameterMeasurement key={m.id} measurement={m} markerRadius={markerRadius} isTouch={isTouch} />
        ),
      )}
    </group>
  )
}
