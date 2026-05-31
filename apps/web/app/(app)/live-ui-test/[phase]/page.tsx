import { redirect } from "next/navigation"
import { requireSession } from "@/lib/auth"
import { LiveTestPanel } from "@/features/live-ui-test/live-test-panel"
import { isPhaseKey } from "@/features/live-ui-test/phase-config"

interface Props {
  params: Promise<{ phase: string }>
}

export const metadata = { title: "Live UI Test — Sealio" }

export default async function LiveUiTestPage({ params }: Props) {
  const { user } = await requireSession()

  // Tester-only feature
  if (user.role !== "tester") redirect("/dashboard")

  const { phase } = await params
  if (!isPhaseKey(phase)) redirect("/dashboard")

  return <LiveTestPanel phase={phase} userEmail={user.email} />
}
