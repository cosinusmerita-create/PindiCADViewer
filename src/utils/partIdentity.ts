import * as THREE from 'three'
import { getPaletteColor } from './colorPalette'
import { analyzeShape, buildPartNames, groupSimilarShapes } from './shapeAnalysis'

// Names and "par pièce" colors for the freshly loaded meshes of an assembly.
//
// Parts that are the same shape (identical screws, the three blades of a
// rotor...) get the SAME palette color: coloring each copy differently makes
// an assembly look busier than it is and hides which parts are duplicates.
// Parts that came without a name are named after their shape family ("Pale 1",
// "Pale 2", "Tige Ø20 × 1500"...) instead of a bare "Pièce 12"; names the file
// did provide are always kept.
export function identifyParts(meshes: THREE.Mesh[]) {
  if (meshes.length === 0) return

  if (meshes.length === 1) {
    if (!meshes[0].name) meshes[0].name = 'Pièce 1'
    return
  }

  const signatures = meshes.map((mesh) => analyzeShape(mesh.geometry))
  const groups = groupSimilarShapes(signatures)
  const names = buildPartNames(
    signatures,
    groups,
    meshes.map((mesh) => mesh.name),
  )
  meshes.forEach((mesh, i) => {
    mesh.name = names[i]
    mesh.userData.paletteColor = getPaletteColor(groups[i]).getHex()
    mesh.userData.shapeGroup = groups[i]
  })
}
