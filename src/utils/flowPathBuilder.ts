import * as THREE from 'three'
import type { ComponentNode } from '../types/model'
import type { MeshEdgeData } from './edgeAnalysis'
import { findNodeById } from './componentTree'
import { findFlowPassages, type FlowPassage } from './flowPassages'
import { resolveAiTarget, type FlowWaypointPoint, type FlowWaypointSpec } from './aiAssistant'

// The tête d'injection assembly's own standard water path (see project
// notes) - only ever used as a last-resort default when the user asks for
// "the" flow without any specifics AND the loaded model actually has all
// of these named parts (see canUseDefaultInjectionWaypoints); any other
// assembly just falls back to the biggest detected through-passage instead.
export const DEFAULT_INJECTION_WAYPOINTS: FlowWaypointSpec[] = [
  { keyword: 'manchon', point: 'entry' },
  { keyword: 'tube', point: 'center' },
  { keyword: 'arbre', point: 'center' },
  { keyword: 'arbre', point: 'exit' },
]

function findLeafNode(tree: ComponentNode, keyword: string): ComponentNode | null {
  const { ids } = resolveAiTarget(tree, [], { keyword })
  for (const id of ids) {
    const node = findNodeById(tree, id)
    if (node?.mesh) return node
  }
  return null
}

// entry/exit use the part's own largest real through-passage (or its
// single biggest real circle, if it isn't a through-hole) - center uses
// the part's bounding-box center - never a guess, always a real feature
// on that specific mesh.
function resolveNodeWaypointPoint(
  node: ComponentNode,
  point: FlowWaypointPoint,
  edgeData: Map<string, MeshEdgeData>,
  previousWorldPoint: THREE.Vector3 | null,
): THREE.Vector3 {
  const mesh = node.mesh!
  if (point === 'center') {
    return new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())
  }

  const data = edgeData.get(node.id)
  let worldA: THREE.Vector3 | null = null
  let worldB: THREE.Vector3 | null = null

  if (data) {
    const passages = findFlowPassages(new Map([[node.id, data]]))
    if (passages.length > 0) {
      const best = passages[0]
      worldA = mesh.localToWorld(best.entry.clone())
      worldB = mesh.localToWorld(best.exit.clone())
    } else if (data.circles.length > 0) {
      const largest = [...data.circles].sort((a, b) => b.radius - a.radius)[0]
      worldA = mesh.localToWorld(largest.center.clone())
      worldB = worldA
    }
  }

  if (!worldA) {
    // No real edge circle at all on this node - fall back to the top/bottom
    // of its own bounding box, same rough idea as findFlowCircle's own
    // last-resort fallback in snapping.ts.
    const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3())
    const box = new THREE.Box3().setFromObject(mesh)
    worldA = center.clone().setY(box.max.y)
    worldB = center.clone().setY(box.min.y)
  }

  if (!worldB || worldA.equals(worldB)) return worldA
  if (!previousWorldPoint) return point === 'entry' ? worldA : worldB

  // Which of the two rim ends is nearer the previous waypoint decides
  // "entry" (near side) vs "exit" (far side) for THIS part, regardless of
  // the part's own absolute orientation in space.
  const distA = previousWorldPoint.distanceTo(worldA)
  const distB = previousWorldPoint.distanceTo(worldB)
  const near = distA <= distB ? worldA : worldB
  const far = distA <= distB ? worldB : worldA
  return point === 'entry' ? near : far
}

export interface FlowWaypointBuildResult {
  path: THREE.Vector3[]
  unresolved: string[]
}

// Resolves a user-described waypoint sequence ("entre par le manchon,
// traverse le tube, sort par l'arbre") into real 3D world points.
export function buildWaypointFlowPath(
  tree: ComponentNode,
  edgeData: Map<string, MeshEdgeData>,
  waypoints: FlowWaypointSpec[],
): FlowWaypointBuildResult {
  const path: THREE.Vector3[] = []
  const unresolved: string[] = []
  let previous: THREE.Vector3 | null = null
  for (const wp of waypoints) {
    const node = findLeafNode(tree, wp.keyword)
    if (!node) {
      unresolved.push(wp.keyword)
      continue
    }
    const point = resolveNodeWaypointPoint(node, wp.point, edgeData, previous)
    path.push(point)
    previous = point
  }
  return { path, unresolved }
}

export function canUseDefaultInjectionWaypoints(tree: ComponentNode): boolean {
  return DEFAULT_INJECTION_WAYPOINTS.every((wp) => findLeafNode(tree, wp.keyword) !== null)
}

export interface FlowAutoResult {
  path: THREE.Vector3[]
  nodeName: string
  diameter: number
}

// "Auto" mode (no explicit waypoints given): find the most likely genuine
// through-passage in the whole model, optionally restricted to parts whose
// name matches `keyword` ("flux d'eau dans l'arbre") - falls back to an
// unrestricted search if the keyword doesn't match any part with a real
// passage, so a slightly-off part name still finds *something* useful
// rather than reporting a hard failure.
export function findAutoFlowPath(
  tree: ComponentNode,
  edgeData: Map<string, MeshEdgeData>,
  keyword: string | null,
): FlowAutoResult | null {
  const all = findFlowPassages(edgeData)
  if (all.length === 0) return null

  const pick = (candidates: FlowPassage[]): FlowAutoResult | null => {
    if (candidates.length === 0) return null
    // Diameter alone favors a part's own outer envelope (its top/bottom
    // rims form a "passage" by that same axis+radius heuristic, but
    // nothing actually flows through it) - the axial separation between
    // the two rims is a much better signal of a *real* through-hole: it
    // approaches the part's full thickness, while a chamfer/fillet at one
    // edge only spans a tiny fraction of it. Longest separation wins,
    // biggest diameter breaks ties.
    const best = [...candidates].sort((a, b) => b.length - a.length || b.diameter - a.diameter)[0]
    const node = findNodeById(tree, best.nodeId)
    if (!node?.mesh) return null
    return {
      path: [node.mesh.localToWorld(best.entry.clone()), node.mesh.localToWorld(best.exit.clone())],
      nodeName: node.name,
      diameter: best.diameter,
    }
  }

  if (keyword) {
    const restricted = all.filter((p) => findNodeById(tree, p.nodeId)?.name.toLowerCase().includes(keyword))
    const result = pick(restricted)
    if (result) return result
  }
  return pick(all)
}
