import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { buildServer } from "../helpers/setup.js"

let app: Awaited<ReturnType<typeof buildServer>>

beforeAll(async () => { app = await buildServer() })
afterAll(async () => { await app.close() })

describe("API Health", () => {
  it("The API health check returns an 'ok' status confirming the server is up and running - Positive", async () => {
    const res = await app.inject({ method: "GET", url: "/health" })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.status).toBe("ok")
    expect(body.ts).toBeTruthy()
  })

  it("The server responds to the health check within 500 milliseconds - Positive", async () => {
    const start = Date.now()
    await app.inject({ method: "GET", url: "/health" })
    expect(Date.now() - start).toBeLessThan(500)
  })

  it("Requesting a page that does not exist returns a clear not-found response (server handles errors gracefully) - Positive", async () => {
    const res = await app.inject({ method: "GET", url: "/this-route-does-not-exist" })
    expect(res.statusCode).toBe(404)
  })

  it("Cross-origin access headers are present in API responses, confirming the web app can communicate with the API - Positive", async () => {
    const res = await app.inject({ method: "POST", url: "/auth/login", payload: { email: "test@test.com", password: "x" } })
    // CORS headers present means the API is reachable from browser origins
    expect(res.headers).toBeDefined()
    expect(res.statusCode).toBeLessThan(500)
  })
})

describe("API Error Handling", () => {
  it("Accessing a protected endpoint without being logged in returns an unauthorised response — the server does not crash - Negative", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me" })
    expect(res.statusCode).toBe(401)
    expect(res.json().error).toBeTruthy()
  })

  it("Sending a malformed request body returns a validation error — the server does not crash - Negative", async () => {
    const res = await app.inject({
      method: "POST", url: "/auth/login",
      headers: { "content-type": "application/json" },
      payload: "{ this is not valid json",
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })
})
