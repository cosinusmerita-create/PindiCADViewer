import * as THREE from 'three'
import type { ComponentNode } from '../types/model'
import { collectPartNodeIds } from './componentTree'

export type ExplodeMode = 'radial' | 'axial-x' | 'axial-y' | 'axial-z' | 'subassembly'

export const EXPLODE_MODES: { value: ExplodeMode; label: string }[] = [
  { value: 'radial', label: 'Radial' },
  { value: 'axial-x', label: 'Axial X' },
  { value: 'axial-y', label: 'Axial Y' },
  { value: 'axial-z', label: 'Axial Z' },
  { value: 'subassembly', label: 'Sous-ensembles' },
]

export interface ExplodeOptions {
  mode: ExplodeMode
  // Parts (or sub-assemblies) leave one after the other, outermost first,
  // instead of all at once - the slider then acts as a disassembly timeline.
  sequential: boolean
  // Sub-assembly mode only: 0..1 amount of the SECOND explosion level, i.e.
  // how far the parts inside each block spread apart around their block.
  detail: number
}

const AXIS_INDEX: Record<string, number> = { 'axial-x': 0, 'axial-y': 1, 'axial-z': 2 }

// Maps every part node id to the id of the top-level block it belongs to.
// "Top-level" skips the single-child wrapper folders STEP files commonly put
// at the root, so the blocks are the first real functional split of the
// assembly. A part sitting directly at that level is its own block.
export function buildPartGroups(tree: ComponentNode): Map<string, string> {
  let root = tree
  while (!root.mesh && root.children.length === 1) root = root.children[0]

  const groups = new Map<string, string>()
  if (root.mesh) {
    for (const id of collectPartNodeIds(root)) groups.set(id, id)
    return groups
  }
  for (const child of root.children) {
    for (const id of collectPartNodeIds(child)) groups.set(id, child.id)
  }
  return groups
}

// Pure layout: given each part's assembled center, returns the offset each
// part must move by at `factor` (0 = assembled, 1 = fully exploded).
// A "unit" is what moves as one rigid block at the first level: a single part
// in radial/axial modes, a whole top-level block in sub-assembly mode.
export function computeExplodeOffsets(
  centers: Map<string, THREE.Vector3>,
  groups: Map<string, string>,
  assemblyCenter: THREE.Vector3,
  factor: number,
  options: ExplodeOptions,
): Map<string, THREE.Vector3> {
  const subassembly = options.mode === 'subassembly'
  const unitOf = (partId: string) => (subassembly ? (groups.get(partId) ?? partId) : partId)

  const unitCenters = new Map<string, THREE.Vector3>()
  if (subassembly) {
    const boxes = new Map<string, THREE.Box3>()
    for (const [partId, center] of centers) {
      const key = unitOf(partId)
      let box = boxes.get(key)
      if (!box) boxes.set(key, (box = new THREE.Box3()))
      box.expandByPoint(center)
    }
    for (const [key, box] of boxes) unitCenters.set(key, box.getCenter(new THREE.Vector3()))
  } else {
    for (const [partId, center] of centers) unitCenters.set(partId, center)
  }

  const axis = AXIS_INDEX[options.mode]
  const displacementOf = (unitCenter: THREE.Vector3) => {
    const d = unitCenter.clone().sub(assemblyCenter)
    if (axis === undefined) return d
    const axial = d.getComponent(axis)
    return d.set(0, 0, 0).setComponent(axis, axial)
  }

  const displacements = new Map<string, THREE.Vector3>()
  for (const [key, unitCenter] of unitCenters) displacements.set(key, displacementOf(unitCenter))

  const localFactor = new Map<string, number>()
  if (options.sequential) {
    const order = [...displacements.entries()].sort((a, b) => b[1].lengthSq() - a[1].lengthSq())
    order.forEach(([key], rank) => {
      localFactor.set(key, THREE.MathUtils.clamp(factor * order.length - rank, 0, 1))
    })
  } else {
    for (const key of unitCenters.keys()) localFactor.set(key, factor)
  }

  const offsets = new Map<string, THREE.Vector3>()
  for (const [partId, center] of centers) {
    const key = unitOf(partId)
    const f = localFactor.get(key) ?? factor
    const offset = displacements.get(key)!.clone().multiplyScalar(f)
    if (subassembly) offset.addScaledVector(center.clone().sub(unitCenters.get(key)!), f * options.detail)
    offsets.set(partId, offset)
  }
  return offsets
}
