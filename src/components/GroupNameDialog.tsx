import { useEffect, useRef, useState } from 'react'
import { Group } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'

// The actual form, remounted (via the `key` on its caller below, the same
// pattern AnnotationPopup.tsx uses) every time the prompt opens - a fresh
// mount naturally starts with the default name and grabs focus, rather than
// resetting state imperatively from an effect on every open.
function GroupNameForm({ selectedCount }: { selectedCount: number }) {
  const setShowGroupNamePrompt = useModelStore((s) => s.setShowGroupNamePrompt)
  const createGroup = useModelStore((s) => s.createGroup)
  const [name, setName] = useState('Nouveau groupe')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.select())
    return () => cancelAnimationFrame(id)
  }, [])

  const close = () => setShowGroupNamePrompt(false)
  const confirm = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    createGroup(trimmed)
    close()
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4" onClick={close}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl border border-[var(--border-light)] bg-[var(--bg-modal)] p-5 shadow-2xl"
      >
        <div className="flex items-center gap-2 text-[var(--text-primary)]">
          <Group size={18} className="text-sky-400" />
          <h2 className="text-sm font-semibold">Créer un groupe</h2>
        </div>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          {selectedCount} pièces sélectionnées seront regroupées sous un nouveau nœud.
        </p>

        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') confirm()
            else if (e.key === 'Escape') close()
          }}
          placeholder="Nom du groupe, ex: Palier supérieur"
          className="mt-3 w-full rounded border border-[var(--border-light)] bg-[var(--bg-input)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-sky-500"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={close}
            className="rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Annuler
          </button>
          <button
            onClick={confirm}
            disabled={!name.trim()}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-400 disabled:pointer-events-none disabled:opacity-40"
          >
            Créer le groupe
          </button>
        </div>
      </div>
    </div>
  )
}

// Shown after "Créer un groupe" (Toolbar's Grouper button or the context
// menu item) - names the new folder node createGroup() wraps the current
// selection in. Same modal chrome as PindiSourcePrompt.tsx/
// CloseConfirmDialog.tsx.
export function GroupNameDialog() {
  const show = useModelStore((s) => s.showGroupNamePrompt)
  const selectedCount = useModelStore((s) => s.selectedNodeIds.length)
  if (!show) return null
  return <GroupNameForm selectedCount={selectedCount} />
}
