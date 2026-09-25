import type { ComponentType, ReactNode } from 'react'

interface ToolButtonProps {
  icon: ComponentType<{ size?: number }>
  label: string
  title?: string
  active?: boolean
  // Adds a ring around active "click-to-place" tools (Mesure, Pipette...) to
  // tell them apart from plain on/off toggles (Grille, Transparence...).
  mode?: boolean
  disabled?: boolean
  onClick: () => void
  children?: ReactNode
}

// One look for every toolbar button, so a new tool can't drift from the rest.
export function ToolButton({ icon: Icon, label, title, active, mode, disabled, onClick }: ToolButtonProps) {
  return (
    <button
      title={title ?? label}
      onClick={onClick}
      disabled={disabled}
      className={`flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-30 ${
        active
          ? `bg-[var(--bg-active)] text-white ${mode ? 'ring-2 ring-sky-300/70' : ''}`
          : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
      }`}
    >
      <Icon size={14} />
      <span className="hidden sm:inline">{label}</span>
    </button>
  )
}

// A titled cluster of related tools. The title sits above the buttons so a
// group is recognisable at a glance without widening the row.
export function ToolGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex shrink-0 flex-col gap-1">
      <span className="px-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">{title}</span>
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
    </div>
  )
}

export function Divider() {
  return <div className="hidden h-9 w-px shrink-0 self-end bg-[var(--bg-hover)] sm:block" />
}
