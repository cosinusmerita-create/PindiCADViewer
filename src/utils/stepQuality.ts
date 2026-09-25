import { create } from 'zustand'

// STEP meshing quality. This is THE knob for load time: OpenCascade
// triangulates every B-Rep face to a maximum deviation ("deflection") from
// the true surface, and the triangle count (hence parse time, edge analysis
// and memory) explodes as it shrinks. Measured on a 5 MB / 61-part assembly:
//   standard  ~36 s,  90k triangles
//   fine      ~40 s, 224k triangles
//   precise   the old fixed 0.01 mm setting - well over 10 minutes.
// Measurements taken on the mesh (diameters, distances) are only as exact as
// the tessellation, hence the higher tiers for when that matters.
export type StepQuality = 'standard' | 'fine' | 'precise'

export interface OcctMeshParams {
  linearDeflectionType: 'bounding_box_ratio' | 'absolute_value'
  linearDeflection: number
  angularDeflection: number
}

// `null` = occt-import-js's own default (0.1 % of the bounding-box diagonal),
// which scales with the model instead of using one absolute size for every
// part from a 5 mm screw to a 2 m frame.
export const STEP_QUALITY_PARAMS: Record<StepQuality, OcctMeshParams | null> = {
  standard: null,
  fine: { linearDeflectionType: 'absolute_value', linearDeflection: 0.05, angularDeflection: 0.3 },
  precise: { linearDeflectionType: 'absolute_value', linearDeflection: 0.01, angularDeflection: 0.2 },
}

export const STEP_QUALITY_OPTIONS: { value: StepQuality; label: string; hint: string }[] = [
  { value: 'standard', label: 'Standard (rapide)', hint: 'Recommandé : ouverture la plus rapide.' },
  { value: 'fine', label: 'Fin', hint: 'Cotes plus fidèles, un peu plus lent.' },
  { value: 'precise', label: 'Très précis (lent)', hint: 'Centièmes de mm : peut prendre plusieurs minutes.' },
]

const STORAGE_KEY = 'pindicad.stepQuality'

function readStored(): StepQuality {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'standard' || value === 'fine' || value === 'precise') return value
  } catch {
    // storage blocked/unavailable - fall back to the default
  }
  return 'standard'
}

interface StepQualityState {
  quality: StepQuality
  setQuality: (quality: StepQuality) => void
}

export const useStepQualityStore = create<StepQualityState>((set) => ({
  quality: readStored(),
  setQuality: (quality) => {
    try {
      localStorage.setItem(STORAGE_KEY, quality)
    } catch {
      // not persisted this time - still applies for the session
    }
    set({ quality })
  },
}))
