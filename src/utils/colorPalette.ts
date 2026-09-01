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
