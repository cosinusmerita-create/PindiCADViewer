import type { DisplayMode, ViewPreset } from '../types/model'

// "Outils > Options", section « À l'ouverture d'un fichier »: how a freshly
// opened file is shown. Remembered on this computer (localStorage); a .pindi
// project still restores its own saved look on top of these.
export interface OpeningPrefs {
  // Grille au sol shown when a file opens.
  grid: boolean
  // "Couleurs par pièce" switched on when the file is an assembly (2+ parts).
  assemblyColors: boolean
  // Display mode a file opens in; 'keep' = whatever mode is currently active.
  displayMode: DisplayMode | 'keep'
  // Orientation of the camera at opening, and of "Réinitialiser la vue".
  startView: ViewPreset
}

export const DEFAULT_OPENING_PREFS: OpeningPrefs = {
  grid: true,
  assemblyColors: true,
  displayMode: 'keep',
  startView: 'iso',
}

const STORAGE_KEY = 'pindicadviewer:opening-prefs'

const DISPLAY_MODES: (DisplayMode | 'keep')[] = [
  'keep',
  'shaded-edges',
  'shaded',
  'wireframe',
  'hidden-lines-visible',
  'hidden-lines-removed',
  'realistic',
]
const VIEWS: ViewPreset[] = ['iso', 'front', 'back', 'left', 'right', 'top', 'bottom']

// Each field is checked on its own: a value from an older or edited save
// that no longer makes sense falls back to its default instead of breaking
// the opening of every file.
export function loadOpeningPrefs(): OpeningPrefs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<OpeningPrefs>
    return {
      grid: typeof raw.grid === 'boolean' ? raw.grid : DEFAULT_OPENING_PREFS.grid,
      assemblyColors: typeof raw.assemblyColors === 'boolean' ? raw.assemblyColors : DEFAULT_OPENING_PREFS.assemblyColors,
      displayMode: DISPLAY_MODES.includes(raw.displayMode as DisplayMode) ? raw.displayMode! : DEFAULT_OPENING_PREFS.displayMode,
      startView: VIEWS.includes(raw.startView as ViewPreset) ? raw.startView! : DEFAULT_OPENING_PREFS.startView,
    }
  } catch {
    // Storage blocked (private window, policy) or unreadable: defaults.
    return { ...DEFAULT_OPENING_PREFS }
  }
}

export function saveOpeningPrefs(prefs: OpeningPrefs) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs))
  } catch {
    // Not remembered, but still applied for this session.
  }
}
