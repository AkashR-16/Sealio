import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@sealio/db"
import { buildServer, loginAndGetCookies, extractCookies, cookieHeader } from "../helpers/setup.js"

const TS = Date.now()
const EMAIL = `qa-auth-unit-${TS}@sealio.test`
const PASSWORD = "securepass99"
const ORG = `QA Auth Unit ${TS}`

let app: Awaited<ReturnType<typeof buildServer>>

beforeAll(async () => { app = await buildServer() })

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } })
  await prisma.organization.deleteMany({ where: { name: ORG } })
  await app.close()
  await prisma.$disconnect()
})

// ─── Registration ─────────────────────────────────────────────────────────────

describe("User Registration", () => {
  it("New user registration succeeds and the account is assigned the owner role - Positive", async () => {
    const res = await app.inject({
      method: "POST", url: "/auth/signup",
      payload: { name: "QA User", email: EMAIL, password: PASSWORD, orgName: ORG },
    })
    expect(res.statusCode).toBe(201)
    const { data } = res.json()
    expect(data.user.email).toBe(EMAIL)
    expect(data.user.role).toBe("owner")
  })

  it("Successful registration issues a secure session cookie to the browser - Positive", async () => {
    const cookieEmail = `cookie-${TS}@sealio.test`
    const cookieOrg = `Cookie Org ${TS}`
    const res = await app.inject({
      method: "POST", url: "/auth/signup",
      payload: { name: "Cookie User", email: cookieEmail, password: PASSWORD, orgName: cookieOrg },
    })
    expect(res.statusCode).toBe(201)
    const raw = res.headers["set-cookie"] as string | string[]
    const joined = Array.isArray(raw) ? raw.join("; ") : (raw ?? "")
    expect(joined).toContain("access_token")
    expect(joined).toContain("HttpOnly")
    await prisma.user.deleteMany({ where: { email: cookieEmail } })
    await prisma.organization.deleteMany({ where: { name: cookieOrg } })
  })

  it("Successful registration issues a secure long-lived session refresh cookie - Positive", async () => {
    const refreshEmail = `refresh-${TS}@sealio.test`
    const refreshOrg = `Refresh Org ${TS}`
    const res = await app.inject({
      method: "POST", url: "/auth/signup",
      payload: { name: "Refresh User", email: refreshEmail, password: PASSWORD, orgName: refreshOrg },
    })
    expect(res.statusCode).toBe(201)
    const raw = res.headers["set-cookie"] as string | string[]
    const joined = Array.isArray(raw) ? raw.join("; ") : (raw ?? "")
    expect(joined).toContain("refresh_token")
    expect(joined).toContain("HttpOnly")
    await prisma.user.deleteMany({ where: { email: refreshEmail } })
    await prisma.organization.deleteMany({ where: { name: refreshOrg } })
  })

  it("Registering a user automatically creates their organisation - Positive", async () => {
    const orgEmail = `org-${TS}@sealio.test`
    const orgName = `Auto Org ${TS}`
    const res = await app.inject({
      method: "POST", url: "/auth/signup",
      payload: { name: "Org User", email: orgEmail, password: PASSWORD, orgName },
    })
    expect(res.statusCode).toBe(201)
    const { data } = res.json()
    expect(data.org.name).toBe(orgName)
    expect(data.org.slug).toBeTruthy()
    await prisma.user.deleteMany({ where: { email: orgEmail } })
    await prisma.organization.deleteMany({ where: { name: orgName } })
  })

  it("Registration is blocked when the password is fewer than 8 characters - Negative", async () => {
    const res = await app.inject({
      method: "POST", url: "/auth/signup",
      payload: { name: "Short Pass", email: `short-${TS}@sealio.test`, password: "abc123", orgName: `Short ${TS}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it("Registration is blocked when the email address format is invalid - Negative", async () => {
    const res = await app.inject({
      method: "POST", url: "/auth/signup",
      payload: { name: "Bad Email", email: "not-an-email", password: PASSWORD, orgName: `Bad ${TS}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it("Registration is blocked when the user's full name is missing - Negative", async () => {
    const res = await app.inject({
      method: "POST", url: "/auth/signup",
      payload: { email: `noname-${TS}@sealio.test`, password: PASSWORD, orgName: `NoName ${TS}` },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ─── Login ────────────────────────────────────────────────────────────────────

describe("User Login", () => {
  beforeAll(async () => {
    await app.inject({
      method: "POST", url: "/auth/signup",
      payload: { name: "QA User", email: EMAIL, password: PASSWORD, orgName: ORG },
    })
  })

  it("A user can log in with the correct email and password - Positive", async () => {
    const res = await app.inject({
      method: "POST", url: "/auth/login",
      payload: { email: EMAIL, password: PASSWORD },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.user.email).toBe(EMAIL)
  })

  it("Login is blocked when an incorrect password is entered - Negative", async () => {
    const res = await app.inject({
      method: "POST", url: "/auth/login",
      payload: { email: EMAIL, password: "wrongpassword!" },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.message).toContain("Invalid email or password")
  })

  it("Login is blocked when the email address does not exist — error message does not reveal whether the email is registered - Negative", async () => {
    const res = await app.inject({
      method: "POST", url: "/auth/login",
      payload: { email: "ghost@nowhere.test", password: PASSWORD },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.message).toContain("Invalid email or password")
  })
})

// ─── Session ──────────────────────────────────────────────────────────────────

describe("Session — View Account Details", () => {
  it("A logged-in user can view their own account and organisation details - Positive", async () => {
    const cookies = await loginAndGetCookies(app, EMAIL, PASSWORD)
    const res = await app.inject({
      method: "GET", url: "/auth/me",
      headers: { cookie: cookieHeader(cookies) },
    })
    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data.user.email).toBe(EMAIL)
    expect(data.org.name).toBe(ORG)
  })

  it("Viewing account details without being logged in is blocked - Negative", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me" })
    expect(res.statusCode).toBe(401)
  })
})
