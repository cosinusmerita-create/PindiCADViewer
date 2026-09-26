import { useEffect, type ReactNode } from 'react'
import { FolderOpen, RotateCcw, Settings, X } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import { DEFAULT_OPENING_PREFS, type OpeningPrefs } from '../utils/openingPrefs'
import type { DisplayMode, ViewPreset } from '../types/model'
import { ViewCubeIcon } from './ViewCubeIcon'

// "Outils > Options" (Ctrl+,): the application's settings, saved on this
// computer as soon as they change. One section for now - how a file opens -
// laid out with a section list on the left so more can join it later.

const DISPLAY_MODES: { id: DisplayMode | 'keep'; label: string }[] = [
  { id: 'keep', label: 'Garder le mode en cours' },
  { id: 'shaded-edges', label: 'Ombré avec arêtes' },
  { id: 'shaded', label: 'Ombré' },
  { id: 'wireframe', label: 'Filaire' },
  { id: 'hidden-lines-visible', label: 'Lignes cachées visibles' },
  { id: 'hidden-lines-removed', label: 'Lignes cachées supprimées' },
  { id: 'realistic', label: 'Rendu réaliste' },
]

const VIEWS: { id: ViewPreset; label: string }[] = [
  { id: 'iso', label: 'Isométrique' },
  { id: 'front', label: 'Face' },
  { id: 'back', label: 'Arrière' },
  { id: 'left', label: 'Gauche' },
  { id: 'right', label: 'Droite' },
  { id: 'top', label: 'Dessus' },
  { id: 'bottom', label: 'Dessous' },
]

function Row({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 border-b border-[var(--border-light)] py-3 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Switch({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 rounded-full transition-colors ${checked ? 'bg-[var(--bg-active)]' : 'bg-[var(--bg-hover)]'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`}
      />
    </button>
  )
}

export function OptionsDialog() {
  const open = useModelStore((s) => s.optionsOpen)
  const setOpen = useModelStore((s) => s.setOptionsOpen)
  const prefs = useModelStore((s) => s.openingPrefs)
  const setPrefs = useModelStore((s) => s.setOpeningPrefs)
  const resetPrefs = useModelStore((s) => s.resetOpeningPrefs)

  // Escape closes the dialog only (captured before App's own Escape handling).
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      setOpen(false)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, setOpen])

  if (!open) return null

  const isDefault = (Object.keys(DEFAULT_OPENING_PREFS) as (keyof OpeningPrefs)[]).every(
    (key) => prefs[key] === DEFAULT_OPENING_PREFS[key],
  )

  return (
    <div
      className="app-no-drag fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      onClick={() => setOpen(false)}
    >
      <div
        role="dialog"
        aria-label="Options"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-xl border border-[var(--border-light)] bg-[var(--bg-modal)] shadow-2xl"
      >
        <nav className="hidden w-48 shrink-0 flex-col gap-1 border-r border-[var(--border-light)] bg-[var(--bg-panel)] p-3 sm:flex">
          <p className="mb-2 flex items-center gap-2 px-2 text-sm font-semibold text-[var(--text-primary)]">
            <Settings size={15} />
            Options
          </p>
          <span className="flex items-center gap-2 rounded-lg bg-[var(--bg-active)] px-2 py-1.5 text-xs font-medium text-white">
            <FolderOpen size={14} />
            À l'ouverture
          </span>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--border-light)] px-5 py-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)]">À l'ouverture d'un fichier</h2>
              <p className="text-xs text-[var(--text-muted)]">
                S'applique au prochain fichier ouvert. Un projet .pindi garde son propre affichage.
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              title="Fermer (Échap)"
              className="rounded-lg p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="overflow-y-auto px-5 py-2">
            <Row title="Afficher la grille" hint="Grille au sol, posée sous la pièce (touche G pour la masquer ensuite).">
              <Switch checked={prefs.grid} onChange={(grid) => setPrefs({ grid })} label="Afficher la grille" />
            </Row>

            <Row
              title="Couleurs par pièce pour les assemblages"
              hint="Une couleur par pièce, les pièces identiques partagent la même. Une pièce seule s'ouvre toujours en gris."
            >
              <Switch
                checked={prefs.assemblyColors}
                onChange={(assemblyColors) => setPrefs({ assemblyColors })}
                label="Couleurs par pièce pour les assemblages"
              />
            </Row>

            <Row title="Mode d'affichage" hint="Mode dans lequel le fichier s'ouvre.">
              <select
                value={prefs.displayMode}
                onChange={(e) => setPrefs({ displayMode: e.target.value as OpeningPrefs['displayMode'] })}
                aria-label="Mode d'affichage à l'ouverture"
                className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-2 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--bg-active)]"
              >
                {DISPLAY_MODES.map(({ id, label }) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Row>

            <div className="py-3">
              <p className="text-sm font-medium text-[var(--text-primary)]">Vue de départ</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                Orientation à l'ouverture, et celle de « Réinitialiser la vue ».
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {VIEWS.map(({ id, label }) => {
                  const active = prefs.startView === id
                  return (
                    <button
                      key={id}
                      onClick={() => setPrefs({ startView: id })}
                      aria-pressed={active}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? 'bg-[var(--bg-active)] text-white'
                          : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      <ViewCubeIcon view={id} active={active} />
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-[var(--border-light)] px-5 py-3">
            <button
              onClick={resetPrefs}
              disabled={isDefault}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:pointer-events-none disabled:opacity-40"
            >
              <RotateCcw size={13} />
              Rétablir les réglages par défaut
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg bg-[var(--bg-active)] px-4 py-1.5 text-xs font-medium text-white hover:brightness-110"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
