import { create } from 'zustand'

export type PrintAxis = 'x' | 'y' | 'z'
// Aperçu éclaté des tronçons réellement découpés (repère du viewer).
// Fiche d'un tronçon (dimensions et volume à l'échelle d'impression, en mm).
export interface PrintPieceStat {
  name: string
  w: number
  d: number
  h: number
  volume: number
  triangles: number
}

export interface PrintPreviewData {
  stats: PrintPieceStat[]
  pieces: Float32Array[]
  pins: Float32Array | null
  // Bilan de l'emboîtement (null = option désactivée).
  joint: { pinCount: number; shape: { w: number; l: number } | null; misses: number } | null
}

export type PrintSplitMode = 'count' | 'height'

// Plans de coupe à afficher dans la vue 3D (repère du viewer, Y vers le haut).
export interface PrintPlanesPreview {
  axis: PrintAxis
  positions: number[]
  center: [number, number, number]
  // Étendue des deux autres axes (dans l'ordre x,y,z sans l'axe de coupe).
  size: [number, number]
}

interface PrintState {
  open: boolean
  // null = automatique (dimension la plus longue du modèle).
  axis: PrintAxis | null
  scalePct: number
  splitMode: PrintSplitMode
  segCount: number
  maxSegHeight: number
  bedX: number
  bedY: number
  bedZ: number
  // Emboîtement par broches carrées (pièces sélectionnées uniquement).
  jointEnabled: boolean
  jointPins: number
  jointSize: number
  jointClearance: number
  jointDepth: number
  planes: PrintPlanesPreview | null
  previewOn: boolean
  // Écart entre tronçons dans l'aperçu, en % de la hauteur d'un tronçon.
  previewGap: number
  preview: PrintPreviewData | null
  // Tronçon cliqué dans l'aperçu (index), pour sa fiche d'information.
  previewSelected: number | null
  setOpen: (open: boolean) => void
  set: (patch: Partial<Omit<PrintState, 'set' | 'setOpen'>>) => void
}

// Réglages du module « Impression 3D » (réduction d'échelle + découpe en
// tronçons). Store à part pour ne pas alourdir useModelState : seuls le panneau
// et la superposition des plans dans Viewer3D le lisent.
export const usePrintStore = create<PrintState>((set) => ({
  open: false,
  axis: null,
  scalePct: 100,
  splitMode: 'count',
  segCount: 1,
  maxSegHeight: 200,
  bedX: 256,
  bedY: 256,
  bedZ: 256,
  jointEnabled: false,
  jointPins: 2,
  jointSize: 4,
  jointClearance: 0.25,
  jointDepth: 12,
  planes: null,
  previewOn: false,
  previewGap: 30,
  preview: null,
  previewSelected: null,
  setOpen: (open) => set(open ? { open } : { open, planes: null, previewOn: false, preview: null, previewSelected: null }),
  set: (patch) => set(patch),
}))

// --- Persistance dans le projet .pindi ---------------------------------------
// Réglages sauvegardés : tout ce que l'utilisateur a choisi (panneau ouvert,
// échelle, découpe, plateau, emboîtement, aperçu éclaté et tronçon cliqué).
// Les données calculées (planes, preview) sont recalculées à l'ouverture.
const PERSISTED_KEYS = [
  'open',
  'axis',
  'scalePct',
  'splitMode',
  'segCount',
  'maxSegHeight',
  'bedX',
  'bedY',
  'bedZ',
  'jointEnabled',
  'jointPins',
  'jointSize',
  'jointClearance',
  'jointDepth',
  'previewOn',
  'previewGap',
  'previewSelected',
] as const

const DEFAULTS = { ...usePrintStore.getState() }

export function snapshotPrintState(): Record<string, unknown> {
  const s = usePrintStore.getState() as unknown as Record<string, unknown>
  return Object.fromEntries(PERSISTED_KEYS.map((k) => [k, s[k]]))
}

// Remet le module à zéro (nouveau modèle ouvert, projet fermé).
export function resetPrintState() {
  const d = DEFAULTS as unknown as Record<string, unknown>
  usePrintStore.setState(Object.fromEntries(PERSISTED_KEYS.map((k) => [k, d[k]])), false)
  usePrintStore.setState({ planes: null, preview: null })
}

// Rétablit les réglages d'un projet ; toute valeur de mauvais type est ignorée
// (un .pindi ancien ou modifié à la main ne doit pas casser le panneau).
export function restorePrintState(raw: unknown) {
  resetPrintState()
  if (!raw || typeof raw !== 'object') return
  const src = raw as Record<string, unknown>
  const d = DEFAULTS as unknown as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const k of PERSISTED_KEYS) {
    const v = src[k]
    if (v === undefined) continue
    const def = d[k]
    if (k === 'axis') {
      if (v === null || v === 'x' || v === 'y' || v === 'z') patch[k] = v
    } else if (k === 'splitMode') {
      if (v === 'count' || v === 'height') patch[k] = v
    } else if (k === 'previewSelected') {
      if (v === null || (typeof v === 'number' && Number.isInteger(v) && v >= 0)) patch[k] = v
    } else if (typeof v === typeof def && (typeof v !== 'number' || Number.isFinite(v))) {
      patch[k] = v
    }
  }
  usePrintStore.setState(patch)
}
