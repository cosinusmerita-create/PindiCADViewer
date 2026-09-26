import * as THREE from 'three'
import { getPaletteColor, getRandomPaletteColors } from './colorPalette'
import { brepFaceRegions } from './surfacePatches'

// "Couleurs par face": with a single part open, "Couleurs par pièce" has
// nothing to tell apart, so it colors the part's CAD faces instead (each
// B-Rep face of a STEP/IGES/BREP file, bores counted once) to make its shape
// readable. Done with per-vertex colors on the one mesh - occt tessellates
// every face on its own vertices, so no vertex is shared by two faces - with
// the material color left white so the vertex colors show as they are.
//
// The regions are cached on the mesh (userData.faceRegions); the series on
// screen is userData.faceColors (0xRRGGBB per region), redrawn by "Couleur
// aléatoire" and saved in the .pindi like the per-part series.

// null: not a B-Rep, a single face, or (never seen, but checked) a vertex
// shared by two faces - the caller then keeps the plain per-part behavior.
export function faceRegionsFor(mesh: THREE.Mesh): number[][] | null {
  const cached = mesh.userData.faceRegions as number[][] | null | undefined
  if (cached !== undefined) return cached
  let regions = brepFaceRegions(mesh)
  if (regions && regions.length < 2) regions = null
  const index = mesh.geometry.getIndex()
  if (regions && index) {
    const owner = new Int32Array(mesh.geometry.attributes.position.count).fill(-1)
    outer: for (let r = 0; r < regions.length; r++) {
      for (const t of regions[r]) {
        for (let k = 0; k < 3; k++) {
          const v = index.getX(t * 3 + k)
          if (owner[v] !== -1 && owner[v] !== r) {
            regions = null
            break outer
          }
          owner[v] = r
        }
      }
    }
  }
  mesh.userData.faceRegions = regions
  return regions
}

function paint(mesh: THREE.Mesh, regions: number[][], colors: number[]) {
  const geometry = mesh.geometry
  const index = geometry.getIndex()!
  const count = geometry.attributes.position.count
  let attribute = geometry.getAttribute('color') as THREE.BufferAttribute | undefined
  if (!attribute || attribute.count !== count) {
    attribute = new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3)
    geometry.setAttribute('color', attribute)
  }
  // THREE.Color converts the sRGB hex into the linear working space the
  // shader expects for vertex colors.
  const color = new THREE.Color()
  regions.forEach((region, r) => {
    color.setHex(colors[r])
    for (const t of region) {
      for (let k = 0; k < 3; k++) attribute.setXYZ(index.getX(t * 3 + k), color.r, color.g, color.b)
    }
  })
  attribute.needsUpdate = true
}

// Turns the per-face look on (returns false if this mesh can't have it) or off.
export function applyFaceColors(mesh: THREE.Mesh, material: THREE.MeshStandardMaterial, on: boolean): boolean {
  const regions = on ? faceRegionsFor(mesh) : null
  if (!regions) {
    if (material.vertexColors) {
      material.vertexColors = false
      material.needsUpdate = true
    }
    return false
  }
  let colors = mesh.userData.faceColors as number[] | undefined
  if (!colors || colors.length !== regions.length) {
    colors = regions.map((_, i) => getPaletteColor(i).getHex())
    mesh.userData.faceColors = colors
  }
  paint(mesh, regions, colors)
  material.color.set(0xffffff)
  // For the component tree's swatch, which only sees the material.
  material.userData.faceColors = colors
  if (!material.vertexColors) {
    material.vertexColors = true
    material.needsUpdate = true
  }
  return true
}

// "Couleur aléatoire" on a single part: a new random series for its faces.
// Returns the series, or null when the part has no CAD faces to color.
export function randomizeFaceColors(mesh: THREE.Mesh): number[] | null {
  const regions = faceRegionsFor(mesh)
  if (!regions) return null
  const colors = getRandomPaletteColors(regions.length)
  mesh.userData.faceColors = colors
  return colors
}

// CSS background for a color swatch: the material color, or a small wheel of
// the first face colors while the part is colored per face.
export function swatchBackground(material: THREE.MeshStandardMaterial): string {
  const colors = material.userData.faceColors as number[] | undefined
  if (!material.vertexColors || !colors || colors.length === 0) return `#${material.color.getHexString()}`
  const shown = colors.slice(0, 6).map((c) => `#${c.toString(16).padStart(6, '0')}`)
  return `conic-gradient(${shown.join(', ')}, ${shown[0]})`
}
