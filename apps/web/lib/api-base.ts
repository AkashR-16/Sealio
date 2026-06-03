// Server-side base URL for the Fastify API (used by server actions, server components, and the
// OTP proxy route). Order of preference:
//   1. API_URL / INTERNAL_API_URL env var (set these to override, e.g. a different API host)
//   2. On Vercel, the production API — Vercel sets process.env.VERCEL, and a localhost fallback
//      there would be an unreachable private IP (DNS_HOSTNAME_RESOLVED_PRIVATE).
//   3. Locally, the dev API on localhost.
export const SERVER_API_URL =
  process.env.API_URL ||
  process.env.INTERNAL_API_URL ||
  (process.env.VERCEL ? "https://sealio-api.onrender.com" : "http://localhost:3001")
