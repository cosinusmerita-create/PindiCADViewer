import { useEffect, useRef, useState } from 'react'
import { useModelStore } from '../hooks/useModelState'

const POPUP_WIDTH = 260

interface PendingAnnotation {
  point: { x: number; y: number; z: number }
  x: number
  y: number
}

// The actual form, remounted (via the `key` on its caller below) every time
// a new point is placed - letting a fresh mount naturally start with empty
// text and grab focus, rather than resetting state imperatively from an
// effect on every pending-annotation change.
function AnnotationForm({ pending }: { pending: PendingAnnotation }) {
  const setPendingAnnotation = useModelStore((s) => s.setPendingAnnotation)
  const addAnnotation = useModelStore((s) => s.addAnnotation)
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    // Let the popup mount before focusing, so the click that placed the
    // marker doesn't also immediately blur it away.
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [])

  const left = Math.min(pending.x, window.innerWidth - POPUP_WIDTH - 8)
  const top = Math.min(pending.y, window.innerHeight - 140)

  const submit = () => {
    if (text.trim()) addAnnotation(text)
    else setPendingAnnotation(null)
  }

  return (
    <div className="fixed inset-0 z-50" onClick={() => setPendingAnnotation(null)}>
      <div
        style={{ left, top, width: POPUP_WIDTH }}
        onClick={(e) => e.stopPropagation()}
        className="absolute rounded-lg border border-sky-500/40 bg-[var(--bg-panel)] p-2.5 shadow-xl"
      >
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            } else if (e.key === 'Escape') {
              setPendingAnnotation(null)
            }
          }}
          placeholder="Texte de l'annotation..."
          rows={3}
          className="w-full resize-none rounded border border-[var(--border-light)] bg-[#0f0f1e] px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <div className="mt-2 flex justify-end gap-1.5">
          <button
            onClick={() => setPendingAnnotation(null)}
            className="rounded-md px-2.5 py-1 text-xs font-medium text-slate-400 hover:bg-white/5 hover:text-slate-200"
          >
            Annuler
          </button>
          <button
            onClick={submit}
            className="rounded-md bg-sky-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-sky-400"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  )
}

// The text-entry popup that appears at the click position right after
// placing an annotation marker in annotation mode - same screen-anchored
// overlay pattern as ContextMenu.tsx (positioned by raw client x/y from the
// click event, clamped to stay on-screen).
export function AnnotationPopup() {
  const pending = useModelStore((s) => s.pendingAnnotation)
  if (!pending) return null
  return <AnnotationForm key={`${pending.point.x}-${pending.point.y}-${pending.point.z}`} pending={pending} />
}
