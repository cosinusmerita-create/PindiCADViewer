import * as THREE from 'three'

interface OrbitControlsLike {
  target: THREE.Vector3
  update: () => void
  enabled: boolean
}

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

export function animateCameraTo(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsLike,
  targetPosition: THREE.Vector3,
  targetLookAt: THREE.Vector3,
  duration = 300,
) {
  const startPosition = camera.position.clone()
  const startTarget = controls.target.clone()
  const startTime = performance.now()

  controls.enabled = false

  function step(now: number) {
    const elapsed = now - startTime
    const t = Math.min(elapsed / duration, 1)
    const eased = easeInOutQuad(t)

    camera.position.lerpVectors(startPosition, targetPosition, eased)
    controls.target.lerpVectors(startTarget, targetLookAt, eased)
    controls.update()

    if (t < 1) {
      requestAnimationFrame(step)
    } else {
      controls.enabled = true
    }
  }

  requestAnimationFrame(step)
}
