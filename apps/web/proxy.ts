import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// `/api` is excluded so this auth gate never intercepts API traffic. In the deployed,
// single-origin setup the browser hits same-origin `/api/*` (proxied to the Fastify API by
// next.config.ts), and the API enforces its own auth. Gating it here would 307-redirect
// unauthenticated-but-valid calls — e.g. /health, and a *signer's* OTP/signing requests, since
// signers have no access_token cookie — to /login. It also covers the /api/live-ui-test/otp route.
const PUBLIC_PATHS = ["/", "/login", "/signup", "/sign", "/cmaps", "/api", "/inbox"]

// Belt-and-suspenders: skip any path that looks like a static file
const STATIC_EXT = /\.(js|mjs|cjs|css|map|json|txt|xml|pdf|woff2?|ttf|otf)$/i

function isPublic(pathname: string): boolean {
  if (STATIC_EXT.test(pathname)) return true
  return PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  )
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasToken = request.cookies.has("access_token")

  // Redirect logged-in users away from auth pages
  if (hasToken && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", request.url))
  }

  // Redirect unauthenticated users to login for protected paths
  if (!hasToken && !isPublic(pathname)) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("from", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.png|.*\\.svg|.*\\.jpg|.*\\.mjs|.*\\.js|.*\\.css|cmaps).*)",
  ],
}
