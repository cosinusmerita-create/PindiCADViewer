import * as THREE from 'three'
import type { ComponentNode, ContinuousRotationState, TimedAnimationState } from '../types/model'
import { collectMeshes, findNodeById } from './componentTree'
import { decodeSelectionKey } from './selectionKey'
import { computeExplodeOffsets, type ExplodeOptions } from './explodeModes'
import { snapshotPose, sweepToContact, type Contact, type StaticEntry } from './collision'

export interface PivotEntry {
  pivot: THREE.Group
  center: THREE.Vector3
  meshes: THREE.Mesh[]
  // Assembled bounding-box size (world axes): long parts explode along
  // their own axis (see explodeModes.ts).
  size: THREE.Vector3
}

// Where a selection spins/moves "around its own center": the area-weighted
// centroid of its triangles (world space), NOT the center of its bounding box.
// The two coincide for a simple part, but not for an assembly: a 3-blade rotor
// is symmetric about its mast axis, yet its bounding box is not (the blades
// stick out further on one side), so pivoting on the box center made the whole
// rotor - mast included - orbit a small circle around that off-axis point
// instead of spinning on the mast. Symmetric assemblies have their centroid
// exactly on the symmetry axis, so the mast now stays put. Null when there is
// no usable surface (the caller falls back to the bounding-box center).
function surfaceCentroid(meshes: THREE.Mesh[]): THREE.Vector3 | null {
  const sum = new THREE.Vector3()
  const a = new THREE.Vector3()
  const b = new THREE.Vector3()
  const c = new THREE.Vector3()
  const ab = new THREE.Vector3()
  const ac = new THREE.Vector3()
  let total = 0
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position')
    if (!position) continue
    mesh.updateWorldMatrix(true, false)
    const index = mesh.geometry.index
    const triangleCount = Math.floor((index ? index.count : position.count) / 3)
    for (let t = 0; t < triangleCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2
      a.fromBufferAttribute(position, i0).applyMatrix4(mesh.matrixWorld)
      b.fromBufferAttribute(position, i1).applyMatrix4(mesh.matrixWorld)
      c.fromBufferAttribute(position, i2).applyMatrix4(mesh.matrixWorld)
      const area = ab.subVectors(b, a).cross(ac.subVectors(c, a)).length() / 2
      sum.addScaledVector(a.add(b).add(c), area / 3)
      total += area
    }
  }
  return total > 1e-12 ? sum.divideScalar(total) : null
}

// Lazily wraps every mesh belonging to `key`'s node(s) in a THREE.Group
// centered on their own centroid (see surfaceCentroid), reparenting them with a
// compensating offset so nothing visually moves. That turns the pivot's own
// position/rotation into "move/spin this around its own center" instead of
// around the scene origin, which is where animating a bare mesh's position/
// rotation directly would orbit it: geometry is baked in world space at
// load time, so an unwrapped mesh's own transform starts at (and normally
// stays at) identity - see useFileLoader.ts. Only nodes that actually get
// animated are ever wrapped; everything else stays exactly as the loader
// left it.
//
// `key` is either a single node id or a multi-part selection key (see
// selectionKey.ts) - the same code path handles both, since a multi-part
// selection is really just "one rigid body made of more than one node's
// meshes" as far as the pivot is concerned. That's also what makes
// animating an ad-hoc multi-selection move as one rigid block and rotate
// around their shared centroid: no separate mechanism needed for it.
//
// If some of the target meshes already belong to a different pivot (an
// overlapping selection, e.g. one part was animated alone earlier and is
// now part of a broader multi-selection), they're reclaimed from that old
// pivot - reattached directly under `object` (THREE.Object3D.attach
// preserves world transform) - rather than silently left out, which used
// to mean the whole group could visibly fail to move whenever any of its
// parts had already been individually animated.
export function getOrCreatePivot(
  registry: Map<string, PivotEntry>,
  object: THREE.Object3D,
  tree: ComponentNode,
  key: string,
): PivotEntry | null {
  const existing = registry.get(key)
  if (existing) return existing

  const nodes = decodeSelectionKey(key)
    .map((id) => findNodeById(tree, id))
    .filter((n): n is ComponentNode => n !== null)
  if (nodes.length === 0) return null

  const candidateMeshes = Array.from(new Set(nodes.flatMap((node) => collectMeshes(node))))
  object.updateMatrixWorld(true)
  for (const mesh of candidateMeshes) {
    if (mesh.parent !== object) object.attach(mesh)
  }

  const meshes = candidateMeshes.filter((mesh) => mesh.parent === object)
  if (meshes.length === 0) return null

  const boundingBox = new THREE.Box3()
  for (const mesh of meshes) boundingBox.expandByObject(mesh)
  const center = surfaceCentroid(meshes) ?? boundingBox.getCenter(new THREE.Vector3())

  const pivot = new THREE.Group()
  pivot.position.copy(center)
  object.add(pivot)

  for (const mesh of meshes) {
    pivot.add(mesh)
    mesh.position.copy(center).negate()
  }

  const entry: PivotEntry = { pivot, center, meshes, size: boundingBox.getSize(new THREE.Vector3()) }
  registry.set(key, entry)
  return entry
}

