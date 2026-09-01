import { CheckCircle2, X } from 'lucide-react'
import { useToastStore } from '../hooks/useToastStore'

// A small stack of transient confirmations at the bottom of the screen -
// "Projet restauré", "Fichier enregistré", etc. Auto-dismisses itself, but
// can also be dismissed early.
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts)
  const dismissToast = useToastStore((s) => s.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-2 rounded-lg border border-[var(--border-light)] bg-[var(--bg-panel)] px-3 py-2 text-sm text-slate-200 shadow-xl"
        >
          <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />
          <span>{toast.message}</span>
          <button onClick={() => dismissToast(toast.id)} className="shrink-0 text-slate-500 hover:text-slate-200">
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  )
}
