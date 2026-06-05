"use client"

import { useState } from "react"
import { useFormStatus } from "react-dom"
import { Loader2 } from "lucide-react"
import { loginAsTesterAction } from "@/lib/auth-actions"
import { cn } from "@/lib/utils"

// Low-key QA entry: a small "Debug" switch in the top-right corner, off by default. Flipping it on
// opens a confirmation popup that runs the existing tester login — so the demo isn't advertised on
// the marketing hero. `open` drives both the switch state and the popup visibility.
export function DebugToggle() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={open}
        aria-label="Toggle QA debug access"
        onClick={() => setOpen((o) => !o)}
        className="absolute right-4 top-4 z-10 flex cursor-pointer items-center gap-2 rounded-full p-1 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground md:right-6 md:top-6"
      >
        <span>Debug</span>
        <span
          className={cn(
            "relative h-5 w-9 rounded-full transition-colors",
            open ? "bg-brand" : "bg-foreground-subtle",
          )}
        >
          <span
            className={cn(
              "absolute left-0.5 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-foreground shadow-sm transition-transform",
              open ? "translate-x-4" : "translate-x-0",
            )}
          />
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full rounded-t-2xl border border-border bg-surface p-6 shadow-2xl sm:max-w-sm sm:rounded-2xl"
          >
            <h2 className="text-lg font-semibold">Enter QA demo</h2>
            <p className="mt-1 text-sm text-foreground-muted">
              Sign in as a test user to explore the app and run the live UI test suites — no account
              needed.
            </p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-border px-4 text-sm font-medium text-foreground-muted transition-colors hover:bg-surface-elevated hover:text-foreground"
              >
                Cancel
              </button>
              <form action={loginAsTesterAction} className="contents">
                <QaSubmitButton />
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Submit button with a pending state — the server action calls the API to log in, which can take a
// few seconds (longer if the free-tier API is cold-starting), so show feedback instead of freezing.
function QaSubmitButton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-brand px-4 text-sm font-semibold text-background transition-colors hover:bg-brand-dim disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
    >
      {pending ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          Entering…
        </>
      ) : (
        "Enter QA demo →"
      )}
    </button>
  )
}
