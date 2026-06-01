function require(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const env = {
  DATABASE_URL: require("DATABASE_URL"),
  REDIS_URL: optional("REDIS_URL", "redis://localhost:6380"),
  SESSION_SECRET: optional("SESSION_SECRET", "dev-secret-32-chars-placeholder!"),
  JWT_PRIVATE_KEY: require("JWT_PRIVATE_KEY"),
  JWT_PUBLIC_KEY: require("JWT_PUBLIC_KEY"),
  // 2h (was 15m) so a long Live UI Test session on the slow free tier doesn't expire the
  // tester's access token mid-suite. Override via JWT_ACCESS_EXPIRY for tighter production use.
  JWT_ACCESS_EXPIRY: optional("JWT_ACCESS_EXPIRY", "2h"),
  JWT_REFRESH_EXPIRY: optional("JWT_REFRESH_EXPIRY", "7d"),
  SMTP_HOST: optional("SMTP_HOST", "localhost"),
  SMTP_PORT: Number(optional("SMTP_PORT", "1025")),
  SMTP_FROM: optional("SMTP_FROM", "noreply@sealio.local"),
  SMTP_SECURE: optional("SMTP_SECURE", "false"),
  APP_URL: optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  NODE_ENV: optional("NODE_ENV", "development"),
  PORT: Number(optional("PORT", "3001")),
}
