import * as THREE from 'three'
import type { ColorMode, ComponentNode, Theme } from '../types/model'
import { standardColorFor } from './colorPalette'
import { analyzeMeshEdges, type MeshEdgeData } from './edgeAnalysis'

export function collectNodeIds(node: ComponentNode, ids: string[] = []): string[] {
  ids.push(node.id)
  for (const child of node.children) collectNodeIds(child, ids)
  return ids
}

// Every node that owns a mesh of its own (as opposed to a pure grouping
// folder) - what the exploded view moves individually, each along its own
// vector from the assembly center.
export function collectPartNodeIds(node: ComponentNode, ids: string[] = []): string[] {
  if (node.mesh) ids.push(node.id)
  for (const child of node.children) collectPartNodeIds(child, ids)
  return ids
}

export function findNodeById(node: ComponentNode, id: string): ComponentNode | null {
  if (node.id === id) return node
  for (const child of node.children) {
    const found = findNodeById(child, id)
    if (found) return found
  }
  return null
}

// Detaches `id` from wherever it lives in the tree and returns the new root
// plus the detached node itself (or `removed: null`, same `tree` reference,
// if no such id exists). Only the nodes on the path from the root down to
// the removal point are cloned - every untouched sibling subtree keeps its
// exact original object reference, so callers that compare node identity
// elsewhere (React keys, memoized selections) aren't disturbed for parts of
// the tree the removal never touched. Used by createGroup/ungroupNode below
// to move nodes to a different parent without mutating the tree in place.
export function removeNodeById(
  node: ComponentNode,
  id: string,
): { tree: ComponentNode; removed: ComponentNode | null } {
  const directIndex = node.children.findIndex((c) => c.id === id)
  if (directIndex !== -1) {
    const removed = node.children[directIndex]
    const children = node.children.filter((_, i) => i !== directIndex)
    return { tree: { ...node, children }, removed }
  }

  let removed: ComponentNode | null = null
  const children = node.children.map((child) => {
    if (removed) return child
    const result = removeNodeById(child, id)
    removed = result.removed
    return result.tree
  })

  return removed ? { tree: { ...node, children }, removed } : { tree: node, removed: null }
}

// Stamps each mesh with its owning node id, so a raycasted mesh in the 3D
// view can be mapped back to a ComponentNode (e.g. for the context menu).
export function tagMeshesWithNodeIds(node: ComponentNode) {
  if (node.mesh) node.mesh.userData.nodeId = node.id
  for (const child of node.children) tagMeshesWithNodeIds(child)
}

// Applies a visibility value to a node and all of its descendants' meshes,
// returning every affected node id so the UI store can stay in sync.
export function applyVisibility(node: ComponentNode, visible: boolean, affected: string[] = []): string[] {
  affected.push(node.id)
  if (node.mesh) node.mesh.visible = visible
  for (const child of node.children) applyVisibility(child, visible, affected)
  return affected
}

// The mesh's real, persistent material - the single source of truth for a
// piece's color/opacity. Display modes (see displayMode.ts) swap
// `mesh.material` to other, mode-specific materials for rendering, so
// anything that reads or writes a piece's "true" color must go through
// this instead of `mesh.material` directly.
export function getPrimaryMaterial(mesh: THREE.Mesh): THREE.MeshStandardMaterial {
  return (mesh.userData.primaryMaterial ?? mesh.material) as THREE.MeshStandardMaterial
}

// The realistic-mode physical material mirrors the primary material's
// color/opacity so a live edit (color picker, pipette, opacity slider)
// shows up immediately even while that mode is active; every other
// alternate display-mode material has a spec-fixed look by design and is
// intentionally left alone here.
function syncPhysicalMirror(mesh: THREE.Mesh, primary: THREE.MeshStandardMaterial) {
  const active = mesh.material
  if (!(active instanceof THREE.MeshPhysicalMaterial)) return
  active.color.copy(primary.color)
  active.opacity = primary.opacity
  active.transparent = primary.transparent
  active.depthWrite = primary.depthWrite
}

