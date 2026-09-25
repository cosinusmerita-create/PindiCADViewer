import { X } from 'lucide-react'
import { usePrintStore } from '../hooks/usePrintStore'

const fmt = (v: number) => (Math.round(v * 100) / 100).toString()

// Fiche du tronçon cliqué dans l'aperçu éclaté (nom du STL, taille, volume,
// triangles), comme l'info-bulle d'un trancheur. Valeurs à l'échelle d'impression.
export function PrintPieceInfo() {
  const preview = usePrintStore((s) => s.preview)
  const selected = usePrintStore((s) => s.previewSelected)
  const stat = preview && selected !== null ? preview.stats[selected] : null
  if (!stat) return null
  return (
    <div className="absolute right-3 top-3 z-20 w-72 rounded-lg border border-amber-500/60 border-l-4 bg-[var(--bg-panel)]/95 p-3 text-xs text-[var(--text-secondary)] shadow-xl backdrop-blur">
      <button
        title="Fermer"
        onClick={() => usePrintStore.getState().set({ previewSelected: null })}
        className="absolute right-2 top-2 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
      >
        <X size={14} />
      </button>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-amber-400">Tronçon sélectionné</p>
      <p className="break-all pr-4 font-medium text-[var(--text-primary)]">Nom de l'objet : {stat.name}</p>
      <p>
        Taille : {fmt(stat.w)} x {fmt(stat.d)} x {fmt(stat.h)} mm
      </p>
      <p>Volume : {Math.round(stat.volume)} mm³</p>
      <p>Triangles : {stat.triangles}</p>
    </div>
  )
}
