import { useEffect, useRef, useState, type ReactNode } from 'react'
import { UploadCloud } from 'lucide-react'
import { OPEN_FILE_ACCEPT, useFileLoader } from '../hooks/useFileLoader'
import { useModelStore } from '../hooks/useModelState'
import { STEP_QUALITY_OPTIONS, useStepQualityStore, type StepQuality } from '../utils/stepQuality'

interface FileDropZoneProps {
  children: ReactNode
}

function dragHasFiles(e: DragEvent) {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files')
}

// Whole seconds since loading started (0 when idle) - the parse runs in a
// worker with no incremental progress to report, so elapsed time is the
// only honest signal that it's still working.
function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!active) {
      setElapsed(0)
      return
    }
    const start = Date.now()
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000)
    return () => window.clearInterval(timer)
  }, [active])
  return elapsed
}

export function FileDropZone({ children }: FileDropZoneProps) {
  const { loadFile } = useFileLoader()
  const object = useModelStore((s) => s.object)
  const isLoading = useModelStore((s) => s.isLoading)
  const quality = useStepQualityStore((s) => s.quality)
  const setQuality = useStepQualityStore((s) => s.setQuality)
  const elapsed = useElapsedSeconds(isLoading)
  const error = useModelStore((s) => s.error)
  const [isDragging, setIsDragging] = useState(false)
  const dragCounter = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Global drag-and-drop listeners: the drop zone must react to a file being
  // dragged anywhere over the window, not just while hovering its own div —
  // that div stays pointer-events:none by default so it never intercepts
  // OrbitControls' mouse events on the canvas underneath.
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!dragHasFiles(e)) return
      e.preventDefault()
      dragCounter.current += 1
      setIsDragging(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!dragHasFiles(e)) return
      e.preventDefault()
    }
    const onDragLeave = (e: DragEvent) => {
      if (!dragHasFiles(e)) return
      dragCounter.current = Math.max(0, dragCounter.current - 1)
      if (dragCounter.current === 0) setIsDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!dragHasFiles(e)) return
      e.preventDefault()
      dragCounter.current = 0
      setIsDragging(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) loadFile(file)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [loadFile])

  return (
    <div
      className="relative h-full w-full"
      style={{ pointerEvents: isDragging ? 'auto' : 'none' }}
    >
      {children}

      <input
        ref={inputRef}
        type="file"
        accept={OPEN_FILE_ACCEPT}
        className="hidden"
        style={{ pointerEvents: 'auto' }}
        onChange={(e) => {
          if (e.target.files?.[0]) loadFile(e.target.files[0])
          e.target.value = ''
        }}
      />

      {isDragging && (
        <div className="pointer-events-none absolute inset-3 rounded-2xl border-2 border-dashed border-sky-400 bg-sky-400/5" />
      )}

      {!object && !isLoading && (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 px-4 text-center">
          {/* The logo image already carries the "PindiCADViewer" wordmark
              and "Puissance Mécanique et Précision 3D" subtitle, so it
              alone covers the name+subtitle - repeating them as separate
              text underneath would just be the same words twice. */}
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="PindiCADViewer"
            className="w-48 max-w-[70vw] rounded-3xl shadow-2xl shadow-black/50"
            style={{ animation: 'splash-logo-in 0.7s ease-out' }}
          />
          <div className="flex flex-col items-center gap-1.5">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-300">
              <UploadCloud size={16} className="text-sky-400" />
              Glissez un fichier STEP, STL ou OBJ ici
            </p>
            <p className="text-xs text-slate-600">.step · .stp · .stl · .obj</p>
          </div>
          <button
            onClick={() => inputRef.current?.click()}
            style={{ pointerEvents: 'auto' }}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-400"
          >
            Ouvrir un fichier
          </button>
          <label
            style={{ pointerEvents: 'auto' }}
            className="flex flex-col items-center gap-1 text-xs text-slate-500"
            title="Finesse du maillage des fichiers STEP : plus c'est fin, plus l'ouverture est longue"
          >
            <span>Qualité STEP</span>
            <select
              value={quality}
              onChange={(e) => setQuality(e.target.value as StepQuality)}
              className="rounded-md bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none"
            >
              {STEP_QUALITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-slate-600">
              {STEP_QUALITY_OPTIONS.find((o) => o.value === quality)?.hint}
            </span>
          </label>
        </div>
      )}

      {isLoading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/60">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400" />
            <p className="text-sm text-slate-300">Chargement du modèle… {elapsed} s</p>
            {elapsed >= 15 && (
              <p className="max-w-xs text-center text-xs text-slate-500">
                Les gros assemblages STEP sont longs à analyser. Choisissez la qualité « Standard » pour aller plus vite.
              </p>
            )}
          </div>
        </div>
      )}

      {error && (
        <div
          style={{ pointerEvents: 'auto' }}
          className="absolute bottom-4 left-1/2 max-w-[90%] -translate-x-1/2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      )}
    </div>
  )
}
