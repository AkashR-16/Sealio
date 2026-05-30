import Link from "next/link"
import { SignupForm } from "./signup-form"

export const metadata = { title: "Create account — Sealio" }

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-brand flex items-center justify-center">
            <span className="text-background font-bold text-lg">S</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
          <p className="text-sm text-foreground-muted">
            5 documents/month free · No credit card
          </p>
        </div>

        <SignupForm />

        <p className="text-center text-sm text-foreground-muted">
          Already have an account?{" "}
          <Link href="/login" className="text-brand hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
