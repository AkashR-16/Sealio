"use client"

import { useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, CheckCircle2, XCircle, Circle, Play, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { PHASES } from "./phase-config"
import type { PhaseKey, RunContext, StepStatus } from "./types"

interface StepState {
  status: StepStatus
  error?: string
}

export function LiveTestPanel({ phase, userEmail }: { phase: PhaseKey; userEmail: string }) {
  const router = useRouter()
  const config = PHASES[phase]
  const steps = config.steps

  const [states, setStates] = useState<StepState[]>(() => steps.map(() => ({ status: "pending" as StepStatus })))
  const [running, setRunning] = useState(false)
  const [finished, setFinished] = useState(false)
  const itemRefs = useRef<Array<HTMLLIElement | null>>([])

  const { passed, failed, done } = useMemo(() => {
    const passed = states.filter((s) => s.status === "passed").length
    const failed = states.filter((s) => s.status === "failed").length
    return { passed, failed, done: passed + failed }
  }, [states])

  function setStatus(index: number, status: StepStatus, error?: string) {
    setStates((prev) => {
      const next = [...prev]
      next[index] = { status, error }
      return next
    })
  }

  async function runAll() {
    setRunning(true)
    setFinished(false)
    setStates(steps.map(() => ({ status: "pending" as StepStatus })))
    const ctx: RunContext = { userEmail }
    for (let i = 0; i < steps.length; i++) {
      setStatus(i, "running")
      itemRefs.current[i]?.scrollIntoView({ block: "nearest", behavior: "smooth" })
      try {
        await steps[i].run(ctx)
        setStatus(i, "passed")
      } catch (e) {
        setStatus(i, "failed", e instanceof Error ? e.message : String(e))
      }
    }
    setRunning(false)
    setFinished(true)
  }

  function copySummary() {
    const lines = steps.map((s, i) => `${states[i].status === "passed" ? "PASS" : states[i].status === "failed" ? "FAIL" : "—"}  ${s.label}${states[i].error ? `  → ${states[i].error}` : ""}`)
    const header = `${config.title} — ${passed}/${steps.length} passed`
    navigator.clipboard?.writeText([header, "", ...lines].join("\n"))
  }

  const allPassed = finished && failed === 0
  const progressPct = steps.length ? Math.round((done / steps.length) * 100) : 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-start justify-between border-b border-border px-6 py-4">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Live UI Test — {config.title}</h1>
          <p className="text-sm text-foreground-muted mt-0.5">
            API checks run live against the real server. {steps.length} steps in this suite.
          </p>
        </div>
        <Button
          variant={finished ? "default" : "outline"}
          size="sm"
          onClick={() => router.push("/dashboard")}
        >
          {finished ? "Done & Close" : "Close"}
        </Button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left panel — step list */}
        <aside className="w-80 shrink-0 border-r border-border bg-surface flex flex-col">
          <div className="px-4 py-3 border-b border-border bg-background/40">
            <span className={cn("flex items-center gap-2 text-xs font-semibold tracking-wide", config.accent)}>
              <span className="inline-block h-2 w-2 rounded-full bg-current" />
              {config.tag} · {steps.length} TESTS
            </span>
          </div>

          <ul className="flex-1 overflow-y-auto py-2">
            {steps.map((step, i) => {
              const st = states[i].status
              return (
                <li
                  key={step.id}
                  ref={(el) => { itemRefs.current[i] = el }}
                  className="flex items-start gap-2.5 px-4 py-1.5 text-sm"
                >
                  <StatusIcon status={st} />
                  <span
                    className={cn(
                      "leading-snug",
                      st === "pending" && "text-foreground-subtle",
                      st === "running" && "text-foreground",
                      st === "passed" && "text-foreground-muted",
                      st === "failed" && "text-foreground",
                    )}
                    title={states[i].error}
                  >
                    {step.label}
                  </span>
                </li>
              )
            })}
          </ul>

          {/* Footer progress */}
          <div className="border-t border-border px-4 py-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-foreground-muted">{done}/{steps.length}</span>
              <span className="flex items-center gap-3">
                <span className="text-brand">{passed} ok</span>
                {failed > 0 && <span className="text-red-500">{failed} fail</span>}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all duration-300", failed > 0 ? "bg-amber-500" : "bg-brand")}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {finished && (
              <button onClick={copySummary} className="w-full text-xs text-foreground-subtle hover:text-foreground border border-border rounded-md py-1.5 transition-colors">
                Copy summary to clipboard
              </button>
            )}
          </div>
        </aside>

        {/* Right panel — run state */}
        <main className="flex-1 flex items-center justify-center p-8">
          {!running && !finished && (
            <div className="text-center max-w-md">
              <div className={cn("mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border-2 border-current", config.accent)}>
                <Play className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-semibold">Ready to run</h2>
              <p className="text-sm text-foreground-muted mt-2">
                Executes all {steps.length} {config.title.toLowerCase()} checks live against the API,
                marking each step as it completes.
              </p>
              <Button className="mt-6" onClick={runAll}>
                Start Live UI Test
              </Button>
            </div>
          )}

          {running && (
            <div className="text-center">
              <Loader2 className="mx-auto h-10 w-10 animate-spin text-brand" />
              <p className="mt-4 text-sm text-foreground-muted">
                Running step {done + 1} of {steps.length}…
              </p>
            </div>
          )}

          {finished && (
            <div className="text-center max-w-md">
              <div className="text-5xl mb-4">{allPassed ? "👍" : "⚠️"}</div>
              <h2 className={cn("text-2xl font-bold", allPassed ? "text-brand" : "text-amber-500")}>
                {allPassed ? "All checks passed" : `${failed} of ${steps.length} failed`}
              </h2>
              <p className="text-sm text-foreground-muted mt-2">
                {passed}/{steps.length} steps marked OK
                {failed > 0 && " — hover a failed step in the list to see why."}
              </p>
              <Button variant="outline" className="mt-6" onClick={runAll}>
                Run again
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === "running") return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-brand" />
  if (status === "passed") return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
  if (status === "failed") return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
  return <Circle className="mt-0.5 h-4 w-4 shrink-0 text-foreground-subtle" />
}
