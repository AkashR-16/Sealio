import Link from "next/link"
import { DebugToggle } from "./debug-toggle"

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center min-h-screen px-6">
      <DebugToggle />
      <div className="flex flex-col items-center gap-6 text-center max-w-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-xl bg-brand flex items-center justify-center">
            <span className="text-background font-bold text-lg">S</span>
          </div>
          <span className="text-2xl font-bold tracking-tight">Sealio</span>
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight">
          E-Signatures built for{" "}
          <span className="text-brand">modern teams.</span>
        </h1>

        <p className="text-lg text-foreground-muted max-w-md leading-relaxed">
          Send, sign, and seal documents in minutes. AI-native with real-time analytics
          and a developer-first API.
        </p>

        <div className="flex flex-wrap justify-center gap-4 mt-2">
          <Link
            href="/signup"
            className="inline-flex h-11 items-center px-6 rounded-md bg-brand text-background font-semibold text-sm hover:bg-brand-dim transition-colors shadow-[0_0_20px_rgba(110,231,183,0.3)]"
          >
            Get started free
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center px-6 rounded-md border border-border text-foreground font-medium text-sm hover:bg-surface transition-colors"
          >
            Sign in
          </Link>
        </div>

        <p className="text-xs text-foreground-subtle mt-4">
          5 documents/month free · No credit card required
        </p>
      </div>
    </main>
  )
}
