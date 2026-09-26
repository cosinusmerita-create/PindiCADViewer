import { useEffect, useState, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import { useDevice } from '../hooks/useDevice'
import { FileMenu } from './FileMenu'
import { toggleViewerFullscreen } from '../utils/fullscreen'
import type { DisplayMode, Theme } from '../types/model'

const DISPLAY_MODES: { id: DisplayMode; label: string; shortcut: string }[] = [
  { id: 'shaded-edges', label: 'Ombré avec arêtes', shortcut: '1' },
  { id: 'shaded', label: 'Ombré', shortcut: '2' },
  { id: 'wireframe', label: 'Filaire', shortcut: '3' },
  { id: 'hidden-lines-visible', label: 'Lignes cachées visibles', shortcut: '4' },
  { id: 'hidden-lines-removed', label: 'Lignes cachées supprimées', shortcut: '5' },
  { id: 'realistic', label: 'Rendu réaliste', shortcut: '6' },
]

const THEMES: { id: Theme; label: string }[] = [
  { id: 'dark', label: 'Mode nuit' },
  { id: 'light', label: 'Mode jour' },
  { id: 'solidworks', label: 'Mode classique' },
]

const WEBSITE_URL = 'https://cosinusmerita-create.github.io/PindiCADViewer/'

type MenuId = 'view' | 'tools' | 'help'

interface MenuItemProps {
  label: string
  shortcut?: string
  checked?: boolean
  disabled?: boolean
  onClick: () => void
}

function MenuItem({ label, shortcut, checked, disabled, onClick }: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-slate-300 hover:bg-white/5 disabled:pointer-events-none disabled:opacity-40"
    >
      <span className="flex w-4 shrink-0 justify-center">{checked && <Check size={13} className="text-sky-400" />}</span>
      <span className="flex-1">{label}</span>
      {shortcut && <span className="text-[11px] text-slate-500">{shortcut}</span>}
    </button>
  )
}

function MenuSeparator({ label }: { label?: string }) {
  return label ? (
    <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</div>
  ) : (
    <div className="my-1 h-px bg-white/5" />
  )
}

interface DropdownProps {
  id: MenuId
  label: string
  open: MenuId | null
  setOpen: (id: MenuId | null) => void
  children: ReactNode
}

// One top-level entry. Once any menu is open, hovering another one switches
// to it (the usual desktop menu-bar behavior); a click outside closes it.
function Dropdown({ id, label, open, setOpen, children }: DropdownProps) {
  const isOpen = open === id
  return (
    <div className="relative h-full">
      <button
        onClick={() => setOpen(isOpen ? null : id)}
        onMouseEnter={() => open && setOpen(id)}
        className={`app-no-drag h-full px-3 text-[13px] transition-colors ${
          isOpen
            ? 'bg-[var(--bg-hover)] text-[var(--text-primary)]'
            : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
        }`}
      >
        {label}
      </button>
      {isOpen && (
        <>
          <div className="app-no-drag fixed inset-0 z-40" onClick={() => setOpen(null)} />
          <div
            onClick={() => setOpen(null)}
            className="app-no-drag absolute left-0 top-full z-50 w-64 overflow-hidden rounded-b-lg border border-[var(--border-light)] bg-[var(--bg-panel)] py-1 text-sm shadow-xl"
          >
            {children}
          </div>
        </>
      )}
    </div>
  )
}

