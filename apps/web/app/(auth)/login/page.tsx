import Link from "next/link"
import { LoginForm } from "./login-form"

export const metadata = { title: "Sign in — Sealio" }

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-8">
        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-brand flex items-center justify-center">
            <span className="text-background font-bold text-lg">S</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back</h1>
          <p className="text-sm text-foreground-muted">Sign in to your Sealio account</p>
        </div>

        <LoginForm />

        <p className="text-center text-sm text-foreground-muted">
          No account?{" "}
          <Link href="/signup" className="text-brand hover:underline font-medium">
            Sign up free
          </Link>
        </p>
      </div>
    </div>
  )
}
