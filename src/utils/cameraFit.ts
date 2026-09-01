import * as THREE from 'three'

interface OrbitControlsLike {
  target: THREE.Vector3
  update: () => void
}

export function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsLike,
  object: THREE.Object3D,
  offset = 1.6,
) {
  const box = new THREE.Box3().setFromObject(object)
  if (box.isEmpty()) return

  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1

  const fov = camera.fov * (Math.PI / 180)
  let cameraDistance = maxDim / 2 / Math.tan(fov / 2)
  cameraDistance *= offset

  const direction = new THREE.Vector3(1, 0.8, 1).normalize()
  camera.position.copy(center.clone().add(direction.multiplyScalar(cameraDistance)))
  camera.near = Math.max(cameraDistance / 100, 0.001)
  camera.far = Math.max(cameraDistance * 100, 1000)
  camera.updateProjectionMatrix()

  controls.target.copy(center)
  controls.update()
}
