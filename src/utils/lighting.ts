import * as THREE from 'three'
import type { Theme } from '../types/model'
import { THEME_COLORS } from './themeColors'

// Settings of the "Lumières et caméra" panel's Lumières tab. null in the
// store = the theme's own rig (themeColors.ts), unchanged from before the
// panel existed; the first touch copies that rig into these settings.
//
// The key (main) light is placed by azimuth/elevation around the part, in
// degrees: azimuth 0 = from the front (+Z), 90 = from the right (+X);
// elevation 90 = straight above. With followCamera ("lampe frontale") the same
// two angles are read relative to the VIEW instead (0/0 = from the viewer's
// eye), and the light turns with the camera - the part stays lit whatever
// side you look at it from. The fill light always comes from roughly the
// opposite side, softer, so shadows never go fully black.
export type LightingPreset = 'theme' | 'studio' | 'soft' | 'contrast' | 'warm' | 'headlamp' | 'custom'

export interface LightingSettings {
  preset: LightingPreset
  ambient: number
  keyIntensity: number
  keyAzimuth: number
  keyElevation: number
  keyColor: string
  fillIntensity: number
  followCamera: boolean
}

export const LIGHTING_PRESETS: { id: Exclude<LightingPreset, 'custom'>; label: string; title: string }[] = [
  { id: 'theme', label: 'Par défaut', title: "L'éclairage d'origine du thème" },
  { id: 'studio', label: 'Studio', title: 'Lumière franche et équilibrée, pour présenter une pièce' },
  { id: 'soft', label: 'Doux', title: 'Peu d’ombres, tout est lisible' },
  { id: 'contrast', label: 'Contrasté', title: 'Lumière rasante : fait ressortir les reliefs et les chanfreins' },
  { id: 'warm', label: 'Atelier', title: 'Lumière chaude, comme sous une lampe d’atelier' },
  { id: 'headlamp', label: 'Frontale', title: 'La lumière suit la caméra : la face regardée est toujours éclairée' },
]

function anglesOf(position: [number, number, number]): { azimuth: number; elevation: number } {
  const v = new THREE.Vector3(...position).normalize()
  return {
    azimuth: Math.round(THREE.MathUtils.radToDeg(Math.atan2(v.x, v.z))),
    elevation: Math.round(THREE.MathUtils.radToDeg(Math.asin(v.y))),
  }
}

// Default placement of the realistic mode (see Viewer3D): the themes' key
// light comes from the iso camera's side, which flattens a realistic render.
export const REALISTIC_KEY = { azimuth: -40, elevation: 50 }
export const REALISTIC_FILL = { azimuth: 110, elevation: 10 }

export function themeLighting(theme: Theme, realistic = false): LightingSettings {
  const colors = THEME_COLORS[theme]
  const { azimuth, elevation } = realistic ? REALISTIC_KEY : anglesOf(colors.keyLightPosition)
  return {
    preset: 'theme',
    ambient: colors.ambientIntensity,
    keyIntensity: colors.keyLightIntensity,
    keyAzimuth: azimuth,
    keyElevation: elevation,
    keyColor: '#ffffff',
    fillIntensity: colors.fillLightIntensity,
    followCamera: false,
  }
}

export function presetLighting(preset: Exclude<LightingPreset, 'custom'>, theme: Theme): LightingSettings {
  const base = { keyColor: '#ffffff', followCamera: false }
  switch (preset) {
    case 'theme':
      return themeLighting(theme)
    case 'studio':
      return { ...base, preset, ambient: 0.45, keyIntensity: 1.35, keyAzimuth: 35, keyElevation: 45, fillIntensity: 0.5 }
    case 'soft':
      return { ...base, preset, ambient: 0.85, keyIntensity: 0.7, keyAzimuth: 25, keyElevation: 60, fillIntensity: 0.55 }
    case 'contrast':
      return { ...base, preset, ambient: 0.12, keyIntensity: 1.9, keyAzimuth: 70, keyElevation: 20, fillIntensity: 0.1 }
    case 'warm':
      return { ...base, preset, ambient: 0.4, keyIntensity: 1.25, keyAzimuth: -40, keyElevation: 40, keyColor: '#ffd8a8', fillIntensity: 0.3 }
    case 'headlamp':
      return { ...base, preset, ambient: 0.35, keyIntensity: 1.15, keyAzimuth: -20, keyElevation: 20, fillIntensity: 0.25, followCamera: true }
  }
}

// Unit vector pointing FROM the part TOWARD the light, for the given angles.
export function directionFromAngles(azimuth: number, elevation: number, out = new THREE.Vector3()): THREE.Vector3 {
  const az = THREE.MathUtils.degToRad(azimuth)
  const el = THREE.MathUtils.degToRad(elevation)
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el))
}

// Fill light direction: opposite side, from a little below - the same idea
// as the themes' fixed [-6, -4, -6] fill.
export function fillAngles(settings: LightingSettings): { azimuth: number; elevation: number } {
  return { azimuth: settings.keyAzimuth + 180, elevation: -Math.min(30, Math.abs(settings.keyElevation) * 0.5 + 10) }
}
