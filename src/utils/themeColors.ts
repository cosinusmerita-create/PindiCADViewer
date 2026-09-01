import * as THREE from 'three'
import type { Theme } from '../types/model'

// The Three.js-side counterparts of index.css's CSS custom properties -
// WebGL materials/scene colors can't read a CSS variable directly, so the
// same per-theme values are kept here too, applied reactively wherever the
// 3D scene needs to follow the active theme (Viewer3D.tsx, MeasurementsGroup
// .tsx, SnapIndicator.tsx, AutoDimensions.tsx).
export interface ThreeThemeColors {
  canvasBg: string
  edgeColor: string
  gridCell: string
  gridSection: string
  ambientIntensity: number
  measurementText: string
  dimensionLinear: string
  dimensionDiameter: string
  keyLightIntensity: number
  keyLightPosition: [number, number, number]
  fillLightIntensity: number
  fillLightPosition: [number, number, number]
}

// Dark/light keep the original single fixed rig (unchanged - only
// solidworks was reported as visually off) for both directional lights.
const DEFAULT_KEY_LIGHT_INTENSITY = 1.1
const DEFAULT_KEY_LIGHT_POSITION: [number, number, number] = [6, 10, 8]
const DEFAULT_FILL_LIGHT_INTENSITY = 0.35
const DEFAULT_FILL_LIGHT_POSITION: [number, number, number] = [-6, -4, -6]

export const THEME_COLORS: Record<Theme, ThreeThemeColors> = {
  dark: {
    canvasBg: '#1a1a2e',
    edgeColor: '#333333',
    gridCell: '#333344',
    gridSection: '#3d3d55',
    ambientIntensity: 0.4,
    measurementText: '#ffffff',
    dimensionLinear: '#66aaff',
    dimensionDiameter: '#00ff88',
    keyLightIntensity: DEFAULT_KEY_LIGHT_INTENSITY,
    keyLightPosition: DEFAULT_KEY_LIGHT_POSITION,
    fillLightIntensity: DEFAULT_FILL_LIGHT_INTENSITY,
    fillLightPosition: DEFAULT_FILL_LIGHT_POSITION,
  },
  light: {
    canvasBg: '#e8ecf0',
    edgeColor: '#555555',
    gridCell: '#ccccdd',
    gridSection: '#bbbbcc',
    ambientIntensity: 0.6,
    measurementText: '#1a1a2e',
    dimensionLinear: '#0066cc',
    dimensionDiameter: '#008855',
    keyLightIntensity: DEFAULT_KEY_LIGHT_INTENSITY,
    keyLightPosition: DEFAULT_KEY_LIGHT_POSITION,
    fillLightIntensity: DEFAULT_FILL_LIGHT_INTENSITY,
    fillLightPosition: DEFAULT_FILL_LIGHT_POSITION,
  },
  // canvasBg here is a representative flat fallback only (kept so every
  // Theme has a complete entry) - the actual solidworks background is the
  // gradient texture below, applied imperatively in Viewer3D.tsx since a
  // vertical gradient isn't expressible as a single THREE.Color.
  solidworks: {
    canvasBg: '#778899',
    edgeColor: '#2a2a2a',
    gridCell: '#778899',
    gridSection: '#5a6b7a',
    ambientIntensity: 0.5,
    measurementText: '#000000',
    dimensionLinear: '#004488',
    dimensionDiameter: '#005522',
    keyLightIntensity: 0.8,
    keyLightPosition: [5, 8, 5],
    fillLightIntensity: 0.3,
    fillLightPosition: [-3, 4, -5],
  },
}

let solidworksBackgroundTexture: THREE.CanvasTexture | null = null

// The signature SolidWorks viewport backdrop: a soft vertical gradient from
// medium blue-gray at the top to a darker blue-gray at the bottom. Built
// once and cached (module-level singleton) since the gradient itself never
// changes - only whether it's the active scene.background does. Left at
// THREE's default UV mapping (not an environment/reflection mapping) so it
// renders as a fixed 2D backdrop that fills the viewport regardless of
// camera orientation, matching the real SolidWorks look - an equirectangular
// mapping would instead wrap it around the view like a reflection
// environment and make it shift as the camera orbits.
export function getSolidworksBackgroundTexture(): THREE.CanvasTexture {
  if (!solidworksBackgroundTexture) {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const gradient = ctx.createLinearGradient(0, 0, 0, 512)
      gradient.addColorStop(0, '#8899aa')
      gradient.addColorStop(1, '#667788')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 2, 512)
    }
    solidworksBackgroundTexture = new THREE.CanvasTexture(canvas)
  }
  return solidworksBackgroundTexture
}