// Applies an opacity value to a node and all of its descendants' meshes,
// returning every affected node id so the UI store can stay in sync.
export function applyOpacity(node: ComponentNode, opacity: number, affected: string[] = []): string[] {
  affected.push(node.id)
  if (node.mesh) {
    const material = getPrimaryMaterial(node.mesh)
    const isTransparent = opacity < 1
    material.opacity = opacity
    material.transparent = isTransparent
    material.depthWrite = !isTransparent
    material.side = isTransparent ? THREE.DoubleSide : THREE.FrontSide
    material.needsUpdate = true
    syncPhysicalMirror(node.mesh, material)
  }
  for (const child of node.children) applyOpacity(child, opacity, affected)
  return affected
}

// A mesh's "auto" color depends on the active color mode: uniform gray in
// standard mode, or its stashed palette hue in palette mode (parts from a
// single-part file never get a palette hue, so they stay gray either way).
// The gray itself is theme-dependent (see colorPalette.ts).
function resolveAutoColor(mesh: THREE.Mesh, colorMode: ColorMode, theme: Theme): number {
  const paletteColor = mesh.userData.paletteColor as number | undefined
  return colorMode === 'palette' && paletteColor !== undefined ? paletteColor : standardColorFor(theme)
}

// Sets or clears (color === null reverts to the mode-appropriate auto color)
// a custom color on a node and all of its descendants' meshes, returning
// every affected node id.
export function applyColor(
  node: ComponentNode,
  color: string | null,
  colorMode: ColorMode,
  theme: Theme,
  affected: string[] = [],
): string[] {
  affected.push(node.id)
  if (node.mesh) {
    const material = getPrimaryMaterial(node.mesh)
    material.color.set(color ?? resolveAutoColor(node.mesh, colorMode, theme))
    syncPhysicalMirror(node.mesh, material)
  }
  for (const child of node.children) applyColor(child, color, colorMode, theme, affected)
  return affected
}

// Re-applies the active color mode's look (color + finish) to every node
// that doesn't have a custom color - custom colors always take priority and
// are left untouched, but their metalness/roughness still follow the mode
// so the whole assembly keeps a consistent finish. Also re-run whenever the
// theme changes, since the "auto" gray itself depends on it.
export function applyColorModeToTree(
  node: ComponentNode,
  colorMode: ColorMode,
  customColors: Record<string, string>,
  theme: Theme,
) {
  if (node.mesh) {
    const material = getPrimaryMaterial(node.mesh)
    if (colorMode === 'palette') {
      material.metalness = 0.6
      material.roughness = 0.4
      material.envMapIntensity = 1
    } else if (theme === 'solidworks') {
      // Soft, matte finish - the SolidWorks look deliberately avoids the
      // more metallic/reflective default finish used for dark/light.
      material.metalness = 0.12
      material.roughness = 0.7
      material.envMapIntensity = 0.2
    } else {
      material.metalness = 0.3
      material.roughness = 0.6
      material.envMapIntensity = 0.5
    }
    if (!customColors[node.id]) {
      material.color.set(resolveAutoColor(node.mesh, colorMode, theme))
    }
    syncPhysicalMirror(node.mesh, material)
  }
  for (const child of node.children) applyColorModeToTree(child, colorMode, customColors, theme)
}

// Precomputes edge/circle data for every mesh in the tree, keyed by node id,
// for the measure tool's edge snapping - done once at load time so hovering
// in measure mode never has to wait on it.
export function buildEdgeDataMap(node: ComponentNode, map: Map<string, MeshEdgeData> = new Map()) {
  if (node.mesh) map.set(node.id, analyzeMeshEdges(node.mesh))
  for (const child of node.children) buildEdgeDataMap(child, map)
  return map
}

export function collectMeshes(node: ComponentNode, meshes: THREE.Mesh[] = []): THREE.Mesh[] {
  if (node.mesh) meshes.push(node.mesh)
  for (const child of node.children) collectMeshes(child, meshes)
  return meshes
}

export interface NodeStats {
  triangleCount: number
  boundingBox: THREE.Box3
}

// World-space bounding box and triangle count for a node's whole subtree,
// used by the selection info panel (a folder node covers all its parts).
export function getNodeStats(node: ComponentNode): NodeStats {
  const meshes = collectMeshes(node)
  const boundingBox = new THREE.Box3()
  let triangleCount = 0

  for (const mesh of meshes) {
    boundingBox.expandByObject(mesh)
    const index = mesh.geometry.getIndex()
    triangleCount += index ? index.count / 3 : mesh.geometry.attributes.position.count / 3
  }

  return { triangleCount, boundingBox }
}
