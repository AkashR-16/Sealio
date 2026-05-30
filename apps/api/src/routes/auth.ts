import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { signupUser, loginUser, issueTokens } from "../services/auth.service.js"
import type { TokenPayload } from "../services/auth.service.js"

const signupSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  orgName: z.string().min(1).max(100),
})

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

function setTokenCookies(reply: Parameters<typeof loginUser>[0] extends never ? never : any, access: string, refresh: string) {
  reply
    .setCookie("access_token", access, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 15, // 15 min
    })
    .setCookie("refresh_token", refresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth/refresh",
      maxAge: 60 * 60 * 24 * 7, // 7 days
    })
}

export async function authRoutes(fastify: FastifyInstance) {
  // POST /auth/signup
  fastify.post("/auth/signup", async (request, reply) => {
    const result = signupSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: result.error.issues[0].message },
      })
    }

    try {
      const { user, org } = await signupUser(result.data)
      const { access, refresh } = issueTokens(fastify, {
        sub: user.id,
        orgId: org.id,
        role: user.role,
      })

      setTokenCookies(reply, access, refresh)

      return reply.status(201).send({
        data: {
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          org: { id: org.id, name: org.name, slug: org.slug, plan: org.plan },
        },
      })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({
        error: { code: "SIGNUP_FAILED", message: err.message },
      })
    }
  })

  // POST /auth/login
  fastify.post("/auth/login", async (request, reply) => {
    const result = loginSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: result.error.issues[0].message },
      })
    }

    try {
      const { user, org } = await loginUser(result.data)
      const { access, refresh } = issueTokens(fastify, {
        sub: user.id,
        orgId: org.id,
        role: user.role,
      })

      setTokenCookies(reply, access, refresh)

      return reply.send({
        data: {
          user: { id: user.id, name: user.name, email: user.email, role: user.role },
          org: { id: org.id, name: org.name, slug: org.slug, plan: org.plan },
        },
      })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({
        error: { code: "LOGIN_FAILED", message: err.message },
      })
    }
  })

  // POST /auth/refresh
  fastify.post("/auth/refresh", async (request, reply) => {
    const refreshToken = (request.cookies as any)?.refresh_token
    if (!refreshToken) {
      return reply.status(401).send({
        error: { code: "NO_REFRESH_TOKEN", message: "No refresh token" },
      })
    }

    try {
      const payload = fastify.jwt.verify<TokenPayload>(refreshToken)
      if (payload.type !== "refresh") throw new Error("Not a refresh token")

      const { access, refresh } = issueTokens(fastify, {
        sub: payload.sub,
        orgId: payload.orgId,
        role: payload.role,
      })

      setTokenCookies(reply, access, refresh)
      return reply.send({ data: { ok: true } })
    } catch {
      return reply.status(401).send({
        error: { code: "INVALID_REFRESH_TOKEN", message: "Invalid or expired refresh token" },
      })
    }
  })

  // POST /auth/logout
  fastify.post("/auth/logout", async (_request, reply) => {
    reply
      .clearCookie("access_token", { path: "/" })
      .clearCookie("refresh_token", { path: "/auth/refresh" })
    return reply.send({ data: { ok: true } })
  })

  // GET /auth/me
  fastify.get("/auth/me", { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const payload = request.user as TokenPayload
    const { prisma } = await import("@sealio/db")
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { org: true },
    })
    if (!user) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "User not found" } })

    return reply.send({
      data: {
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
        org: { id: user.org.id, name: user.org.name, slug: user.org.slug, plan: user.org.plan },
      },
    })
  })
}