export function resetPivot(entry: PivotEntry) {
  entry.pivot.position.copy(entry.center)
  entry.pivot.rotation.set(0, 0, 0)
}

// Continuous spin: each enabled axis advances independently every frame -
// simple and matches how a preview/turntable spin is expected to look, at
// the cost of not being a single well-defined 3D rotation when more than
// one axis is enabled at once (each is just its own running Euler angle).
export function applyContinuousRotation(entry: PivotEntry, state: ContinuousRotationState, delta: number) {
  const radiansPerSecond = state.speed * Math.PI * 2 * state.direction
  if (state.axes.x) entry.pivot.rotation.x += radiansPerSecond * delta
  if (state.axes.y) entry.pivot.rotation.y += radiansPerSecond * delta
  if (state.axes.z) entry.pivot.rotation.z += radiansPerSecond * delta
}

export interface TimedRuntime {
  runId: number
  axis: 'x' | 'y' | 'z'
  kind: 'rotation' | 'translation'
  mode: 'once' | 'yoyo'
  from: number
  to: number
  duration: number
  elapsed: number
  finished: boolean
  // Set when the run was started with "stop on collision": the parts that
  // stay put and the contacts that already existed at the start.
  collision: CollisionContext | null
}

export interface CollisionContext {
  statics: StaticEntry[]
  ignore: Set<string>
}

// Supplied by the 3D scene, which owns the tree/meshes the test needs.
export interface TimedCollisionHooks {
  createContext: (entry: PivotEntry) => CollisionContext
  onContact: (contact: Contact, nodeId: string) => void
}

// Smoothstep - a cheap, dependency-free easeInOut: 0 and 1 slopes both
// flatten to zero, giving the "ease in, ease out" feel the spec asks for
// without pulling in gsap.
function easeInOut(t: number): number {
  return t * t * (3 - 2 * t)
}

