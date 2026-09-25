import { useModelStore } from '../hooks/useModelState'
import { EXPLODE_MODES, type ExplodeMode } from '../utils/explodeModes'

const chip = (active: boolean) =>
  `shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
    active
      ? 'bg-[var(--bg-active)] text-white'
      : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
  }`

// Layout picker + amplitude slider for the exploded view. The slider is the
// "progressive" control (0-100 %); with "Pas à pas" on it doubles as a
// disassembly timeline, parts leaving one after the other.
export function ExplodeControls() {
  const explodeFactor = useModelStore((s) => s.explodeFactor)
  const setExplodeFactor = useModelStore((s) => s.setExplodeFactor)
  const explodeMode = useModelStore((s) => s.explodeMode)
  const setExplodeMode = useModelStore((s) => s.setExplodeMode)
  const explodeSequential = useModelStore((s) => s.explodeSequential)
  const setExplodeSequential = useModelStore((s) => s.setExplodeSequential)
  const explodeGuides = useModelStore((s) => s.explodeGuides)
  const setExplodeGuides = useModelStore((s) => s.setExplodeGuides)
  const explodeDetail = useModelStore((s) => s.explodeDetail)
  const setExplodeDetail = useModelStore((s) => s.setExplodeDetail)

  return (
    <div className="flex shrink-0 items-center gap-2 text-xs text-[var(--text-secondary)]">
      <select
        value={explodeMode}
        onChange={(e) => setExplodeMode(e.target.value as ExplodeMode)}
        title="Type d'éclatement"
        className="shrink-0 rounded-md bg-[var(--bg-hover)] px-1.5 py-1 text-[11px] text-[var(--text-primary)] outline-none"
      >
        {EXPLODE_MODES.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>

      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={explodeFactor}
        onChange={(e) => setExplodeFactor(Number(e.target.value))}
        className="h-1 w-24 shrink-0 accent-[var(--bg-active)]"
      />
      <span className="w-9 shrink-0 text-right text-[11px] text-[var(--text-muted)]">
        {Math.round(explodeFactor * 100)}%
      </span>

      {explodeMode === 'subassembly' && (
        <label className="flex shrink-0 items-center gap-1" title="2e niveau : écartement des pièces à l'intérieur de chaque bloc">
          <span className="text-[11px]">Détail</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={explodeDetail}
            onChange={(e) => setExplodeDetail(Number(e.target.value))}
            className="h-1 w-16 accent-[var(--bg-active)]"
          />
        </label>
      )}

      <button
        title="Les pièces s'écartent une par une, de l'extérieur vers le centre"
        onClick={() => setExplodeSequential(!explodeSequential)}
        className={chip(explodeSequential)}
      >
        Pas à pas
      </button>
      <button
        title="Lignes pointillées entre la position d'origine et la position éclatée"
        onClick={() => setExplodeGuides(!explodeGuides)}
        className={chip(explodeGuides)}
      >
        Guides
      </button>
    </div>
  )
}
