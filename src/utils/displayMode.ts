import * as THREE from 'three'
import type { DisplayMode, Theme } from '../types/model'
import { getPrimaryMaterial } from './componentTree'
import { activeClippingPlanes } from './clippingPlanes'
import { THEME_COLORS } from './themeColors'
import { computeBrepEdgesGeometry } from './brepEdges'

// Only a fallback now, for STL/OBJ meshes (no B-Rep face table to derive
// true topological edges from - see brepEdges.ts, which is what a STEP
// part's edges actually come from below). Lowered from the old single
// threshold used everywhere so a plain triangle-soup mesh still shows more
// of its real feature edges, without going as low as a couple of degrees:
// that starts drawing the tessellation's own facet boundaries on any curved
// surface, which reads as noise/wireframe rather than edges on an STL.
const EDGE_ANGLE_THRESHOLD_FALLBACK = 7

function getSharedEdgesGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  let geometry = mesh.userData.edgesGeometry as THREE.BufferGeometry | undefined
  if (!geometry) {
    geometry = computeBrepEdgesGeometry(mesh) ?? new THREE.EdgesGeometry(mesh.geometry, EDGE_ANGLE_THRESHOLD_FALLBACK)
    mesh.userData.edgesGeometry = geometry
  }
  return geometry
}

// The "front" edge overlay: normal (LessEqualDepth) depth test, so it only
// draws where it sits on or in front of whatever else was rendered. Marked
// transparent (at full opacity) purely so it always lands in the render
// queue *after* its own mesh, regardless of insertion order - opaque
// objects always render before transparent ones in three.js.
function getOrCreateEdges(mesh: THREE.Mesh): THREE.LineSegments {
  let edges = mesh.userData.edgesLine as THREE.LineSegments | undefined
  if (!edges) {
    const material = new THREE.LineBasicMaterial({ color: 0x333333, transparent: true })
    material.clippingPlanes = activeClippingPlanes
    edges = new THREE.LineSegments(getSharedEdgesGeometry(mesh), material)
    edges.renderOrder = 1
    mesh.add(edges)
    mesh.userData.edgesLine = edges
  }
  return edges
}

// The "hidden" edge overlay for hidden-lines-visible mode: only draws where
// its depth is *greater* than what's already in the buffer, i.e. exactly
// the portions of the model's edges that sit behind its own surface -
// revealed faintly through the translucent ghost material.
function getOrCreateHiddenEdges(mesh: THREE.Mesh): THREE.LineSegments {
  let edges = mesh.userData.hiddenEdgesLine as THREE.LineSegments | undefined
  if (!edges) {
    const material = new THREE.LineBasicMaterial({
      color: 0x999999,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    })
    material.depthFunc = THREE.GreaterDepth
    material.clippingPlanes = activeClippingPlanes
    edges = new THREE.LineSegments(getSharedEdgesGeometry(mesh), material)
    edges.renderOrder = 2
    mesh.add(edges)
    mesh.userData.hiddenEdgesLine = edges
  }
  return edges
}

// "Filaire" mode: for a STEP part, the real B-Rep feature edges (see
// brepEdges.ts) - the same ones shaded-edges/hidden-lines modes use -
// rather than every triangle edge, which used to draw the tessellation's
// own internal seams across every curved face right along with the real
// edges. STL/OBJ meshes have no B-Rep face table to derive those from, so
// they fall back to the full triangle wireframe, which is still the more
// useful view for a raw triangle-soup mesh with no CAD topology at all.
function getOrCreateWireframe(mesh: THREE.Mesh): THREE.LineSegments {
  let wireframe = mesh.userData.wireframeLine as THREE.LineSegments | undefined
  if (!wireframe) {
    const geometry = computeBrepEdgesGeometry(mesh) ?? new THREE.WireframeGeometry(mesh.geometry)
    const material = new THREE.LineBasicMaterial({ color: 0x333333 })
    material.clippingPlanes = activeClippingPlanes
    wireframe = new THREE.LineSegments(geometry, material)
    mesh.add(wireframe)
    mesh.userData.wireframeLine = wireframe
  }
  return wireframe
}

// Fully invisible stand-in for the mesh's own material in "Filaire" mode:
// object3D.visible stays untouched (that flag is reserved for the user's
// own show/hide toggle), only this material's draw call is suppressed, so
// the wireframe child above keeps rendering normally.
function getOrCreateInvisibleMaterial(mesh: THREE.Mesh): THREE.Material {
  let material = mesh.userData.invisibleMaterial as THREE.Material | undefined
  if (!material) {
    material = new THREE.MeshBasicMaterial({ visible: false })
    mesh.userData.invisibleMaterial = material
  }
  return material
}

