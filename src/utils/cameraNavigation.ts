import * as THREE from 'three'
import type { ScreenRect } from '../types/model'

// Camera maths for "Zoom fenêtre" (navigation buttons after VUES). Pure: it
// returns where the camera should go; the Canvas scene animates it
// (animateCameraTo) like the VUES presets. It keeps the current viewing
// direction - a zoom must not turn the model. "Zoom ajusté" uses the shared
// whole-model framing of cameraFit.ts.

export interface CameraGoal {
  position: THREE.Vector3
  target: THREE.Vector3
}

// Zooms so that the dragged rectangle fills the view: the new target is the
// point under the rectangle's centre on the current focal plane (through the
// orbit target, facing the camera), and the camera moves along the unchanged
// viewing direction by the rectangle/viewport size ratio - the larger of the
// two ratios, so the whole rectangle stays visible.
export function zoomToRectGoal(
  camera: THREE.PerspectiveCamera,
  currentTarget: THREE.Vector3,
  rect: ScreenRect,
  viewportWidth: number,
  viewportHeight: number,
): CameraGoal | null {
  const w = rect.maxX - rect.minX
  const h = rect.maxY - rect.minY
  if (w < 1 || h < 1 || viewportWidth < 1 || viewportHeight < 1) return null

  const cx = (rect.minX + rect.maxX) / 2
  const cy = (rect.minY + rect.maxY) / 2
  const ndc = new THREE.Vector2((cx / viewportWidth) * 2 - 1, -((cy / viewportHeight) * 2 - 1))

  const viewDir = currentTarget.clone().sub(camera.position)
  const distance = viewDir.length()
  if (distance < 1e-9) return null
  viewDir.normalize()

  const raycaster = new THREE.Raycaster()
  raycaster.setFromCamera(ndc, camera)
  const focalPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(viewDir, currentTarget)
  const newTarget = raycaster.ray.intersectPlane(focalPlane, new THREE.Vector3())
  if (!newTarget) return null

  const ratio = Math.max(w / viewportWidth, h / viewportHeight)
  const newDistance = Math.max(distance * ratio, camera.near * 2)
  return { position: newTarget.clone().addScaledVector(viewDir, -newDistance), target: newTarget }
}
