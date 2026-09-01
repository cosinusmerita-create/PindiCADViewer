import { useMemo } from 'react'
import * as THREE from 'three'
import { Html, Line } from '@react-three/drei'
import type { SnapResult } from '../utils/snapping'
import { isFullCircle } from '../utils/surfacePatches'

const EDGE_COLOR = '#4488ff'
const CIRCLE_COLOR = '#00ff00'
const VERTEX_COLOR = '#ff8c00'

function formatMm(value: number) {
  return `${value.toFixed(2)} mm`
}

function formatDeg(radians: number) {
  return `${THREE.MathUtils.radToDeg(radians).toFixed(2)}°`
}

// Draws the actual arc a detected patch covers rather than always a full
// loop: a hole/boss rim or a full cylinder (angularSpan ~= 2*PI) reads as a
// closed circle, while a fillet/rounded blend (a partial band between two
// faces) reads as the real arc it is instead of a misleadingly complete ring.
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

// A flat cross lying in the circle's own plane, marking its center like a
// crosshair - oriented by rotating the local +Z-facing cross to the
// circle's normal.
function CenterCross({ center, normal, size }: { center: THREE.Vector3; normal: THREE.Vector3; size: number }) {
  const quaternion = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal),
    [normal],
  )
  return (
    <group position={center} quaternion={quaternion}>
      <mesh>
        <boxGeometry args={[size * 2.2, size * 0.25, size * 0.25]} />
        <meshBasicMaterial color={CIRCLE_COLOR} />
      </mesh>
      <mesh>
        <boxGeometry args={[size * 0.25, size * 2.2, size * 0.25]} />
        <meshBasicMaterial color={CIRCLE_COLOR} />
      </mesh>
      <mesh>
        <sphereGeometry args={[size * 0.6, 12, 12]} />
        <meshBasicMaterial color={CIRCLE_COLOR} wireframe />
      </mesh>
    </group>
  )
}

// SolidWorks-style snap feedback in measure mode: highlights the hovered
// feature and shows a distinct marker + live readout per type - straight
// edges in blue with their length, circles/arcs in green with their
// diameter/radius (and, for an arc, its angle and arc length), a vertex as
// an orange square.
export function SnapIndicator({
  snap,
  markerRadius,
  isTouch = false,
}: {
  snap: SnapResult
  markerRadius: number
  isTouch?: boolean
}) {
  const size = markerRadius * 1.4
  // Touch has no hover to read a small label at leisure - bigger, bolder,
  // more opaque so it's legible at arm's length with a finger nearby.
  const labelClass = isTouch
    ? 'rounded border border-white/10 bg-[#16162a]/98 px-2.5 py-1.5 text-base font-bold shadow-lg'
    : 'rounded border border-white/10 bg-[#16162a]/90 px-2 py-1 text-xs shadow-lg'

  return (
    <group>
      {snap.type === 'circle' && snap.circle && (
        <>
          <Line
            points={makeCirclePoints(
              snap.circle.center,
              snap.circle.normal,
              snap.circle.radius,
              snap.circle.startAngle,
              snap.circle.angularSpan,
            )}
            color={CIRCLE_COLOR}
            lineWidth={3}
          />
          <CenterCross center={snap.circle.center} normal={snap.circle.normal} size={size} />
          <Html position={snap.circle.center} pointerEvents="none" style={{ transform: 'translate(12px, -12px)' }}>
            <div className={labelClass}>
              {isFullCircle(snap.circle.angularSpan) ? (
                <p className="whitespace-nowrap font-medium text-emerald-400">
                  ⌀ {formatMm(snap.circle.radius * 2)} · R {formatMm(snap.circle.radius)}
                </p>
              ) : (
                <>
                  <p className="whitespace-nowrap font-medium text-emerald-400">R {formatMm(snap.circle.radius)}</p>
                  <p className="mt-0.5 whitespace-nowrap text-[10px] text-emerald-500/80">
                    {formatDeg(snap.circle.angularSpan)} · arc {formatMm(snap.circle.radius * snap.circle.angularSpan)}
                  </p>
                </>
              )}
              <p className="mt-0.5 whitespace-nowrap text-[10px] text-slate-400">
                Centre: {snap.circle.center.x.toFixed(2)}, {snap.circle.center.y.toFixed(2)},{' '}
                {snap.circle.center.z.toFixed(2)} mm
              </p>
            </div>
          </Html>
        </>
      )}

      {snap.type !== 'circle' && snap.segmentStart && snap.segmentEnd && (
        <>
          <Line points={[snap.segmentStart, snap.segmentEnd]} color={EDGE_COLOR} lineWidth={3} />
          {snap.length !== null && (
            <Html
              position={snap.segmentStart.clone().add(snap.segmentEnd).multiplyScalar(0.5)}
              pointerEvents="none"
              style={{ transform: 'translate(12px, -12px)' }}
            >
              <div className={labelClass}>
                <p className="whitespace-nowrap font-medium text-sky-300">L = {formatMm(snap.length)}</p>
              </div>
            </Html>
          )}
        </>
      )}

      {snap.type === 'vertex' && (
        <mesh position={snap.point}>
          <boxGeometry args={[size, size, size]} />
          <meshBasicMaterial color={VERTEX_COLOR} />
        </mesh>
      )}

      {snap.type === 'midpoint' && (
        <mesh position={snap.point} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[size * 0.8, size * 1.1, 3]} />
          <meshBasicMaterial color={EDGE_COLOR} />
        </mesh>
      )}

      {snap.type === 'edge' && (
        <mesh position={snap.point}>
          <sphereGeometry args={[size * 0.55, 12, 12]} />
          <meshBasicMaterial color={EDGE_COLOR} />
        </mesh>
      )}
    </group>
  )
}
