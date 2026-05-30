"use client"

import { useEffect, useState } from "react"
import { X, CheckCircle, AlertCircle, Info } from "lucide-react"
import { subscribeToast } from "@/lib/toast"
import type { ToastItem } from "@/lib/toast"
import { cn } from "@/lib/utils"

const ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  info: Info,
}

const COLORS = {
  success: "text-success border-success/30 bg-success/10",
  error: "text-error border-error/30 bg-error/10",
  info: "text-info border-info/30 bg-info/10",
}

export function Toaster() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const unsub = subscribeToast((t) => {
      setToasts((prev) => [...prev, t])
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id))
      }, 3500)
    })
    return unsub
  }, [])

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => {
        const Icon = ICONS[t.type]
        return (
          <div
            key={t.id}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium shadow-xl pointer-events-auto animate-in slide-in-from-bottom-2 duration-200",
              COLORS[t.type],
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span>{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
