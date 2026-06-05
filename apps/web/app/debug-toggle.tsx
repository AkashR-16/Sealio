"use client"

import { useState } from "react"
import { loginAsTesterAction } from "@/lib/auth-actions"
import { cn } from "@/lib/utils"

// Low-key QA entry: off by default, tucked in the top-right corner. Flipping "Debug" reveals an
// "Enter QA demo →" link that runs the existing tester login — so the demo isn't advertised to
// every visitor on the marketing hero.
export function DebugToggle() {
  const [debug, setDebug] = useState(false)

  return (
    <div className="absolute right-4 top-4 z-10 flex items-center gap-3 text-xs text-foreground-subtle md:right-6 md:top-6">
      {debug && (
        <form action={loginAsTesterAction}>
          <button type="submit" className="text-brand hover:underline">
            Enter QA demo →
          </button>
        </form>
      )}

      <label className="flex cursor-pointer select-none items-center gap-2">
        <span>Debug</span>
        <button
          type="button"
          role="switch"
          aria-checked={debug}
          aria-label="Toggle debug mode"
          onClick={() => setDebug((v) => !v)}
          className={cn(
            "relative h-5 w-9 shrink-0 rounded-full transition-colors",
            debug ? "bg-brand" : "bg-border",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-4 w-4 rounded-full bg-background transition-transform",
              debug ? "translate-x-4" : "translate-x-0.5",
            )}
          />
        </button>
      </label>
    </div>
  )
}