// The application's own top bar: logo first, then Fichier / Affichage / Outils / Aide,
// like a CAD program's menu bar. In the desktop app the OS title bar is
// hidden (see electron/main.js) and this bar takes its place - draggable,
// with the OS window buttons overlaid on the right.
export function MenuBar() {
  const { isMobile } = useDevice()
  const object = useModelStore((s) => s.object)
  const clearModel = useModelStore((s) => s.clearModel)
  const displayMode = useModelStore((s) => s.displayMode)
  const setDisplayMode = useModelStore((s) => s.setDisplayMode)
  const showGrid = useModelStore((s) => s.showGrid)
  const setShowGrid = useModelStore((s) => s.setShowGrid)
  const theme = useModelStore((s) => s.theme)
  const setTheme = useModelStore((s) => s.setTheme)
  const toggleHelp = useModelStore((s) => s.toggleHelp)
  const setOptionsOpen = useModelStore((s) => s.setOptionsOpen)
  const [open, setOpen] = useState<MenuId | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)

  const isElectron = Boolean(window.electronAPI?.isElectron)
  const isMac = isElectron && /Mac/i.test(navigator.platform)

  // Keeps the OS window buttons (minimize/maximize/close, drawn over the right
  // end of this bar by Electron) matching the active theme.
  useEffect(() => {
    if (!isElectron) return
    // Deferred a frame: the theme's body class is applied by App.tsx's own
    // effect, which runs AFTER this child's, so reading the CSS variables
    // right away would still give the PREVIOUS theme's colors.
    const frame = requestAnimationFrame(() => {
      const styles = getComputedStyle(document.body)
      window.electronAPI?.setTitleBarOverlay?.({
        color: styles.getPropertyValue('--bg-toolbar').trim() || '#1a1a2e',
        symbolColor: styles.getPropertyValue('--text-primary').trim() || '#e2e8f0',
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [isElectron, theme])

  if (isMobile) return null

  return (
    <div
      className="app-drag flex h-12 shrink-0 items-stretch border-b border-[var(--border-light)] bg-[var(--bg-toolbar)]"
      style={{ paddingLeft: isMac ? 80 : 8 }}
    >
      <button
        title="Retour à l'écran d'accueil"
        onClick={() => clearModel()}
        className="app-no-drag flex shrink-0 items-center gap-2 rounded px-2"
      >
        <img
          src={`${import.meta.env.BASE_URL}logo-512.png`}
          alt="PindiCADViewer"
          className="h-10 w-10 rounded-lg object-contain"
        />
        <span className="text-base font-bold tracking-tight text-[var(--text-primary)]">
          Pindi<span style={{ color: 'var(--bg-active)' }}>CAD</span>Viewer
        </span>
      </button>

      <div className="ml-2 flex items-stretch">
        <FileMenu variant="menubar" />

        <Dropdown id="view" label="Affichage" open={open} setOpen={setOpen}>
          <MenuSeparator label="Mode d'affichage" />
          {DISPLAY_MODES.map((m) => (
            <MenuItem
              key={m.id}
              label={m.label}
              shortcut={m.shortcut}
              checked={displayMode === m.id}
              disabled={!object}
              onClick={() => setDisplayMode(m.id)}
            />
          ))}
          <MenuSeparator />
          <MenuItem label="Grille au sol" shortcut="G" checked={showGrid} onClick={() => setShowGrid(!showGrid)} />
          <MenuItem label="Plein écran (vue 3D)" disabled={!object} onClick={toggleViewerFullscreen} />
          <MenuSeparator label="Thème" />
          {THEMES.map((t) => (
            <MenuItem key={t.id} label={t.label} checked={theme === t.id} onClick={() => setTheme(t.id)} />
          ))}
        </Dropdown>

        <Dropdown id="tools" label="Outils" open={open} setOpen={setOpen}>
          <MenuItem label="Options…" shortcut="Ctrl+," onClick={() => setOptionsOpen(true)} />
        </Dropdown>

        <Dropdown id="help" label="Aide" open={open} setOpen={setOpen}>
          <MenuItem label="Guide d'utilisation" shortcut="F1" onClick={() => toggleHelp()} />
          <MenuItem label="Site web" onClick={() => window.open(WEBSITE_URL, '_blank', 'noopener')} />
          <MenuSeparator />
          <MenuItem label="À propos de PindiCADViewer" onClick={() => setAboutOpen(true)} />
        </Dropdown>
      </div>

      {aboutOpen && (
        <div
          className="app-no-drag fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setAboutOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex w-full max-w-sm flex-col items-center gap-3 rounded-xl border border-[var(--border-light)] bg-[var(--bg-modal)] p-6 text-center"
          >
            <img src={`${import.meta.env.BASE_URL}logo.png`} alt="PindiCADViewer" className="w-40 rounded-2xl" />
            <p className="text-sm font-bold text-[var(--text-primary)]">PindiCADViewer v1.0</p>
            <p className="text-[13px] text-[var(--text-secondary)]">Puissance Mécanique et Précision 3D</p>
            <p className="text-xs text-[var(--text-muted)]">
              Projet Ferme Écologique Pindi
              <br />
              Contact : fermeecopindi@gmail.com
              <br />© 2026 Patrick Pindi
            </p>
            <button
              onClick={() => setAboutOpen(false)}
              className="rounded-lg bg-sky-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-400"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
