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

// Explosion centre: the per-axis MEDIAN of the unit centres. The bounding-box
// centre used before is pulled sideways by whatever sticks out on one side (a
// plate, a saddle): on a shaft assembly every part sitting on the shaft then
// drifted off the axis as it moved. The median lands where most parts are -
// on the shaft - and ignores a few outliers.
function medianCenter(points: THREE.Vector3[], fallback: THREE.Vector3): THREE.Vector3 {
  if (points.length === 0) return fallback.clone()
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b)
    const mid = sorted.length >> 1
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
  }
  return new THREE.Vector3(median(points.map((p) => p.x)), median(points.map((p) => p.y)), median(points.map((p) => p.z)))
}

// A long, thin part (screw, pin, shaft: one dimension LONG_RATIO times the
// other two) leaves along its own axis, the way it is really pulled out -
// the centre-to-part direction sent the screws of a flange off diagonally,
// each one a different way. Kept only when that axis carries a fair share of
// the move (a screw lying across the explosion keeps the radial direction).
const LONG_RATIO = 2.5
const MIN_AXIAL_SHARE = 0.3

function alongOwnAxis(displacement: THREE.Vector3, size: THREE.Vector3 | undefined): THREE.Vector3 {
  if (!size) return displacement
  const dims = [size.x, size.y, size.z]
  const long = dims.indexOf(Math.max(...dims))
  const others = dims.filter((_, i) => i !== long)
  if (dims[long] < LONG_RATIO * Math.max(...others)) return displacement
  const axial = displacement.getComponent(long)
  if (Math.abs(axial) < MIN_AXIAL_SHARE * displacement.length()) return displacement
  // Same travel as before, all of it along the part's axis.
  return new THREE.Vector3().setComponent(long, Math.sign(axial) * displacement.length())
}

// Pure layout: given each part's assembled center, returns the offset each
// part must move by at `factor` (0 = assembled, 1 = fully exploded).
// A "unit" is what moves as one rigid block at the first level: a single part
// in radial/axial modes, a whole top-level block in sub-assembly mode.
// `sizes` (assembled bounding-box size per part) lets long parts move along
// their own axis in radial mode; `assemblyCenter` is only a fallback now.
export function computeExplodeOffsets(
  centers: Map<string, THREE.Vector3>,
  groups: Map<string, string>,
  assemblyCenter: THREE.Vector3,
  factor: number,
  options: ExplodeOptions,
  sizes?: Map<string, THREE.Vector3>,
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
  const origin = medianCenter([...unitCenters.values()], assemblyCenter)
  const displacementOf = (key: string, unitCenter: THREE.Vector3) => {
    const d = unitCenter.clone().sub(origin)
    if (axis === undefined) return options.mode === 'radial' ? alongOwnAxis(d, sizes?.get(key)) : d
    const axial = d.getComponent(axis)
    return d.set(0, 0, 0).setComponent(axis, axial)
  }

  const displacements = new Map<string, THREE.Vector3>()
  for (const [key, unitCenter] of unitCenters) displacements.set(key, displacementOf(key, unitCenter))

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
