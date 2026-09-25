import type { ComponentType } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import { useModelStore } from '../hooks/useModelState'
import type { Theme } from '../types/model'

const THEMES: { id: Theme; label: string; icon: ComponentType<{ size?: number }> }[] = [
  { id: 'dark', label: 'Mode nuit', icon: Moon },
  { id: 'light', label: 'Mode jour', icon: Sun },
  { id: 'solidworks', label: 'Mode classique', icon: Monitor },
]

// Bottom bar: the file summary and the theme switcher. Everything actionable
// (view/color reset, fullscreen, clipping plane) now lives at the top, in the
// toolbar and the clipping strip right under it (see App.tsx).
export function StatusBar() {
  const object = useModelStore((s) => s.object)
  const fileName = useModelStore((s) => s.fileName)
  const triangleCount = useModelStore((s) => s.triangleCount)
  const theme = useModelStore((s) => s.theme)
  const setTheme = useModelStore((s) => s.setTheme)

  return (
    <footer
      className="relative flex h-9 shrink-0 items-center gap-2 border-t px-3 text-[var(--text-secondary)]"
      style={{ backgroundColor: 'var(--bg-toolbar)', borderColor: 'var(--border-color)' }}
    >
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
