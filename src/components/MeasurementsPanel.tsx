import { Ruler, Trash2, X } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'

export function MeasurementsPanel() {
  const measurements = useModelStore((s) => s.measurements)
  const removeMeasurement = useModelStore((s) => s.removeMeasurement)
  const clearMeasurements = useModelStore((s) => s.clearMeasurements)

  if (measurements.length === 0) return null

  return (
    <div className="pointer-events-auto absolute right-4 top-4 w-56 max-h-[60%] overflow-hidden rounded-lg border border-[var(--border-light)] bg-[var(--bg-panel)]/95 shadow-xl backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-[var(--border-light)] px-3 py-2">
        <span className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500">
          <Ruler size={12} /> Mesures
        </span>
        <button
          title="Effacer toutes les mesures"
          onClick={() => clearMeasurements()}
          className="text-slate-500 hover:text-red-400"
        >
          <Trash2 size={13} />
        </button>
      </div>

      <ul className="max-h-56 overflow-y-auto py-1">
        {measurements.map((m, i) => (
          <li
            key={m.id}
            className="group flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5"
          >
            <span className="truncate">
              Mesure {i + 1} :{' '}
              {m.type === 'distance'
                ? `${(m.distance ?? 0).toFixed(2)} mm`
                : `⌀ ${((m.radius ?? 0) * 2).toFixed(2)} mm${m.approx ? ' (approx)' : ''}`}
            </span>
            <button
              title="Supprimer cette mesure"
              onClick={() => removeMeasurement(m.id)}
              className="shrink-0 text-slate-500 hover:text-red-400"
            >
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