// Advances (or (re)starts) a node's timed rotation/translation. `from` is
// always read from wherever the pivot currently sits, so repeated Tourner/
// Déplacer clicks stack from the current position rather than jumping back
// to zero, and `runId` (bumped by the store every time a new run starts)
// is what tells this apart from just continuing the same run across frames.
export function applyTimed(
  entry: PivotEntry,
  config: TimedAnimationState,
  runtime: Map<string, TimedRuntime>,
  nodeId: string,
  delta: number,
  onFinished: (nodeId: string) => void,
  hooks?: TimedCollisionHooks,
) {
  let track = runtime.get(nodeId)
  if (!track || track.runId !== config.runId) {
    const current = config.kind === 'rotation' ? entry.pivot.rotation[config.axis] : entry.pivot.position[config.axis]
    const deltaValue = config.kind === 'rotation' ? THREE.MathUtils.degToRad(config.targetValue) : config.targetValue
    track = {
      runId: config.runId,
      axis: config.axis,
      kind: config.kind,
      mode: config.mode,
      from: current,
      to: current + deltaValue,
      duration: Math.max(config.duration, 0.001),
      elapsed: 0,
      finished: false,
      collision: config.stopOnCollision && hooks ? hooks.createContext(entry) : null,
    }
    runtime.set(nodeId, track)
  }

  if (track.finished) return

  track.elapsed += delta
  const t = Math.min(track.elapsed / track.duration, 1)
  const value = THREE.MathUtils.lerp(track.from, track.to, easeInOut(t))
  const before = track.collision ? snapshotPose(entry.pivot) : null
  if (track.kind === 'rotation') entry.pivot.rotation[track.axis] = value
  else entry.pivot.position[track.axis] = value

  // Stop dead at the first new contact: sweep from where the part was at
  // the start of this frame to where the animation wants it now, keep the
  // free part of that path, and end the run there.
  if (track.collision && before) {
    entry.pivot.updateMatrixWorld(true)
    const { contact } = sweepToContact(
      entry.pivot,
      entry.meshes,
      before,
      snapshotPose(entry.pivot),
      track.collision.statics,
      track.collision.ignore,
    )
    if (contact) {
      track.finished = true
      hooks?.onContact(contact, nodeId)
      onFinished(nodeId)
      return
    }
  }

  if (t >= 1) {
    if (track.mode === 'yoyo') {
      const swap = track.from
      track.from = track.to
      track.to = swap
      track.elapsed = 0
    } else {
      track.finished = true
      onFinished(nodeId)
    }
  }
}

// Displaces every part according to the active explode layout (radial,
// axial or per-sub-assembly - see explodeModes.ts), scaled by `factor`
// (0 = assembled). Radial keeps the original behavior: each part moves along
// its own (center - assemblyCenter) vector, so parts farther from the center
// travel proportionally farther.
export function applyExplode(
  registry: Map<string, PivotEntry>,
  object: THREE.Object3D,
  tree: ComponentNode,
  partNodeIds: string[],
  assemblyCenter: THREE.Vector3,
  factor: number,
  groups: Map<string, string>,
  options: ExplodeOptions,
) {
  const entries = new Map<string, PivotEntry>()
  const centers = new Map<string, THREE.Vector3>()
  const sizes = new Map<string, THREE.Vector3>()
  for (const nodeId of partNodeIds) {
    const entry = getOrCreatePivot(registry, object, tree, nodeId)
    if (!entry) continue
    entries.set(nodeId, entry)
    centers.set(nodeId, entry.center)
    sizes.set(nodeId, entry.size)
  }

  const offsets = computeExplodeOffsets(centers, groups, assemblyCenter, factor, options, sizes)
  for (const [nodeId, entry] of entries) {
    entry.pivot.position.copy(entry.center).add(offsets.get(nodeId)!)
  }
}

// Fills `positions` (pairs of xyz: assembled center -> current center) for
// every part that has a pivot, and returns how many vertices were written.
// Drives the dashed "guide lines" that keep an exploded view readable.
export function fillGuideLines(
  positions: Float32Array,
  registry: Map<string, PivotEntry>,
  partNodeIds: string[],
): number {
  let v = 0
  for (const nodeId of partNodeIds) {
    const entry = registry.get(nodeId)
    if (!entry || (v + 2) * 3 > positions.length) continue
    positions.set([entry.center.x, entry.center.y, entry.center.z], v * 3)
    positions.set([entry.pivot.position.x, entry.pivot.position.y, entry.pivot.position.z], (v + 1) * 3)
    v += 2
  }
  return v
}
