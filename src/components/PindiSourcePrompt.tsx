import { useRef } from 'react'
import { FileUp } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import { GEOMETRY_FILE_ACCEPT } from '../hooks/useFileLoader'

// Shown while loading a .pindi project whose source geometry isn't already
// loaded (by content hash) - explains *why* the user is about to be asked
// for a file before the OS picker interrupts them, rather than opening it
// with no context. useFileLoader.ts's promptForSourceFile() is what sets
// (and awaits) this prompt.
export function PindiSourcePrompt() {
  const prompt = useModelStore((s) => s.pindiSourcePrompt)
  const setPindiSourcePrompt = useModelStore((s) => s.setPindiSourcePrompt)
  const inputRef = useRef<HTMLInputElement>(null)

  if (!prompt) return null

  const finish = (file: File | null) => {
    prompt.resolve(file)
    setPindiSourcePrompt(null)
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--border-light)] bg-[var(--bg-modal)] p-5 shadow-2xl">
        <div className="flex items-center gap-2 text-[var(--text-primary)]">
          <FileUp size={18} className="text-sky-400" />
          <h2 className="text-sm font-semibold">Fichier source requis</h2>
        </div>
        <p className="mt-3 text-sm text-[var(--text-secondary)]">
          Ce projet nécessite le fichier source :{' '}
          <span className="font-medium text-[var(--text-primary)]">{prompt.sourceFile}</span>. Veuillez le
          sélectionner.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept={GEOMETRY_FILE_ACCEPT}
          className="hidden"
          onChange={(e) => finish(e.target.files?.[0] ?? null)}
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={() => finish(null)}
            className="rounded-md px-3 py-1.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          >
            Annuler
          </button>
          <button
            onClick={() => inputRef.current?.click()}
            className="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-sky-400"
          >
            Sélectionner le fichier STEP
          </button>
        </div>
      </div>
    </div>
  )
}
