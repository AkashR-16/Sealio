"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronDown, Menu } from "lucide-react"
import { logoutAction } from "@/lib/auth-actions"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import type { AuthUser, AuthOrg } from "@/lib/auth"

const baseNavLinks = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/documents", label: "Documents" },
  { href: "/templates", label: "Templates" },
]

const liveUiTestItems = [
  { href: "/live-ui-test/unit", label: "Unit Test" },
  { href: "/live-ui-test/smoke", label: "Smoke Test" },
  { href: "/live-ui-test/integration", label: "Integration Test" },
  { href: "/live-ui-test/regression", label: "Regression Test" },
]

export function AppNav({ user, org }: { user: AuthUser; org: AuthOrg }) {
  const pathname = usePathname()
  const isTester = user.role === "tester"

  return (
    <nav className="sticky top-0 z-40 h-16 border-b border-border bg-background/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto h-full px-6 flex items-center justify-between">
        {/* Logo + nav links */}
        <div className="flex items-center gap-3 md:gap-8">
          {/* Mobile hamburger — visible < md (desktop uses the inline links below) */}
          <div className="md:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  aria-label="Open navigation menu"
                  className="-ml-1 flex h-9 w-9 items-center justify-center rounded-md text-foreground-muted transition-colors hover:bg-surface hover:text-foreground"
                >
                  <Menu className="h-5 w-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-50">
                {baseNavLinks.map((link) => (
                  <DropdownMenuItem key={link.href} asChild>
                    <Link
                      href={link.href}
                      className={cn(
                        pathname.startsWith(link.href) && "bg-background text-foreground",
                      )}
                    >
                      {link.label}
                    </Link>
                  </DropdownMenuItem>
                ))}

                {isTester && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Live UI Test</DropdownMenuLabel>
                    {liveUiTestItems.map((item) => (
                      <DropdownMenuItem key={item.href} asChild>
                        <Link
                          href={item.href}
                          className={cn(
                            pathname.startsWith(item.href) && "bg-background text-foreground",
                          )}
                        >
                          {item.label}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-brand flex items-center justify-center">
              <span className="text-background font-bold text-sm">S</span>
            </div>
            <span className="font-semibold text-sm">Sealio</span>
          </Link>

          <div className="hidden md:flex items-center gap-1">
            {baseNavLinks.map((link) => (
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

            {isTester && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center gap-1 px-3 py-1.5 rounded-md text-sm transition-colors",
                      pathname.startsWith("/live-ui-test")
                        ? "bg-surface text-foreground"
                        : "text-foreground-muted hover:text-foreground hover:bg-surface",
                    )}
                  >
                    Live UI Test
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {liveUiTestItems.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link href={item.href}>{item.label}</Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
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
