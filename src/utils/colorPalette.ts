import * as THREE from 'three'
import type { Theme } from '../types/model'
import { activeClippingPlanes } from './clippingPlanes'

export const STANDARD_COLOR = 0xb0b0b0

// The "auto" gray for a single-part file, per theme - light mode uses a
// slightly darker gray than dark mode's so the part still reads with
// enough contrast against a light canvas background, and solidworks uses
// the classic SolidWorks part gray (a touch blue-tinted, not neutral gray).
export function standardColorFor(theme: Theme): number {
  if (theme === 'solidworks') return 0xa8b0b8
  return theme === 'light' ? 0xb8b8c0 : STANDARD_COLOR
}

// Golden-angle hue rotation gives visually distinct, well-spread colors
// for an arbitrary number of assembly parts.
export function getPaletteColor(index: number): THREE.Color {
  const hue = (index * 137.508) % 360
  return new THREE.Color(`hsl(${hue}, 55%, 58%)`)
}

// One random "series" of palette colors for `count` shape groups, for the
// "Couleur aléatoire" button. Same recipe as getPaletteColor (golden-angle hue
// steps, so any two slots stay far apart in hue and neighbouring groups never
// look alike) but with a random starting hue, random saturation/lightness for
// the whole series, and a shuffled assignment of groups to slots - each click
// therefore gives a genuinely different look, not just the same palette
// rotated. The three ranges are kept inside a band that reads well on both
// the dark and light canvases.
export function getRandomPaletteColors(count: number): number[] {
  const baseHue = Math.random() * 360
  const saturation = 50 + Math.random() * 30
  const lightness = 46 + Math.random() * 16
  const slots = Array.from({ length: count }, (_, i) => i)
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[slots[i], slots[j]] = [slots[j], slots[i]]
  }
  return slots.map((slot) =>
    new THREE.Color(`hsl(${((baseHue + slot * 137.508) % 360).toFixed(1)}, ${saturation.toFixed(1)}%, ${lightness.toFixed(1)}%)`).getHex(),
  )
}

// Default material for every part on load: uniform metallic gray, matching
// the look of a standard CAD viewer (SolidWorks/eDrawings).
export function createStandardMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: STANDARD_COLOR,
    metalness: 0.3,
    roughness: 0.6,
    envMapIntensity: 0.5,
  })
  material.clippingPlanes = activeClippingPlanes
  // The edges overlay (see displayMode.ts) shares this mesh's own vertex
  // positions exactly, so without this the face and the line are at
  // identical depth and z-fighting decides, per pixel, which one wins -
  // losing consistently on concave surfaces (a bore's inner wall) far
  // enough from the camera that depth precision is thin, hiding real
  // edges there entirely rather than just flickering. Nudging the face
  // back a hair (polygonOffset only affects filled triangles, not the
  // line itself - there's no equivalent for GL_LINES) makes the
  // coincident line the deterministic winner everywhere instead.
  material.polygonOffset = true
  material.polygonOffsetFactor = 1
  material.polygonOffsetUnits = 1
  return material
}
