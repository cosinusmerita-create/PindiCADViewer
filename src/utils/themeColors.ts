import * as THREE from 'three'
import type { Theme } from '../types/model'

// The Three.js-side counterparts of index.css's CSS custom properties -
// WebGL materials/scene colors can't read a CSS variable directly, so the
// same per-theme values are kept here too, applied reactively wherever the
// 3D scene needs to follow the active theme (Viewer3D.tsx, MeasurementsGroup
// .tsx, SnapIndicator.tsx, AutoDimensions.tsx).
export interface ThreeThemeColors {
  canvasBg: string
  // 3D viewport backdrop, top to bottom: a soft vertical gradient gives the
  // view some depth (the flat colour above stays the reference value).
  canvasGradient: [string, string]
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

const DEFAULT_KEY_LIGHT_INTENSITY = 1.1
const DEFAULT_KEY_LIGHT_POSITION: [number, number, number] = [6, 10, 8]
const DEFAULT_FILL_LIGHT_INTENSITY = 0.35
const DEFAULT_FILL_LIGHT_POSITION: [number, number, number] = [-6, -4, -6]

// Same three theme ids as ever (see index.css for the interface side):
// dark = 01 Deep Obsidian & Cyan Precision, light = 02 Studio Clean / Neutral
// Slate, solidworks ("Mode classique") = 03 Titanium Industrial & Safety Orange.
export const THEME_COLORS: Record<Theme, ThreeThemeColors> = {
  dark: {
    // Obsidian backdrop with a faint cyan-tinted grid: the model stands out.
    canvasBg: '#0a0e13',
    canvasGradient: ['#111a24', '#06090d'],
    edgeColor: '#1c232c',
    gridCell: '#172230',
    gridSection: '#243a4a',
    ambientIntensity: 0.4,
    measurementText: '#ffffff',
    dimensionLinear: '#38bdf8',
    dimensionDiameter: '#34d399',
    keyLightIntensity: DEFAULT_KEY_LIGHT_INTENSITY,
    keyLightPosition: DEFAULT_KEY_LIGHT_POSITION,
    fillLightIntensity: DEFAULT_FILL_LIGHT_INTENSITY,
    fillLightPosition: DEFAULT_FILL_LIGHT_POSITION,
  },
  light: {
    // Neutral studio: near-white to cool light gray, no colour cast on parts.
    canvasBg: '#f1f4f8',
    canvasGradient: ['#fbfcfe', '#e1e7ef'],
    edgeColor: '#475569',
    gridCell: '#d9e0e8',
    gridSection: '#bcc7d4',
    ambientIntensity: 0.6,
    measurementText: '#0f172a',
    dimensionLinear: '#1d4ed8',
    dimensionDiameter: '#047857',
    keyLightIntensity: DEFAULT_KEY_LIGHT_INTENSITY,
    keyLightPosition: DEFAULT_KEY_LIGHT_POSITION,
    fillLightIntensity: DEFAULT_FILL_LIGHT_INTENSITY,
    fillLightPosition: DEFAULT_FILL_LIGHT_POSITION,
  },
  solidworks: {
    // Brushed titanium: dark graphite gradient, neutral grid, strong edges.
    canvasBg: '#17191d',
    canvasGradient: ['#262a30', '#0f1114'],
    edgeColor: '#0e1013',
    gridCell: '#262b31',
    gridSection: '#3e454e',
    ambientIntensity: 0.45,
    measurementText: '#ffffff',
    dimensionLinear: '#60a5fa',
    dimensionDiameter: '#10b981',
    keyLightIntensity: DEFAULT_KEY_LIGHT_INTENSITY,
    keyLightPosition: DEFAULT_KEY_LIGHT_POSITION,
    fillLightIntensity: DEFAULT_FILL_LIGHT_INTENSITY,
    fillLightPosition: DEFAULT_FILL_LIGHT_POSITION,
  },
}

const backgroundTextures = new Map<Theme, THREE.CanvasTexture>()

// The viewport backdrop of a theme: its vertical gradient, built once per
// theme and cached. Left at THREE's default UV mapping (not an environment/
// reflection mapping) so it renders as a fixed 2D backdrop that fills the
// viewport whatever the camera orientation - an equirectangular mapping
// would wrap it around the view and make it shift as the camera orbits.
export function getThemeBackgroundTexture(theme: Theme): THREE.CanvasTexture {
  let texture = backgroundTextures.get(theme)
  if (!texture) {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 512
    const ctx = canvas.getContext('2d')
    if (ctx) {
      const [top, bottom] = THEME_COLORS[theme].canvasGradient
      const gradient = ctx.createLinearGradient(0, 0, 0, 512)
      gradient.addColorStop(0, top)
      gradient.addColorStop(1, bottom)
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 2, 512)
    }
    texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    backgroundTextures.set(theme, texture)
  }
  return texture
}
