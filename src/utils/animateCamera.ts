import * as THREE from 'three'

interface OrbitControlsLike {
  target: THREE.Vector3
  update: () => void
  enabled: boolean
}

// Smooth start and finish, without the abrupt middle of a quadratic ease.
function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// The animation in progress, if any: a new move takes over from wherever the
// camera is (two quick clicks on VUES no longer fight frame by frame).
let running: number | null = null

export function isCameraAnimating(): boolean {
  return running !== null
}

// Duration (ms) scaled to how far the view turns: a small nudge is quick, a
// half-turn (Face -> Arrière) takes its time so the eye can follow it.
function autoDuration(angle: number, zoomRatio: number): number {
  const turn = angle / Math.PI // 0..1
  const zoom = Math.min(Math.abs(Math.log(zoomRatio)), 2) / 2 // 0..1
  return Math.round(420 + 480 * Math.max(turn, zoom * 0.6))
}

function orientationFor(position: THREE.Vector3, lookAt: THREE.Vector3, up: THREE.Vector3): THREE.Quaternion {
  const m = new THREE.Matrix4().lookAt(position, lookAt, up)
  return new THREE.Quaternion().setFromRotationMatrix(m)
}

/**
 * Moves the camera to `targetPosition`, looking at `targetLookAt`.
 *
 * The camera ORBITS the point it looks at instead of travelling in a straight
 * line: its orientation is slerped (so the view turns around the part, and a
 * change of "up" - Dessus/Dessous - rolls in smoothly instead of snapping at
 * the start) and its distance is interpolated on its own (so a half-turn no
 * longer dives through the part and back out). `endUp` is the camera up to
 * finish with (defaults to the current one). `duration` defaults to one
 * scaled to the angle turned; reduced-motion users get a short fade-free move.
 */
export function animateCameraTo(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsLike,
  targetPosition: THREE.Vector3,
  targetLookAt: THREE.Vector3,
  duration?: number,
  endUp?: THREE.Vector3,
) {
  if (running !== null) cancelAnimationFrame(running)

  const startTarget = controls.target.clone()
  const startOffset = camera.position.clone().sub(startTarget)
  const endOffset = targetPosition.clone().sub(targetLookAt)
  const startDistance = startOffset.length() || 1e-6
  const endDistance = endOffset.length() || 1e-6
  const upEnd = (endUp ?? camera.up).clone().normalize()

  const startQuat = camera.quaternion.clone()
  const endQuat = orientationFor(targetPosition, targetLookAt, upEnd)
  const angle = startQuat.angleTo(endQuat)
  const reduceMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const total = reduceMotion ? 120 : (duration ?? autoDuration(angle, endDistance / startDistance))

  const startTime = performance.now()
  const quat = new THREE.Quaternion()
  const back = new THREE.Vector3()
  controls.enabled = false

  function step(now: number) {
    const t = Math.min((now - startTime) / total, 1)
    const eased = easeInOutCubic(t)

    quat.slerpQuaternions(startQuat, endQuat, eased)
    // Log-space distance: zooming in and out feel equally paced.
    const distance = startDistance * Math.pow(endDistance / startDistance, eased)
    controls.target.lerpVectors(startTarget, targetLookAt, eased)
    back.set(0, 0, 1).applyQuaternion(quat).multiplyScalar(distance)
    camera.position.copy(controls.target).add(back)
    // The camera's up follows its own orientation, so OrbitControls (which
    // re-derives the rotation from position/target/up) agrees with the slerp.
    camera.up.set(0, 1, 0).applyQuaternion(quat)
    controls.update()
    camera.quaternion.copy(quat)

    if (t < 1) {
      running = requestAnimationFrame(step)
      return
    }
    running = null
    camera.position.copy(targetPosition)
    camera.up.copy(upEnd)
    controls.target.copy(targetLookAt)
    controls.update()
    controls.enabled = true
  }

  running = requestAnimationFrame(step)
}
