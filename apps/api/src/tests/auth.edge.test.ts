import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import multipart from "@fastify/multipart"
import { jwtPlugin } from "../plugins/jwt.js"
import { authRoutes } from "../routes/auth.js"
import { documentRoutes } from "../routes/documents.js"
import { fieldRoutes } from "../routes/fields.js"
import { prisma } from "@sealio/db"

const TEST_EMAIL = `edge-auth-${Date.now()}@sealio.test`
const TEST_PASSWORD = "testpassword123"

async function buildServer() {
  const app = Fastify({ logger: false })
  await app.register(cookie, { secret: "test-secret-32-chars-placeholder!" })
  await app.register(cors, { origin: true, credentials: true })
  await app.register(jwtPlugin)
  await app.register(authRoutes)
  await app.register(documentRoutes)
  await app.register(fieldRoutes)
  return app
}

let app: Awaited<ReturnType<typeof buildServer>>
let accessToken: string
let refreshToken: string

beforeAll(async () => {
  app = await buildServer()
  await app.ready()

  // Sign up to get fresh tokens
  const res = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { name: "Edge Auth User", email: TEST_EMAIL, password: TEST_PASSWORD, orgName: `Edge Auth Org ${Date.now()}` },
  })
  expect(res.statusCode).toBe(201)

  const cookies = res.headers["set-cookie"] as string[]
  accessToken = cookies.find((c) => c.startsWith("access_token="))!.split(";")[0].replace("access_token=", "")
  refreshToken = cookies.find((c) => c.startsWith("refresh_token="))!.split(";")[0].replace("refresh_token=", "")
})

afterAll(async () => {
  await prisma.document.deleteMany({ where: { creator: { email: TEST_EMAIL } } })
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } })
  await prisma.organization.deleteMany({ where: { users: { none: {} } } })
  await app.close()
  await prisma.$disconnect()
})

// ─── Token role boundaries ─────────────────────────────────────────────────────

describe("Token misuse: refresh token cannot be used as access token", () => {
  it("refresh token in access_token cookie is rejected on protected route", async () => {
    // Substitute the refresh token where an access token is expected
    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { access_token: refreshToken },
    })
    // Must be rejected — refresh token is signed with a different claim (type: refresh)
    expect(res.statusCode).toBe(401)
  })

  it("access token in refresh_token cookie is rejected on /auth/refresh", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refresh_token: accessToken },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Token tampering ───────────────────────────────────────────────────────────

describe("Token tampering", () => {
  it("corrupted access token (flipped mid-signature char) is rejected", async () => {
    // Corrupt a character in the middle of the signature (NOT the last character —
    // base64url groups of <4 chars have don't-care trailing bits so last-char flips
    // can leave decoded bytes unchanged and the signature still valid).
    const parts = accessToken.split(".")
    const sig = parts[2]
    const midIdx = Math.floor(sig.length / 2)
    const flipped = sig[midIdx] === "A" ? "B" : "A"
    const tamperedSig = sig.slice(0, midIdx) + flipped + sig.slice(midIdx + 1)
    const tampered = parts[0] + "." + parts[1] + "." + tamperedSig

    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { access_token: tampered },
    })
    expect(res.statusCode).toBe(401)
  })

  it("completely fabricated JWT is rejected", async () => {
    const fake =
      "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9" +
      ".eyJzdWIiOiJmYWtlIiwib3JnSWQiOiJmYWtlIiwicm9sZSI6Im93bmVyIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTYwMDAwMDAwMCwiZXhwIjo5OTk5OTk5OTk5fQ" +
      ".invalidsignature"

    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { access_token: fake },
    })
    expect(res.statusCode).toBe(401)
  })

  it("base64-encoded random bytes is rejected", async () => {
    const random = Buffer.from(crypto.getRandomValues(new Uint8Array(64))).toString("base64url")

    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { access_token: random },
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Refresh token rotation ────────────────────────────────────────────────────

describe("Refresh token rotation", () => {
  it("fresh refresh issues a new access token", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refresh_token: refreshToken },
    })
    expect(res.statusCode).toBe(200)

    const cookies = res.headers["set-cookie"] as string[]
    const newAccess = cookies.find((c) => c.startsWith("access_token="))
    expect(newAccess).toBeTruthy()
  })
})

// ─── Signup constraints ────────────────────────────────────────────────────────

describe("Signup edge cases", () => {
  it("rejects password shorter than 8 characters with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { name: "Short", email: `short-${Date.now()}@sealio.test`, password: "abc", orgName: "Short Org" },
    })
    expect(res.statusCode).toBe(400)
  })

  it("rejects empty name with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { name: "", email: `noname-${Date.now()}@sealio.test`, password: TEST_PASSWORD, orgName: "Org" },
    })
    expect(res.statusCode).toBe(400)
  })

  it("rejects empty orgName with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { name: "User", email: `norg-${Date.now()}@sealio.test`, password: TEST_PASSWORD, orgName: "" },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ─── Protected routes require auth ────────────────────────────────────────────

describe("All protected routes reject missing token", () => {
  const protectedRoutes = [
    { method: "GET" as const,  url: "/documents" },
    { method: "POST" as const, url: "/documents" },
    { method: "GET" as const,  url: "/documents/any-id" },
    { method: "GET" as const,  url: "/documents/any-id/file" },
    { method: "PUT" as const,  url: "/documents/any-id/fields" },
    { method: "GET" as const,  url: "/documents/any-id/fields" },
    { method: "POST" as const, url: "/documents/any-id/detect-fields" },
    { method: "GET" as const,  url: "/auth/me" },
  ]

  for (const route of protectedRoutes) {
    it(`${route.method} ${route.url} → 401 without token`, async () => {
      const res = await app.inject({ method: route.method, url: route.url })
      expect(res.statusCode).toBe(401)
    })
  }
})
