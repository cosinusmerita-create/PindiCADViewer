import { TriangleAlert } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import { useToastStore } from '../hooks/useToastStore'
import { saveProjectFile } from '../utils/fileActions'

// Raised by requestCloseProject() (fileActions.ts) whenever "Fermer" (the
// File menu item or Ctrl+W - see FileMenu.tsx and App.tsx) is triggered
// while hasUnsavedChanges is true, instead of closing immediately.
export function CloseConfirmDialog() {
  const show = useModelStore((s) => s.showCloseConfirm)
  const setShowCloseConfirm = useModelStore((s) => s.setShowCloseConfirm)
  const clearModel = useModelStore((s) => s.clearModel)
  const pushToast = useToastStore((s) => s.pushToast)

  if (!show) return null

  const cancel = () => setShowCloseConfirm(false)

  const saveAndClose = () => {
    saveProjectFile(pushToast)
    clearModel()
  }

  const closeWithoutSaving = () => {
    clearModel()
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-light)] bg-[var(--bg-modal)] p-5 shadow-2xl">
        <div className="flex items-center gap-2 text-[var(--text-primary)]">
          <TriangleAlert size={18} className="text-amber-400" />
          <h2 className="text-sm font-semibold">Le projet a été modifié.</h2>
        </div>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">Voulez-vous enregistrer avant de fermer ?</p>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            onClick={cancel}
            className="rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Annuler
          </button>
          <button
            onClick={closeWithoutSaving}
            className="rounded-md border border-red-500/40 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/10"
          >
            Fermer sans enregistrer
          </button>
          <button
            onClick={saveAndClose}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-400"
          >
            Enregistrer et fermer
          </button>
        </div>
      </div>
    </div>
  )
}
