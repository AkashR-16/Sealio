"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { logoutAction } from "@/lib/auth-actions"
import { cn } from "@/lib/utils"
import type { AuthUser, AuthOrg } from "@/lib/auth"

const navLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/documents", label: "Documents" },
  { href: "/templates", label: "Templates" },
]

export function AppNav({ user, org }: { user: AuthUser; org: AuthOrg }) {
  const pathname = usePathname()

  return (
    <nav className="sticky top-0 z-40 h-16 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between">
        {/* Logo + nav links */}
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-brand flex items-center justify-center">
              <span className="text-background font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-sm">Sealio</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3 py-1.5 rounded-md text-sm transition-colors",
                  pathname.startsWith(link.href)
                    ? "bg-surface text-foreground"
                    : "text-foreground-muted hover:text-foreground hover:bg-surface",
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          <span className="hidden sm:block text-xs text-foreground-subtle">{org.name}</span>
          <div className="h-7 w-7 rounded-full bg-surface border border-border flex items-center justify-center">
            <span className="text-xs font-medium text-foreground-muted">
              {user.name.charAt(0).toUpperCase()}
            </span>
          </div>
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-xs text-foreground-subtle hover:text-foreground transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  )
}