// Translucent "ghost" face for hidden-lines-visible mode. depthWrite stays
// on (unlike the app's usual transparency handling) so the depth buffer
// still reflects the real surface, which the hidden-edge pass above relies
// on to tell front edges from back edges.
function getOrCreateGhostMaterial(mesh: THREE.Mesh): THREE.MeshBasicMaterial {
  let material = mesh.userData.ghostMaterial as THREE.MeshBasicMaterial | undefined
  if (!material) {
    material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15,
      depthWrite: true,
      side: THREE.DoubleSide,
    })
    material.clippingPlanes = activeClippingPlanes
    // See createStandardMaterial's polygonOffset comment (colorPalette.ts) -
    // this mode pairs its face with the same coincident edges overlay.
    material.polygonOffset = true
    material.polygonOffsetFactor = 1
    material.polygonOffsetUnits = 1
    mesh.userData.ghostMaterial = material
  }
  return material
}

// Flat, unlit face for hidden-lines-removed mode - opaque, so back edges
// are hidden by the z-buffer with no extra work needed.
function getOrCreateHiddenLineMaterial(mesh: THREE.Mesh): THREE.MeshBasicMaterial {
  let material = mesh.userData.hiddenLineMaterial as THREE.MeshBasicMaterial | undefined
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color: 0xf0f0f0 })
    material.clippingPlanes = activeClippingPlanes
    // See createStandardMaterial's polygonOffset comment (colorPalette.ts) -
    // this mode pairs its face with the same coincident edges overlay.
    material.polygonOffset = true
    material.polygonOffsetFactor = 1
    material.polygonOffsetUnits = 1
    mesh.userData.hiddenLineMaterial = material
  }
  return material
}

function getOrCreatePhysicalMaterial(mesh: THREE.Mesh): THREE.MeshPhysicalMaterial {
  let material = mesh.userData.physicalMaterial as THREE.MeshPhysicalMaterial | undefined
  if (!material) {
    material = new THREE.MeshPhysicalMaterial({
      metalness: 0.4,
      roughness: 0.35,
      clearcoat: 0.3,
      envMapIntensity: 1,
    })
    material.clippingPlanes = activeClippingPlanes
    mesh.userData.physicalMaterial = material
  }
  return material
}

export function applyDisplayMode(mesh: THREE.Mesh, mode: DisplayMode, theme: Theme) {
  const primary = getPrimaryMaterial(mesh)
  const edgeColor = THEME_COLORS[theme].edgeColor

  const existingEdges = mesh.userData.edgesLine as THREE.LineSegments | undefined
  if (existingEdges) existingEdges.visible = false
  const existingWireframe = mesh.userData.wireframeLine as THREE.LineSegments | undefined
  if (existingWireframe) existingWireframe.visible = false
  const existingHiddenEdges = mesh.userData.hiddenEdgesLine as THREE.LineSegments | undefined
  if (existingHiddenEdges) existingHiddenEdges.visible = false

  mesh.castShadow = false
  mesh.receiveShadow = false

  switch (mode) {
    case 'shaded-edges': {
      mesh.material = primary
      const edges = getOrCreateEdges(mesh)
      ;(edges.material as THREE.LineBasicMaterial).color.set(edgeColor)
      edges.visible = true
      break
    }

    case 'shaded': {
      mesh.material = primary
      break
    }

    case 'wireframe': {
      mesh.material = getOrCreateInvisibleMaterial(mesh)
      getOrCreateWireframe(mesh).visible = true
      break
    }

    case 'hidden-lines-visible': {
      mesh.material = getOrCreateGhostMaterial(mesh)
      const edges = getOrCreateEdges(mesh)
      ;(edges.material as THREE.LineBasicMaterial).color.set(0x555555)
      edges.visible = true
      getOrCreateHiddenEdges(mesh).visible = true
      break
    }

    case 'hidden-lines-removed': {
      mesh.material = getOrCreateHiddenLineMaterial(mesh)
      const edges = getOrCreateEdges(mesh)
      ;(edges.material as THREE.LineBasicMaterial).color.set(edgeColor)
      edges.visible = true
      break
    }

    case 'realistic': {
      const physical = getOrCreatePhysicalMaterial(mesh)
      physical.color.copy(primary.color)
      physical.opacity = primary.opacity
      physical.transparent = primary.transparent
      physical.depthWrite = primary.depthWrite
      mesh.material = physical
      mesh.castShadow = true
      mesh.receiveShadow = true
      break
    }
  }
}
