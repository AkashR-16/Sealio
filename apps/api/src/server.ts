import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import helmet from "@fastify/helmet"
import rateLimit from "@fastify/rate-limit"
import { jwtPlugin } from "./plugins/jwt.js"
import { authRoutes } from "./routes/auth.js"
import { documentRoutes } from "./routes/documents.js"
import { fieldRoutes } from "./routes/fields.js"
import { sendRoutes } from "./routes/send.js"
import { signingRoutes } from "./routes/signing.js"
import { devMailRoutes } from "./routes/dev-mail.js"
import { env } from "./lib/env.js"

const server = Fastify({
  logger: {
    transport:
      env.NODE_ENV === "development"
        ? { target: "pino-pretty", options: { colorize: true } }
        : undefined,
  },
})

async function bootstrap() {
  await server.register(helmet, { contentSecurityPolicy: false })
  await server.register(cors, {
    origin: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    credentials: true,
  })
  await server.register(cookie, { secret: env.SESSION_SECRET })
  // Requests reach the API proxied from the web service's single IP, so every user shares one
  // rate-limit bucket — the old 100/min production cap throttled the Live UI Test suites.
  // Configurable via RATE_LIMIT_MAX; the high default keeps the limiter active without breaking runs.
  await server.register(rateLimit, {
    max: Number(process.env.RATE_LIMIT_MAX ?? 2000),
    timeWindow: "1 minute",
  })

  // JWT — must come before routes that use authenticate
  await server.register(jwtPlugin)

  // Routes
  await server.register(authRoutes)
  await server.register(documentRoutes)
  await server.register(fieldRoutes)
  await server.register(sendRoutes)
  await server.register(signingRoutes)
  await server.register(devMailRoutes)

  server.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }))

  await server.listen({ port: env.PORT, host: "0.0.0.0" })
  console.log(`API running at http://localhost:${env.PORT}`)
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})
