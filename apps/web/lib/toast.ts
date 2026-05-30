type ToastType = "success" | "error" | "info"

interface ToastItem {
  id: string
  message: string
  type: ToastType
}

type Listener = (toast: ToastItem) => void

const listeners: Set<Listener> = new Set()

function emit(message: string, type: ToastType) {
  const item: ToastItem = { id: `${Date.now()}-${Math.random()}`, message, type }
  listeners.forEach((fn) => fn(item))
}

export const toast = {
  success: (message: string) => emit(message, "success"),
  error: (message: string) => emit(message, "error"),
  info: (message: string) => emit(message, "info"),
}

export function subscribeToast(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export type { ToastItem }
