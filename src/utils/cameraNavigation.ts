import * as THREE from 'three'
import type { ScreenRect } from '../types/model'
import { isClipCapMesh } from './clippingCap'

// Camera maths for the SOLIDWORKS/eDrawings-style navigation buttons (see
// Toolbar's "Zoom ajusté" / "Zoom fenêtre"). Pure: each returns where the
// camera should go; the Canvas scene animates it (animateCameraTo) exactly
// like the VUES presets do. Unlike fitCameraToObject (used on load, which
// also resets the orientation to the isometric view), both keep the current
// viewing direction - a zoom must not turn the model.

export interface CameraGoal {
  position: THREE.Vector3
  target: THREE.Vector3
}

function isShown(object: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false
  return true
}

// Bounds of what is actually on screen: hidden parts and section caps don't
// count (fitting a part the user hid would leave empty space around the rest).
// Falls back to the whole model if everything is hidden.
export function visibleBounds(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3()
  root.updateWorldMatrix(true, true)
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && !isClipCapMesh(child) && isShown(child)) box.expandByObject(child)
  })
  return box.isEmpty() ? new THREE.Box3().setFromObject(root) : box
}

// Keeps the camera's current direction and fits the visible model's bounding
// sphere in whichever of the vertical/horizontal fields of view is narrower
// (a wide window is limited by its height, a tall one by its width).
export function zoomToFitGoal(
  camera: THREE.PerspectiveCamera,
  currentTarget: THREE.Vector3,
  root: THREE.Object3D,
  margin = 1.08,
): CameraGoal | null {
  const box = visibleBounds(root)
  if (box.isEmpty()) return null
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const radius = Math.max(sphere.radius, 1e-6)

  const vFov = THREE.MathUtils.degToRad(camera.fov)
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
  const distance = (radius / Math.sin(Math.min(vFov, hFov) / 2)) * margin

  const direction = camera.position.clone().sub(currentTarget)
  if (direction.lengthSq() < 1e-12) direction.set(1, 1, 1)
  direction.normalize()
  return { position: sphere.center.clone().addScaledVector(direction, distance), target: sphere.center.clone() }
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
