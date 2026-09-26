import { useEffect, useRef } from 'react'
import { Pipette } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'

export function PipetteCursor() {
  const pipetteMode = useModelStore((s) => s.pipetteMode)
  const paintColor = useModelStore((s) => s.paintColor)
  const picking = useModelStore((s) => s.pipettePicking)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pipetteMode || !paintColor) return

    const onMove = (e: PointerEvent) => {
      if (ref.current) {
        ref.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`
      }
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [pipetteMode, paintColor])

  if (!pipetteMode || !paintColor) return null

  // Picking ("Prélever" / Alt+click) shows a dropper; painting, the colour.
  return picking ? (
    <div
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 z-50 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--bg-active)] text-white shadow-lg"
    >
      <Pipette size={12} />
    </div>
  ) : (
    <div
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 z-50 h-4 w-4 rounded border border-white/70 shadow-lg"
      style={{ backgroundColor: paintColor }}
    />
  )
}
