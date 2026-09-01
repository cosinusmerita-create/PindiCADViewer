import { useState } from 'react'
import { ChevronDown, ChevronUp, Scissors } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import type { ClippingAxis } from '../types/model'

const AXES: { id: ClippingAxis; label: string }[] = [
  { id: 'x', label: 'X' },
  { id: 'y', label: 'Y' },
  { id: 'z', label: 'Z' },
]

export function ClippingPlane() {
  const [collapsed, setCollapsed] = useState(true)
  const object = useModelStore((s) => s.object)
  const boundingBox = useModelStore((s) => s.boundingBox)
  const clippingEnabled = useModelStore((s) => s.clippingEnabled)
  const clippingAxis = useModelStore((s) => s.clippingAxis)
  const clippingPosition = useModelStore((s) => s.clippingPosition)
  const setClippingEnabled = useModelStore((s) => s.setClippingEnabled)
  const setClippingAxis = useModelStore((s) => s.setClippingAxis)
  const setClippingPosition = useModelStore((s) => s.setClippingPosition)

  const min = boundingBox ? boundingBox.min[clippingAxis] : 0
  const max = boundingBox ? boundingBox.max[clippingAxis] : 1
  const range = max - min || 1

  const handleAxisChange = (axis: ClippingAxis) => {
    setClippingAxis(axis)
    if (boundingBox) {
      setClippingPosition((boundingBox.min[axis] + boundingBox.max[axis]) / 2)
    }
  }

  return (
    <div className="shrink-0 border-t border-[var(--border-light)] bg-[var(--bg-panel)]">
      <button
        onClick={() => setCollapsed((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 transition-colors hover:text-slate-300"
      >
        <Scissors size={14} />
        Plan de coupe
        {collapsed ? (
          <ChevronUp size={14} className="ml-auto" />
        ) : (
          <ChevronDown size={14} className="ml-auto" />
        )}
      </button>

      {!collapsed && (
        <div className="flex flex-wrap items-center gap-4 px-4 pb-3">
          <button
            onClick={() => setClippingEnabled(!clippingEnabled)}
            disabled={!object}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
              clippingEnabled
                ? 'bg-[var(--bg-active)] text-white'
                : 'bg-white/5 text-slate-400 hover:text-slate-200'
            }`}
          >
            {clippingEnabled ? 'Coupe activée' : 'Coupe désactivée'}
          </button>

          <div className="flex shrink-0 items-center rounded-lg bg-white/5 p-0.5">
            {AXES.map(({ id, label }) => (
              <button
                key={id}
                onClick={() => handleAxisChange(id)}
                disabled={!object}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
                  clippingAxis === id
                    ? 'bg-[var(--bg-active)] text-white'
                    : 'text-slate-400 hover:text-slate-200'
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
            disabled={!object || !clippingEnabled}
            onChange={(e) => setClippingPosition(Number(e.target.value))}
            className="h-1.5 w-full max-w-xs flex-1 accent-[var(--bg-active)] disabled:opacity-30"
          />

          <span className="w-16 shrink-0 text-right text-xs text-slate-500">
            {clippingPosition.toFixed(1)} mm
          </span>
        </div>
      )}
    </div>
  )
}
