import { useEffect, useState, type ComponentType } from 'react'
import { Eraser, Maximize, Minimize, Monitor, Moon, MoreHorizontal, RotateCcw, Sun } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import type { Theme } from '../types/model'

const THEMES: { id: Theme; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'dark', label: 'Mode nuit', icon: Moon },
  { id: 'light', label: 'Mode jour', icon: Sun },
  { id: 'solidworks', label: 'Mode classique', icon: Monitor },
]

interface StatusButtonProps {
  icon: ComponentType<{ size?: number }>
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}

// Shared look for every secondary action moved down from the toolbar -
// deliberately plain/ghost by default (no idle background the way the
// toolbar's own buttons have) so a status bar full of them doesn't read as
// busy as the toolbar it was split off from.
function StatusButton({ icon: Icon, label, active, disabled, onClick }: StatusButtonProps) {
  return (
    <button
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
        active ? 'bg-[var(--bg-active)] text-white' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
      }`}
    >
      <Icon size={14} />
      <span className="hidden lg:inline">{label}</span>
    </button>
  )
}

// The toolbar got too crowded (see Toolbar.tsx, which keeps opening a file,
// display modes, the click-to-place tools, and the appearance/grouping
// toggles that used to live here) - this bar holds what's left: view/color
// reset, the file summary, and the theme switcher. Sits directly below
// ClippingPlane in App.tsx's layout, so the clipping bar (an independent
// collapsible panel, unchanged here) naturally lands right above this one.
export function StatusBar() {
  const object = useModelStore((s) => s.object)
  const fileName = useModelStore((s) => s.fileName)
  const triangleCount = useModelStore((s) => s.triangleCount)
  const resetView = useModelStore((s) => s.resetView)
  const customColors = useModelStore((s) => s.customColors)
  const resetAllColors = useModelStore((s) => s.resetAllColors)
  const theme = useModelStore((s) => s.theme)
  const setTheme = useModelStore((s) => s.setTheme)
  const [moreOpen, setMoreOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement))

  // Stays in sync when fullscreen is left some way other than this button -
  // the Esc key, the browser's own "exit fullscreen" affordance.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
    else document.exitFullscreen?.()
  }

  const hasCustomColors = Object.keys(customColors).length > 0

  // Rendered twice - once inline for sm+ screens, once stacked in the "..."
  // dropdown for narrow ones - so the button list itself lives in one place.
  const actionButtons = (
    <>
      <StatusButton icon={RotateCcw} label="Réinitialiser la vue" disabled={!object} onClick={() => resetView?.()} />
      <StatusButton
        icon={Eraser}
        label="Réinitialiser les couleurs"
        disabled={!hasCustomColors}
        onClick={() => resetAllColors()}
      />
      <StatusButton
        icon={isFullscreen ? Minimize : Maximize}
        label={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
        active={isFullscreen}
        onClick={toggleFullscreen}
      />
    </>
  )

  return (
    <footer
      className="relative flex h-9 shrink-0 items-center gap-2 border-t px-3 text-[var(--text-secondary)]"
      style={{ backgroundColor: 'var(--bg-toolbar)', borderColor: 'var(--border-color)' }}
    >
      <div className="hidden shrink-0 items-center gap-1.5 sm:flex">{actionButtons}</div>

      <div className="relative shrink-0 sm:hidden">
        <button
          title="Plus d'actions"
          onClick={() => setMoreOpen((v) => !v)}
          className="flex items-center justify-center rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        >
          <MoreHorizontal size={16} />
        </button>
        {moreOpen && (
          <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)}>
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute bottom-11 left-3 flex w-56 flex-col gap-0.5 rounded-lg border border-[var(--border-light)] bg-[var(--bg-panel)] p-1.5 shadow-xl"
            >
              {actionButtons}
            </div>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1 truncate text-center text-xs text-[var(--text-muted)]">
        {fileName && (
          <span>
            {fileName}
            {object && <span className="text-[var(--text-muted)]"> — {triangleCount.toLocaleString('fr-FR')} triangles</span>}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center rounded-lg bg-[var(--bg-hover)] p-0.5">
        {THEMES.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            title={label}
            onClick={() => setTheme(id)}
            className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
              theme === id ? 'bg-[var(--bg-active)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Icon size={14} />
          </button>
        ))}
      </div>
    </footer>
  )
}
