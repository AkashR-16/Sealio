"use client"

import { useActionState } from "react"
import { signupAction } from "@/lib/auth-actions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"

export function SignupForm() {
  const [state, action, pending] = useActionState(signupAction, null)

  return (
    <form action={action} className="space-y-5">
      {state?.error && (
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">
          {state.error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          placeholder="Jane Smith"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="orgName">Company name</Label>
        <Input
          id="orgName"
          name="orgName"
          type="text"
          autoComplete="organization"
          placeholder="Acme Inc."
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Min. 8 characters"
          required
          minLength={8}
        />
      </div>

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-xs text-foreground-subtle">
        By signing up you agree to our Terms of Service and Privacy Policy.
      </p>
    </form>
  )
}
