import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@sealio/types"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  // Single-origin proxy for deployment: the browser only ever talks to the web origin,
  // and `/api/*` is forwarded server-side to the Fastify API. This keeps auth cookies
  // first-party (no cross-site SameSite breakage) and means only ONE public URL needs
  // to be shared with a tester.
  //
  // Returning an array makes these `afterFiles` rewrites, so they apply only when no
  // filesystem route matched first — the existing `/api/live-ui-test/otp` route handler
  // still takes precedence. INTERNAL_API_URL/API_URL point at the API host and fall back to
  // localhost:3001 locally, so `pnpm dev` is unchanged. (When NEXT_PUBLIC_API_URL is "/api",
  // the browser hits same-origin `/api/*` and this rewrite forwards it.)
  async rewrites() {
    // Where the browser's same-origin /api/* calls are proxied. Prefer the env var; locally
    // fall back to the dev API.
    const apiTarget =
      process.env.INTERNAL_API_URL || process.env.API_URL || "http://localhost:3001"
    console.log(
      `[next.config] rewrites apiTarget=${apiTarget} INTERNAL_API_URL=${process.env.INTERNAL_API_URL ?? "<unset>"} API_URL=${process.env.API_URL ?? "<unset>"} NEXT_PUBLIC_API_URL=${process.env.NEXT_PUBLIC_API_URL ?? "<unset>"}`,
    )
    return [{ source: "/api/:path*", destination: `${apiTarget}/:path*` }]
  },
  // Turbopack (default in Next 16) — canvas is an optional Node-only dep of pdfjs-dist, not needed in browser
  turbopack: {
    resolveAlias: {
      canvas: "./empty-module.js",
    },
  },
  // Webpack fallback (when --webpack flag is passed)
  webpack: (config) => {
    config.resolve.alias.canvas = false
    return config
  },
}

export default nextConfig
