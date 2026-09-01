import * as THREE from 'three'
import { computeSectionGeometry } from './sectionCap'
import { getPrimaryMaterial } from './componentTree'

const CAP_DARKEN_FACTOR = 0.6

export function isClipCapMesh(object: THREE.Object3D): boolean {
  return object.userData.isClipCap === true
}

function createSectionCapMesh(): THREE.Mesh {
  const material = new THREE.MeshStandardMaterial({
    color: 0x888888,
    metalness: 0.1,
    roughness: 0.8,
    side: THREE.DoubleSide,
  })
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material)
  mesh.userData.isClipCap = true
  mesh.visible = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  return mesh
}

// Attached as a child of its OWN source mesh (not the model's root) so it
// automatically inherits that part's local transform, animation pivot, and
// visibility for free - a part that's hidden, exploded, or spun by the
// animation panel carries its cap along without any extra bookkeeping here.
function getOrCreateMeshSectionCap(mesh: THREE.Mesh): THREE.Mesh {
  let cap = mesh.userData.sectionCapMesh as THREE.Mesh | undefined
  if (!cap) {
    cap = createSectionCapMesh()
    mesh.add(cap)
    mesh.userData.sectionCapMesh = cap
  }
  return cap
}

function collectClipEligibleMeshes(object: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = []
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && child.visible && !isClipCapMesh(child)) meshes.push(child)
  })
  return meshes
}

// Rebuilds every part's cap from ONLY that part's own triangle/plane
// crossings, rather than one merged cap for the whole assembly (the
// previous approach). Merging every part's crossing loops together before
// classifying outer boundaries vs. holes made an assembly's inner parts
// (e.g. a shaft passing through a housing) look chaotic: a shaft's small
// cross-section loop sits, in the flattened 2D projection used to detect
// nesting, well inside the housing's outer loop - so it got misclassified
// as a HOLE of the housing instead of a solid disk of its own. That punched
// a shaft-shaped gap straight through the housing's cap and left the shaft
// itself uncapped, so the cut looked hollow and any further geometry behind
// it showed through. Keeping each part's segments/loops/triangulation fully
// separate makes that misclassification impossible - a bore that's
// legitimately a hole stays correctly nested (it's the same mesh, so the
// same 2D projection space), while two different parts can never be
// mistaken for one another's hole. Each cap is also tinted from its own
// part's real color (darkened, like a SolidWorks section view) instead of
// one flat gray for the whole assembly.
export function updateAllSectionCaps(object: THREE.Object3D, plane: THREE.Plane) {
  object.updateMatrixWorld(true)

  for (const mesh of collectClipEligibleMeshes(object)) {
    const cap = getOrCreateMeshSectionCap(mesh)
    const geometry = computeSectionGeometry(mesh, plane)
    const oldGeometry = cap.geometry
    cap.geometry = geometry ? geometry.applyMatrix4(mesh.matrixWorld.clone().invert()) : new THREE.BufferGeometry()
    oldGeometry.dispose()
    cap.visible = true

    const capMaterial = cap.material as THREE.MeshStandardMaterial
    capMaterial.color.copy(getPrimaryMaterial(mesh).color).multiplyScalar(CAP_DARKEN_FACTOR)
  }
}

export function hideAllSectionCaps(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && isClipCapMesh(child)) child.visible = false
  })
}
