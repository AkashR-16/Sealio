import type { PhaseConfig, PhaseKey } from "./types"
import { smokeSteps } from "./test-steps/smoke"
import { unitSteps } from "./test-steps/unit"
import { integrationSteps } from "./test-steps/integration"
import { regressionSteps } from "./test-steps/regression"

export const PHASES: Record<PhaseKey, PhaseConfig> = {
  smoke: {
    key: "smoke",
    title: "Smoke Test",
    tag: "SMOKE SCREEN · LIVE API",
    accent: "text-amber-500",
    steps: smokeSteps,
  },
  unit: {
    key: "unit",
    title: "Unit Test",
    tag: "UNIT CHECKS · LIVE API",
    accent: "text-blue-400",
    steps: unitSteps,
  },
  integration: {
    key: "integration",
    title: "Integration Test",
    tag: "INTEGRATION FLOWS · LIVE API",
    accent: "text-purple-400",
    steps: integrationSteps,
  },
  regression: {
    key: "regression",
    title: "Regression Test",
    tag: "REGRESSION SUITE · LIVE API",
    accent: "text-emerald-400",
    steps: regressionSteps,
  },
}

export function isPhaseKey(value: string): value is PhaseKey {
  return value === "smoke" || value === "unit" || value === "integration" || value === "regression"
}
