export type StepStatus = "pending" | "running" | "passed" | "failed"

export interface RunContext {
  /** The logged-in tester's email — fields are assigned and documents sent to this address. */
  userEmail: string
  /** Carried between steps within a single run. */
  docId?: string
  fieldId?: string
  fieldIds?: string[]
  signingToken?: string
  secondDocId?: string
}

export interface TestStep {
  id: string
  label: string
  /** Executes the live API check. Throw to mark the step failed. */
  run: (ctx: RunContext) => Promise<void>
}

export type PhaseKey = "unit" | "smoke" | "integration" | "regression"

export interface PhaseConfig {
  key: PhaseKey
  title: string
  /** Short tag shown in the left-panel header, e.g. "SMOKE SCREEN · EYES-ON". */
  tag: string
  /** Tailwind text-color class for the accent dot + header. */
  accent: string
  steps: TestStep[]
}
