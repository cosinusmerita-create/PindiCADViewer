import * as THREE from 'three'
import type { ComponentNode, ContinuousRotationState, TimedAnimationState } from '../types/model'
import { collectMeshes, findNodeById } from './componentTree'
import { decodeSelectionKey } from './selectionKey'

export interface PivotEntry {
  pivot: THREE.Group
  center: THREE.Vector3
  meshes: THREE.Mesh[]
}

// Lazily wraps every mesh belonging to `key`'s node(s) in a THREE.Group
// centered on their own combined bounding box, reparenting them with a
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
  const center = boundingBox.getCenter(new THREE.Vector3())

  const pivot = new THREE.Group()
  pivot.position.copy(center)
  object.add(pivot)

  for (const mesh of meshes) {
    pivot.add(mesh)
    mesh.position.copy(center).negate()
  }

  const entry: PivotEntry = { pivot, center, meshes }
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
    }
    runtime.set(nodeId, track)
  }

  if (track.finished) return

  track.elapsed += delta
  const t = Math.min(track.elapsed / track.duration, 1)
  const value = THREE.MathUtils.lerp(track.from, track.to, easeInOut(t))
  if (track.kind === 'rotation') entry.pivot.rotation[track.axis] = value
  else entry.pivot.position[track.axis] = value

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

// Displaces every part along its own (center - assemblyCenter) vector,
// scaled by `factor` (0 = assembled, 1 = each part twice as far from the
// center as it started) - "proportionnellement à leur distance au centre"
// is exactly that vector's own magnitude, so no extra normalization/scale
// constant is needed.
export function applyExplode(
  registry: Map<string, PivotEntry>,
  object: THREE.Object3D,
  tree: ComponentNode,
  partNodeIds: string[],
  assemblyCenter: THREE.Vector3,
  factor: number,
) {
  for (const nodeId of partNodeIds) {
    const entry = getOrCreatePivot(registry, object, tree, nodeId)
    if (!entry) continue
    const direction = entry.center.clone().sub(assemblyCenter)
    entry.pivot.position.copy(entry.center).addScaledVector(direction, factor)
  }
}
