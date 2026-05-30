import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import { jwtPlugin } from "../plugins/jwt.js"
import { authRoutes } from "../routes/auth.js"
import { prisma } from "@sealio/db"

// Rachel: Real Postgres — no mocks
const TEST_EMAIL = `test-auth-${Date.now()}@sealio.test`
const TEST_PASSWORD = "testpassword123"
const TEST_ORG = `Test Org ${Date.now()}`

async function buildServer() {
  const app = Fastify({ logger: false })
  await app.register(cookie, { secret: "test-secret-32-chars-placeholder!" })
  await app.register(cors, { origin: true, credentials: true })
  await app.register(jwtPlugin)
  await app.register(authRoutes)
  return app
}

let app: Awaited<ReturnType<typeof buildServer>>

beforeAll(async () => {
  app = await buildServer()
  await app.ready()
})

afterAll(async () => {
  // Clean up test data
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } })
  await prisma.organization.deleteMany({ where: { name: TEST_ORG } })
  await app.close()
  await prisma.$disconnect()
})

describe("POST /auth/signup", () => {
  it("creates org + user and returns tokens", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        name: "Test User",
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        orgName: TEST_ORG,
      },
    })

    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.data.user.email).toBe(TEST_EMAIL)
    expect(body.data.user.role).toBe("owner")
    expect(body.data.org.name).toBe(TEST_ORG)

    // Cookies must be set
    const cookies = res.headers["set-cookie"] as string | string[]
    const cookieStr = Array.isArray(cookies) ? cookies.join(";") : cookies
    expect(cookieStr).toContain("access_token")
    expect(cookieStr).toContain("refresh_token")
    expect(cookieStr).toContain("HttpOnly")
  })

  it("rejects duplicate email with 409", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        name: "Test User 2",
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        orgName: "Another Org",
      },
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error.message).toContain("already in use")
  })

  it("rejects missing fields with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: { email: "nopassword@test.com" },
    })

    expect(res.statusCode).toBe(400)
  })

  it("rejects invalid email with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/signup",
      payload: {
        name: "Test",
        email: "not-an-email",
        password: TEST_PASSWORD,
        orgName: "Org",
      },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe("POST /auth/login", () => {
  it("returns tokens for valid credentials", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data.user.email).toBe(TEST_EMAIL)

    const cookies = res.headers["set-cookie"] as string | string[]
    const cookieStr = Array.isArray(cookies) ? cookies.join(";") : cookies
    expect(cookieStr).toContain("access_token")
  })

  it("rejects wrong password with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: TEST_EMAIL, password: "wrongpassword" },
    })

    expect(res.statusCode).toBe(401)
    expect(res.json().error.message).toContain("Invalid email or password")
  })

  it("rejects non-existent email with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "nobody@nowhere.com", password: TEST_PASSWORD },
    })

    expect(res.statusCode).toBe(401)
    // Must not leak whether email exists
    expect(res.json().error.message).toContain("Invalid email or password")
  })

  it("rejects missing password with 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: TEST_EMAIL },
    })

    expect(res.statusCode).toBe(400)
  })
})

describe("POST /auth/refresh", () => {
  it("issues new access token given valid refresh cookie", async () => {
    // Login to get refresh token
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    })

    const setCookies = loginRes.headers["set-cookie"] as string[]
    const refreshCookie = setCookies.find((c) => c.startsWith("refresh_token="))!
    const refreshToken = refreshCookie.split(";")[0].replace("refresh_token=", "")

    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refresh_token: refreshToken },
    })

    expect(res.statusCode).toBe(200)
    const cookies = res.headers["set-cookie"] as string[]
    expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true)
  })

  it("rejects request with no refresh token with 401", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/refresh" })
    expect(res.statusCode).toBe(401)
  })

  it("rejects invalid refresh token with 401", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/auth/refresh",
      cookies: { refresh_token: "invalid.jwt.token" },
    })

    expect(res.statusCode).toBe(401)
  })
})

describe("GET /auth/me", () => {
  it("returns user for valid access token", async () => {
    const loginRes = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: TEST_EMAIL, password: TEST_PASSWORD },
    })

    const setCookies = loginRes.headers["set-cookie"] as string[]
    const accessCookie = setCookies.find((c) => c.startsWith("access_token="))!
    const accessToken = accessCookie.split(";")[0].replace("access_token=", "")

    const res = await app.inject({
      method: "GET",
      url: "/auth/me",
      cookies: { access_token: accessToken },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.user.email).toBe(TEST_EMAIL)
  })

  it("rejects unauthenticated request with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me" })
    expect(res.statusCode).toBe(401)
  })
})
