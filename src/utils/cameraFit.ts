import * as THREE from 'three'
import { VIEW_DEFINITIONS } from './cameraViews'
import { isClipCapMesh } from './clippingCap'
import type { ViewPreset } from '../types/model'

// The ONE framing used everywhere the camera is placed on the whole model:
// file opening, "Réinitialiser la vue", "État d'origine", the VUES presets,
// "Zoom ajusté" (current direction) and the PDF's 4-view capture.
//
// Why it exists: fitting used THREE.Box3.setFromObject(model group), which
// also counts helpers parented to that group - hidden ones included. The
// exploded-view guide lines (Viewer3D's AnimationController) live there,
// invisible, all their points at (0,0,0): any file modelled away from the
// origin got a box stretched back to it. "Assemblage_Mode_Flasque" sits
// ~1 m from the origin, so the camera aimed half-way and backed off to
// 2 m for a 307 mm assembly - a tiny model in the middle of a huge grid.

interface OrbitControlsLike {
  target: THREE.Vector3
  update: () => void
}

// Share of the view taken by the model, in its tighter direction (70-80 %).
export const FRAME_FILL = 0.75

function isShown(object: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let o: THREE.Object3D | null = object; o && o !== root.parent; o = o.parent) if (!o.visible) return false
  return true
}

/**
 * Bounds of the model's PARTS only (meshes tagged with a node id by the
 * loader), in world space: no helper lines, section caps, gizmos or guides.
 * Hidden parts are left out (framing empty space is useless) unless every
 * part is hidden. Each part's geometry box is used rather than a traversal,
 * so children hung on a part (edge lines, caps) can't widen it either.
 */
export function modelBounds(root: THREE.Object3D): THREE.Box3 {
  root.updateWorldMatrix(true, true)
  const parts: THREE.Mesh[] = []
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.userData.nodeId !== undefined && !isClipCapMesh(child)) parts.push(child)
  })
  // Files whose meshes were never tagged: every real mesh counts.
  if (parts.length === 0) {
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && !isClipCapMesh(child)) parts.push(child)
    })
  }
  const shown = parts.filter((mesh) => isShown(mesh, root))
  const box = new THREE.Box3()
  const partBox = new THREE.Box3()
  for (const mesh of shown.length > 0 ? shown : parts) {
    const geometry = mesh.geometry
    if (!geometry.boundingBox) geometry.computeBoundingBox()
    if (!geometry.boundingBox || geometry.boundingBox.isEmpty()) continue
    box.union(partBox.copy(geometry.boundingBox).applyMatrix4(mesh.matrixWorld))
  }
  return box
}

export interface FrameGoal {
  position: THREE.Vector3
  target: THREE.Vector3
  up: THREE.Vector3
  near: number
  far: number
}

// Points outlining the model for the exact framing: the parts' own vertices
// (box corners overshoot - seen in iso, a cylinder never reaches the corners
// of its box), evenly sampled down to POINT_BUDGET so a large assembly stays
// instant. A skipped vertex on a CAD tessellation moves the outline by a
// fraction of a facet at most - far inside the 25 % margin.
const POINT_BUDGET = 60000

function* partPoints(root: THREE.Object3D): Generator<THREE.Vector3> {
  const parts: THREE.Mesh[] = []
  root.traverse((child) => {
    if (child instanceof THREE.Mesh && child.userData.nodeId !== undefined && !isClipCapMesh(child)) parts.push(child)
  })
  const shown = parts.filter((mesh) => isShown(mesh, root))
  const used = shown.length > 0 ? shown : parts
  const total = used.reduce((n, mesh) => n + (mesh.geometry.attributes.position?.count ?? 0), 0)
  const step = Math.max(1, Math.ceil(total / POINT_BUDGET))
  const p = new THREE.Vector3()
  for (const mesh of used) {
    const position = mesh.geometry.attributes.position as THREE.BufferAttribute | undefined
    if (!position) continue
    for (let i = 0; i < position.count; i += step) yield p.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld)
  }
}

/**
 * Camera placement looking along `direction` (from the model toward the
 * camera), aimed at the model's centre, at the distance where the model
 * fills `fill` of the view in whichever direction is tighter - so a tall
 * part fills the height of a wide window, a long one its width.
 *
 * The distance is exact for the chosen orientation: every model point
 * is expressed in the camera's frame and must project inside the frame
 * (the bounding sphere alone is too cautious: seen from the side, a
 * 247 x 307 x 120 mm assembly only filled half the height). near/far follow
 * the bounding sphere, so a 20 mm part and a 3 m assembly get the same depth
 * precision.
 */
