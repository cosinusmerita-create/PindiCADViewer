import { ArrowLeftRight, Crosshair, Scissors, X } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import type { ClippingAxis } from '../types/model'

const AXES: { id: ClippingAxis; label: string; title: string }[] = [
  { id: 'x', label: 'X', title: 'Couper perpendiculairement à X (gauche / droite)' },
  { id: 'y', label: 'Y', title: 'Couper perpendiculairement à Y (haut / bas)' },
  { id: 'z', label: 'Z', title: 'Couper perpendiculairement à Z (avant / arrière)' },
]

const STRIP_BUTTON =
  'flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30'

// Shown while the cut is on. The toolbar's "Plan de coupe" button both opens
// this strip and cuts the part (see toggleClipping in useModelState.ts), so
// there is no on/off switch here any more - only what shapes the cut, plus a
// way to remove it without going back up to the toolbar.
export function ClippingPlane() {
  const panelOpen = useModelStore((s) => s.clippingPanelOpen)
  const object = useModelStore((s) => s.object)
  const boundingBox = useModelStore((s) => s.boundingBox)
  const clippingAxis = useModelStore((s) => s.clippingAxis)
  const clippingPosition = useModelStore((s) => s.clippingPosition)
  const clippingFlipped = useModelStore((s) => s.clippingFlipped)
  const setClippingAxis = useModelStore((s) => s.setClippingAxis)
  const setClippingPosition = useModelStore((s) => s.setClippingPosition)
  const setClippingFlipped = useModelStore((s) => s.setClippingFlipped)
  const toggleClipping = useModelStore((s) => s.toggleClipping)

  const min = boundingBox ? boundingBox.min[clippingAxis] : 0
  const max = boundingBox ? boundingBox.max[clippingAxis] : 1
  const range = max - min || 1

  const center = (axis: ClippingAxis) => {
    if (boundingBox) setClippingPosition((boundingBox.min[axis] + boundingBox.max[axis]) / 2)
  }

  const handleAxisChange = (axis: ClippingAxis) => {
    setClippingAxis(axis)
    center(axis)
  }

  // Typed values are kept inside the part: past either end the cut would
  // show all or nothing, which reads as "the cut doesn't work".
  const handleTypedPosition = (text: string) => {
    const value = Number(text.replace(',', '.'))
    if (Number.isFinite(value)) setClippingPosition(Math.min(max, Math.max(min, value)))
  }

  if (!panelOpen) return null

  return (
    <div className="shrink-0 border-b border-[var(--border-light)] bg-[var(--bg-panel)] py-2">
      <div className="flex flex-wrap items-center gap-3 px-4">
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
          <Scissors size={14} className="text-[var(--bg-active)]" />
          Coupe selon
        </span>

        <div className="flex shrink-0 items-center rounded-lg bg-[var(--bg-hover)] p-0.5">
          {AXES.map(({ id, label, title }) => (
            <button
              key={id}
              title={title}
              onClick={() => handleAxisChange(id)}
              disabled={!object}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
                clippingAxis === id ? 'bg-[var(--bg-active)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <input
          type="range"
          min={min}
          max={max}
          step={range / 200}
          value={clippingPosition}
          disabled={!object}
          title="Glissez pour déplacer le plan de coupe"
          aria-label="Position du plan de coupe"
          onChange={(e) => setClippingPosition(Number(e.target.value))}
          className="h-1.5 w-full max-w-xs flex-1 accent-[var(--bg-active)] disabled:opacity-30"
        />

        <label className="flex shrink-0 items-center gap-1 text-xs text-[var(--text-muted)]">
          {/* key: re-mounts on every slider move so the field shows the live
              value, while typing edits it freely until Entrée / leaving it. */}
          <input
            key={clippingPosition.toFixed(1)}
            type="text"
            inputMode="decimal"
            defaultValue={clippingPosition.toFixed(1)}
            disabled={!object}
            aria-label="Position du plan de coupe en mm"
            title={`Position en mm (de ${min.toFixed(1)} à ${max.toFixed(1)}), validez avec Entrée`}
            onBlur={(e) => handleTypedPosition(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTypedPosition(e.currentTarget.value)
            }}
            className="w-16 rounded-md bg-[var(--bg-hover)] px-2 py-1 text-right text-xs text-[var(--text-primary)] outline-none focus:ring-1 focus:ring-[var(--bg-active)]"
          />
          mm
        </label>

        <button
          onClick={() => center(clippingAxis)}
          disabled={!object}
          title="Replacer le plan au milieu de la pièce"
          className={`${STRIP_BUTTON} bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]`}
        >
          <Crosshair size={13} />
          Centrer
        </button>

        <button
          onClick={() => setClippingFlipped(!clippingFlipped)}
          disabled={!object}
          title="Garder l'autre moitié de la pièce"
          className={`${STRIP_BUTTON} ${
            clippingFlipped ? 'bg-[var(--bg-active)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <ArrowLeftRight size={13} />
          Inverser le côté
        </button>

        <button
          onClick={toggleClipping}
          title="Retirer la coupe et fermer ces réglages"
          className={`${STRIP_BUTTON} ml-auto bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:bg-red-500/20 hover:text-red-500`}
        >
          <X size={13} />
          Retirer la coupe
        </button>
      </div>
    </div>
  )
}
