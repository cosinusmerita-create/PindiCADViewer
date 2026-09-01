import { useEffect, useRef } from 'react'
import { useModelStore } from '../hooks/useModelState'

export function PipetteCursor() {
  const pipetteMode = useModelStore((s) => s.pipetteMode)
  const pickedColor = useModelStore((s) => s.pickedColor)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pipetteMode || !pickedColor) return

    const onMove = (e: PointerEvent) => {
      if (ref.current) {
        ref.current.style.transform = `translate(${e.clientX + 14}px, ${e.clientY + 14}px)`
      }
    }
    window.addEventListener('pointermove', onMove)
    return () => window.removeEventListener('pointermove', onMove)
  }, [pipetteMode, pickedColor])

  if (!pipetteMode || !pickedColor) return null

  return (
    <div
      ref={ref}
      className="pointer-events-none fixed left-0 top-0 z-50 h-4 w-4 rounded border border-white/70 shadow-lg"
      style={{ backgroundColor: pickedColor }}
    />
  )
}