export function frameGoal(
  camera: THREE.PerspectiveCamera,
  root: THREE.Object3D,
  direction: THREE.Vector3,
  up: THREE.Vector3 = camera.up,
  fill = FRAME_FILL,
): FrameGoal | null {
  const box = modelBounds(root)
  if (box.isEmpty()) return null
  const sphere = box.getBoundingSphere(new THREE.Sphere())
  const radius = Math.max(sphere.radius, 1e-6)
  const center = box.getCenter(new THREE.Vector3())

  const dir = direction.clone()
  if (dir.lengthSq() < 1e-12) dir.set(1, 1, 1)
  dir.normalize()
  // Camera frame: z toward the camera, x to the right, y up on screen.
  let right = new THREE.Vector3().crossVectors(up, dir)
  if (right.lengthSq() < 1e-10) right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 0, 1), dir)
  right.normalize()
  const screenUp = new THREE.Vector3().crossVectors(dir, right)

  const vHalf = THREE.MathUtils.degToRad(camera.fov) / 2
  const tanV = Math.tan(vHalf) * fill
  const tanH = Math.tan(vHalf) * camera.aspect * fill
  const points = Array.from(partPoints(root), (p) => p.clone())
  const rel = new THREE.Vector3()
  let distance = radius
  // Two passes: fit around the box centre, then move the aim to the middle of
  // what is actually seen (an asymmetric outline would otherwise leave more
  // room on one side) and fit again around it.
  for (let pass = 0; pass < 2; pass++) {
    distance = radius * 0.1
    for (const point of points) {
      rel.subVectors(point, center)
      const depth = rel.dot(dir) // toward the camera: closer, so it looks bigger
      const needed = depth + Math.max(Math.abs(rel.dot(right)) / tanH, Math.abs(rel.dot(screenUp)) / tanV)
      distance = Math.max(distance, needed)
    }
    if (pass === 1) break
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const point of points) {
      rel.subVectors(point, center)
      const depth = distance - rel.dot(dir)
      const x = rel.dot(right) / depth
      const y = rel.dot(screenUp) / depth
      minX = Math.min(minX, x); maxX = Math.max(maxX, x)
      minY = Math.min(minY, y); maxY = Math.max(maxY, y)
    }
    if (!Number.isFinite(minX)) break
    center.addScaledVector(right, ((minX + maxX) / 2) * distance).addScaledVector(screenUp, ((minY + maxY) / 2) * distance)
  }

  return {
    position: center.clone().addScaledVector(dir, distance),
    target: center,
    up: up.clone(),
    // Close enough to zoom right into a detail, far enough to back off a lot.
    near: Math.max(radius * 0.005, distance * 1e-4),
    far: distance + radius * 60,
  }
}

// near/far must be set BEFORE an animated move starts, or the model can be
// clipped on its way (a camera coming from much closer or farther).
export function applyClipRange(camera: THREE.PerspectiveCamera, goal: FrameGoal) {
  camera.near = goal.near
  camera.far = goal.far
  camera.updateProjectionMatrix()
}

// Instant placement (file opening, PDF captures).
export function applyFrame(camera: THREE.PerspectiveCamera, controls: OrbitControlsLike, goal: FrameGoal) {
  applyClipRange(camera, goal)
  camera.up.copy(goal.up)
  camera.position.copy(goal.position)
  controls.target.copy(goal.target)
  controls.update()
}

// Opening a file: whole model, in the start view chosen in Options (ISO by
// default, same as the ISO button).
export function fitCameraToObject(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsLike,
  object: THREE.Object3D,
  view: ViewPreset = 'iso',
) {
  const { direction, up } = VIEW_DEFINITIONS[view]
  const goal = frameGoal(camera, object, direction, up)
  if (goal) applyFrame(camera, controls, goal)
}

// Grid under the model, the classic CAD way: fine cells of about 1/25 of the
// model's largest dimension, rounded to the nearest 1, 2 or 5 x 10^n mm
// (10 mm cells for a 300 mm assembly, 1 mm for a 28 mm part), a thicker line
// every 5 cells, over about 3 times the model. The previous 4-cell sections
// over 16 coarse cells read as a few huge squares on assemblies.
const CELLS_PER_MODEL = 25

export function gridForBounds(box: THREE.Box3): { x: number; y: number; z: number; size: number; cell: number; section: number } {
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const raw = maxDim / CELLS_PER_MODEL
  const power = Math.pow(10, Math.floor(Math.log10(raw)))
  // Nearest step on a log scale (15 mm -> 20, 12 mm -> 10).
  const cell = [1, 2, 5, 10]
    .map((m) => m * power)
    .reduce((best, step) => (Math.abs(Math.log(step / raw)) < Math.abs(Math.log(best / raw)) ? step : best))
  const section = cell * 5
  return { x: center.x, y: box.min.y, z: center.z, size: Math.ceil((maxDim * 3) / section) * section, cell, section }
}
