import { create } from 'zustand'

export interface ToastEntry {
  id: string
  message: string
}

interface ToastState {
  toasts: ToastEntry[]
  pushToast: (message: string) => void
  dismissToast: (id: string) => void
}

const TOAST_DURATION_MS = 3000

// A tiny, separate store on purpose - toasts are transient UI ephemera
// unrelated to the model/viewer's own state, and every other feature in
// the app that wants to confirm an action (project restored, file saved,
// export finished) just needs to push a message without depending on the
// much larger useModelState store.
export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  pushToast: (message) => {
    const id = crypto.randomUUID()
    set((state) => ({ toasts: [...state.toasts, { id, message }] }))
    setTimeout(() => {
      if (get().toasts.some((t) => t.id === id)) get().dismissToast(id)
    }, TOAST_DURATION_MS)
  },
  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))
