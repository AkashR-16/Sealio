// Server-side base URL for the Fastify API (used by server actions, server components, and the
// OTP proxy route). Set API_URL / INTERNAL_API_URL to point at the API host; falls back to the
// local dev API.
export const SERVER_API_URL =
  process.env.API_URL || process.env.INTERNAL_API_URL || "http://localhost:3001"
