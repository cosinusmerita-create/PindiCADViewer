import { useRef, useState } from 'react'
import {
  Camera,
  ChevronDown,
  FileDown,
  FolderOpen,
  Link2,
  Loader2,
  Mail,
  Menu,
  Save,
  Share2,
  Upload,
  X,
} from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import { useToastStore } from '../hooks/useToastStore'
import { useDevice } from '../hooks/useDevice'
import { useFileLoader, OPEN_FILE_ACCEPT } from '../hooks/useFileLoader'
import {
  buildPdfBlobAndFile,
  exportTechnicalPdf,
  pdfFileName,
  pngFileName,
  requestCloseProject,
  saveProjectFile,
} from '../utils/fileActions'

// Groups every save/export/share action behind one "Fichier" dropdown, per
// the spec's request to collect them in one place - "Ouvrir" itself stays
// as its own prominent toolbar button too (unchanged, since it's the single
// most common action), duplicated here just for discoverability.
export function FileMenu() {
  const object = useModelStore((s) => s.object)
  const fileName = useModelStore((s) => s.fileName)
  const projectName = useModelStore((s) => s.projectName)
  const setProjectName = useModelStore((s) => s.setProjectName)
  const pushToast = useToastStore((s) => s.pushToast)
  const { loadFile } = useFileLoader()
  const { isMobile } = useDevice()

  const [open, setOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const openInputRef = useRef<HTMLInputElement>(null)
  const projectInputRef = useRef<HTMLInputElement>(null)

  const close = () => {
    setOpen(false)
    setShareOpen(false)
  }

  const handleSaveProject = () => {
    saveProjectFile(pushToast)
    close()
  }

  const handleClose = () => {
    requestCloseProject()
    close()
  }

  const handleExportPdf = async () => {
    if (!fileName) return
    setBusy('pdf')
    await exportTechnicalPdf(pushToast)
    setBusy(null)
    close()
  }

  const handleCapturePng = (transparent: boolean) => {
    const state = useModelStore.getState()
    if (!state.capturePng || !fileName) return
    const dataUrl = state.capturePng(transparent)
    const link = document.createElement('a')
    link.href = dataUrl
    link.download = pngFileName(fileName, transparent)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    pushToast('Capture PNG exportée')
    close()
  }

  const handleShare = async () => {
    const canShareFiles = typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
    if (canShareFiles && fileName) {
      try {
        setBusy('share')
        const { file } = await buildPdfBlobAndFile(fileName)
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: 'PindiCADViewer', text: fileName })
          setBusy(null)
          close()
          return
        }
      } catch {
        // User cancelled the native share sheet, or the platform rejected
        // the file - fall through to the manual menu below either way.
      }
      setBusy(null)
    }
    setShareOpen(true)
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      pushToast('Lien copié')
    } catch {
      pushToast('Impossible de copier le lien')
    }
    close()
  }

  const handleEmail = async () => {
    if (!fileName) return
    setBusy('email')
    try {
      const { doc } = await buildPdfBlobAndFile(fileName)
      // mailto: links cannot carry a file attachment in any browser - there
      // is no cross-browser API for it. The PDF is downloaded right before
      // opening the mail client so it's sitting in Downloads, ready to be
      // attached by hand, and the body says so explicitly rather than
      // silently pretending the attachment happened.
      doc.save(pdfFileName(fileName))
      const subject = encodeURIComponent(`Fiche technique - ${fileName}`)
      const body = encodeURIComponent(
        `Bonjour,\n\nVeuillez trouver ci-joint la fiche technique de "${fileName}" générée avec PindiCADViewer.\n\n(Le PDF vient d'être téléchargé - pensez à le joindre manuellement à cet e-mail, les navigateurs ne permettent pas de le faire automatiquement.)`,
      )
      window.location.href = `mailto:?subject=${subject}&body=${body}`
    } catch {
      pushToast("Échec de la préparation de l'e-mail")
    } finally {
      setBusy(null)
      close()
    }
  }

  if (!object) return null

  return (
    <div className="relative">
      <input
        ref={openInputRef}
        type="file"
        accept={OPEN_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) loadFile(e.target.files[0])
          e.target.value = ''
        }}
      />
      <input
        ref={projectInputRef}
        type="file"
        accept=".pindi"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) loadFile(e.target.files[0])
          e.target.value = ''
        }}
      />

      <button
        title="Fichier"
        onClick={() => setOpen((v) => !v)}
        className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
          open ? 'bg-sky-500 text-white' : 'bg-white/5 text-slate-400 hover:text-slate-200'
        }`}
      >
        {isMobile ? (
          <Menu size={16} />
        ) : (
          <>
            Fichier <ChevronDown size={13} />
          </>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50" onClick={close}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute left-0 top-9 w-64 overflow-hidden rounded-lg border border-[var(--border-light)] bg-[var(--bg-panel)] py-1 text-sm shadow-xl"
          >
            <div className="px-3 py-2">
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Nom du projet (fiche PDF)
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Optionnel..."
                className="w-full rounded border border-[var(--border-light)] bg-[#0f0f1e] px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div className="my-1 h-px bg-white/5" />

            <button
              onClick={() => {
                openInputRef.current?.click()
                close()
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-white/5"
            >
              <FolderOpen size={14} className="text-slate-500" /> Ouvrir
            </button>
            <button
              onClick={handleSaveProject}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-white/5"
            >
              <Save size={14} className="text-slate-500" /> Enregistrer le projet (.pindi)
            </button>
            <button
              onClick={() => {
                projectInputRef.current?.click()
                close()
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-white/5"
            >
              <Upload size={14} className="text-slate-500" /> Charger un projet (.pindi)
            </button>

            <div className="my-1 h-px bg-white/5" />

            <button
              onClick={handleClose}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-white/5"
            >
              <X size={14} className="text-slate-500" /> Fermer
            </button>

            <div className="my-1 h-px bg-white/5" />

            <button
              onClick={handleExportPdf}
              disabled={busy !== null}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40"
            >
              {busy === 'pdf' ? <Loader2 size={14} className="animate-spin text-slate-500" /> : <FileDown size={14} className="text-slate-500" />}
              Exporter PDF
            </button>
            <button
              onClick={() => handleCapturePng(false)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-white/5"
            >
              <Camera size={14} className="text-slate-500" /> Capture PNG
            </button>
            <button
              onClick={() => handleCapturePng(true)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-white/5"
            >
              <Camera size={14} className="text-slate-500" /> Capture PNG (fond transparent)
            </button>

            <div className="my-1 h-px bg-white/5" />

            <button
              onClick={handleShare}
              disabled={busy !== null}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40"
            >
              {busy === 'share' ? <Loader2 size={14} className="animate-spin text-slate-500" /> : <Share2 size={14} className="text-slate-500" />}
              Partager
            </button>

            {shareOpen && (
              <div className="border-t border-[var(--border-light)] bg-[#0f0f1e] py-1">
                <button
                  onClick={handleCopyLink}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200"
                >
                  <Link2 size={13} /> Copier le lien
                </button>
                <button
                  onClick={handleExportPdf}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200"
                >
                  <FileDown size={13} /> Télécharger le PDF
                </button>
                <button
                  onClick={handleSaveProject}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200"
                >
                  <Save size={13} /> Télécharger le projet .pindi
                </button>
                <button
                  onClick={handleEmail}
                  disabled={busy !== null}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-400 hover:bg-white/5 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-40"
                >
                  {busy === 'email' ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                  Envoyer par e-mail
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
