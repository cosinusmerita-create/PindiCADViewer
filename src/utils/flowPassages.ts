import * as THREE from 'three'
import type { MeshEdgeData } from './edgeAnalysis'

export interface FlowPassage {
  nodeId: string
  // Local (mesh) space - the caller converts to world via that node's own
  // mesh.matrixWorld once a candidate is actually used, since this runs
  // once per full edge-data map and isn't tied to any single mesh's
  // transform.
  entry: THREE.Vector3
  exit: THREE.Vector3
  axis: THREE.Vector3
  diameter: number
  length: number
}

const RADIUS_TOLERANCE = 0.05
const AXIS_PARALLEL_MIN_DOT = 0.95
const LATERAL_ALIGN_FACTOR = 0.1

function distanceToAxisLine(point: THREE.Vector3, lineOrigin: THREE.Vector3, axis: THREE.Vector3): number {
  const rel = new THREE.Vector3().subVectors(point, lineOrigin)
  const along = rel.dot(axis)
  return rel.addScaledVector(axis, -along).length()
}

// Finds pairs of real B-Rep edge-loop circles (see edgeAnalysis.ts) that
// share an axis and a radius and sit on opposite sides of a part - a
// straight-through hole/passage a fluid could flow through end to end (a
// manchon's bore, a shaft's oil channel). Only genuine STEP edges are
// used, never patch-derived circles (a cylindrical patch's own center is
// just an axial-midpoint approximation, not a real rim - see
// surfacePatches.ts), so every candidate reported here is an exact,
// real opening. Sorted by diameter (largest/most-likely-intentional
// passage first).
export function findFlowPassages(edgeDataByNode: Map<string, MeshEdgeData>): FlowPassage[] {
  const passages: FlowPassage[] = []
  for (const [nodeId, data] of edgeDataByNode) {
    const circles = data.circles
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i]
        const b = circles[j]
        if (Math.abs(a.radius - b.radius) > a.radius * RADIUS_TOLERANCE) continue
        if (Math.abs(a.normal.dot(b.normal)) < AXIS_PARALLEL_MIN_DOT) continue
        if (distanceToAxisLine(b.center, a.center, a.normal) > a.radius * LATERAL_ALIGN_FACTOR) continue
        const axialDist = Math.abs(new THREE.Vector3().subVectors(b.center, a.center).dot(a.normal))
        if (axialDist < a.radius * 0.2) continue // same rim picked up twice, not a real end-to-end passage

        passages.push({
          nodeId,
          entry: a.center.clone(),
          exit: b.center.clone(),
          axis: a.normal.clone(),
          diameter: a.radius + b.radius,
          length: axialDist,
        })
      }
    }
  }
  passages.sort((p1, p2) => p2.diameter - p1.diameter)
  return passages
}
