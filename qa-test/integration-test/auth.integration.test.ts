import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@sealio/db"
import { buildServer, loginAndGetCookies, extractCookies, cookieHeader } from "../helpers/setup.js"

const TS = Date.now()
const EMAIL = `qa-auth-int-${TS}@sealio.test`
const PASSWORD = "securepass99"
const ORG = `QA Auth Int ${TS}`

let app: Awaited<ReturnType<typeof buildServer>>

beforeAll(async () => { app = await buildServer() })

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { contains: `qa-auth-int-${TS}` } } })
  await prisma.organization.deleteMany({ where: { name: { contains: `QA Auth Int ${TS}` } } })
  await app.close()
  await prisma.$disconnect()
})

async function signup(email: string, org: string) {
  return app.inject({
    method: "POST", url: "/auth/signup",
    payload: { name: "QA User", email, password: PASSWORD, orgName: org },
  })
}

describe("Full Authentication Lifecycle", () => {
  it("A user can register, log in, view their profile, refresh their session, and log out — all in sequence - Positive", async () => {
    const email = `seq-${TS}@sealio.test`
    const orgName = `Seq Org ${TS}`

    const signupRes = await signup(email, orgName)
    expect(signupRes.statusCode).toBe(201)

    const loginCookies = await loginAndGetCookies(app, email, PASSWORD)
    expect(loginCookies["access_token"]).toBeTruthy()

    const meRes = await app.inject({
      method: "GET", url: "/auth/me",
      headers: { cookie: cookieHeader(loginCookies) },
    })
    expect(meRes.statusCode).toBe(200)
    expect(meRes.json().data.user.email).toBe(email)

    const refreshRes = await app.inject({
      method: "POST", url: "/auth/refresh",
      cookies: { refresh_token: loginCookies["refresh_token"] },
    })
    expect(refreshRes.statusCode).toBe(200)
    const newCookies = extractCookies(refreshRes)
    expect(newCookies["access_token"]).toBeTruthy()

    const logoutRes = await app.inject({
      method: "POST", url: "/auth/logout",
      headers: { cookie: cookieHeader(newCookies) },
    })
    expect(logoutRes.statusCode).toBe(200)

    await prisma.user.deleteMany({ where: { email } })
    await prisma.organization.deleteMany({ where: { name: orgName } })
  })

  it("After the session is refreshed, the user can still access their profile without logging in again - Positive", async () => {
    await signup(EMAIL, ORG)
    const loginCookies = await loginAndGetCookies(app, EMAIL, PASSWORD)
    const refreshRes = await app.inject({
      method: "POST", url: "/auth/refresh",
      cookies: { refresh_token: loginCookies["refresh_token"] },
    })
    const freshCookies = extractCookies(refreshRes)

    const meRes = await app.inject({
      method: "GET", url: "/auth/me",
      headers: { cookie: cookieHeader(freshCookies) },
    })
    expect(meRes.statusCode).toBe(200)
    expect(meRes.json().data.user.email).toBe(EMAIL)
  })

  it("After logging out, the session cookies are removed from the browser - Positive", async () => {
    const cookies = await loginAndGetCookies(app, EMAIL, PASSWORD)
    const logoutRes = await app.inject({
      method: "POST", url: "/auth/logout",
      headers: { cookie: cookieHeader(cookies) },
    })
    expect(logoutRes.statusCode).toBe(200)
    const cleared = logoutRes.headers["set-cookie"] as string[]
    const joined = Array.isArray(cleared) ? cleared.join(";") : cleared ?? ""
    // Cookies cleared — either Max-Age=0 or Expires in past
    expect(joined.toLowerCase()).toMatch(/max-age=0|expires=thu, 01 jan 1970/)
  })

  it("The organisation's web address is automatically formatted in lowercase with hyphens when created - Positive", async () => {
    const email = `slug-${TS}@sealio.test`
    const orgName = `My Great Organisation ${TS}`
    const res = await signup(email, orgName)
    const slug = res.json().data.org.slug as string
    expect(slug).toMatch(/^[a-z0-9-]+$/)
    await prisma.user.deleteMany({ where: { email } })
    await prisma.organization.deleteMany({ where: { name: orgName } })
  })

  it("Two independent users from separate organisations can both register without conflict - Positive", async () => {
    const e1 = `user1-${TS}@sealio.test`, o1 = `Org One ${TS}`
    const e2 = `user2-${TS}@sealio.test`, o2 = `Org Two ${TS}`
    const [r1, r2] = await Promise.all([signup(e1, o1), signup(e2, o2)])
    expect(r1.statusCode).toBe(201)
    expect(r2.statusCode).toBe(201)
    await prisma.user.deleteMany({ where: { email: { in: [e1, e2] } } })
    await prisma.organization.deleteMany({ where: { name: { in: [o1, o2] } } })
  })

  it("A user can log back in successfully after having previously logged out - Positive", async () => {
    const cookies = await loginAndGetCookies(app, EMAIL, PASSWORD)
    await app.inject({ method: "POST", url: "/auth/logout", headers: { cookie: cookieHeader(cookies) } })
    const reloginCookies = await loginAndGetCookies(app, EMAIL, PASSWORD)
    const meRes = await app.inject({
      method: "GET", url: "/auth/me",
      headers: { cookie: cookieHeader(reloginCookies) },
    })
    expect(meRes.statusCode).toBe(200)
  })
})

describe("Authentication — Blocked Flows", () => {
  it("Attempting to register with an email address that is already in use is blocked with a clear message - Negative", async () => {
    const res = await signup(EMAIL, `Duplicate Org ${TS}`)
    expect(res.statusCode).toBe(409)
    expect(res.json().error.message.toLowerCase()).toContain("already")
  })

  it("Refreshing a session without presenting a valid refresh token is blocked - Negative", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/refresh" })
    expect(res.statusCode).toBe(401)
  })

  it("A security token that has been tampered with is rejected when accessing the profile - Negative", async () => {
    const cookies = await loginAndGetCookies(app, EMAIL, PASSWORD)
    const tampered = cookies["access_token"].slice(0, -5) + "XXXXX"
    const res = await app.inject({
      method: "GET", url: "/auth/me",
      headers: { cookie: `access_token=${tampered}` },
    })
    expect(res.statusCode).toBe(401)
  })

  it("A login session token cannot be used in place of a refresh token - Negative", async () => {
    const cookies = await loginAndGetCookies(app, EMAIL, PASSWORD)
    const res = await app.inject({
      method: "POST", url: "/auth/refresh",
      cookies: { refresh_token: cookies["access_token"] },
    })
    expect(res.statusCode).toBe(401)
  })

  it("A refresh token cannot be used in place of a login token to access protected pages - Negative", async () => {
    const cookies = await loginAndGetCookies(app, EMAIL, PASSWORD)
    const res = await app.inject({
      method: "GET", url: "/auth/me",
      headers: { cookie: `access_token=${cookies["refresh_token"]}` },
    })
    expect(res.statusCode).toBe(401)
  })
})
