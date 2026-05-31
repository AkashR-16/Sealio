/**
 * Page time tracking (M5-3) integration tests:
 *   POST /sign/:token/complete  with optional `pageTimes` body
 *
 * Verifies that engagement analytics data ({ page, seconds }[]) is persisted
 * to SigningRequest.pageViewData, that it's optional, and that a malformed
 * shape is ignored gracefully (completion still succeeds).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import { jwtPlugin } from "../plugins/jwt.js"
import { authRoutes } from "../routes/auth.js"
import { documentRoutes } from "../routes/documents.js"
import { fieldRoutes } from "../routes/fields.js"
import { sendRoutes } from "../routes/send.js"
import { signingRoutes } from "../routes/signing.js"
import { prisma } from "@sealio/db"

vi.mock("../lib/mailer.js", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }))

const MINIMAL_PDF = Buffer.from(
  "%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\n" +
    "xref\n0 4\n0000000000 65535 f \n" +
    "trailer<</Size 4/Root 1 0 R>>\nstartxref\n9\n%%EOF",
)

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`
const SENDER_EMAIL = `pt-sender-${uid()}@sealio.test`
const SIGNER_EMAIL = `pt-signer-${uid()}@external.test`
const TEST_OTP = "424242"

async function buildServer() {
  const app = Fastify({ logger: false })
  await app.register(cookie, { secret: "test-secret-32-chars-placeholder!" })
  await app.register(cors, { origin: true, credentials: true })
  await app.register(jwtPlugin)
  await app.register(authRoutes)
  await app.register(documentRoutes)
  await app.register(fieldRoutes)
  await app.register(sendRoutes)
  await app.register(signingRoutes)
  return app
}

function mp(buf: Buffer) {
  const b = "----B" + Date.now()
  return {
    body: Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="t.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
      buf,
      Buffer.from(`\r\n--${b}--\r\n`),
    ]),
    contentType: `multipart/form-data; boundary=${b}`,
  }
}

let app: Awaited<ReturnType<typeof buildServer>>
let senderToken: string

/** Create a fresh sent document with one signed signature field, return its token. */
async function makeReadyToComplete(): Promise<string> {
  const { body, contentType } = mp(Buffer.concat([MINIMAL_PDF, Buffer.from(`\n% ${uid()}`)]))
  const upload = await app.inject({
    method: "POST", url: "/documents?title=PageTime+Doc",
    headers: { "content-type": contentType, cookie: `access_token=${senderToken}` },
    payload: body,
  })
  const docId = upload.json().data.id

  await app.inject({
    method: "PUT", url: `/documents/${docId}/fields`,
    cookies: { access_token: senderToken },
    payload: {
      fields: [{ type: "signature", page: 1, x: 10, y: 10, width: 20, height: 6, required: true, assignedToEmail: SIGNER_EMAIL }],
    },
  })

  await app.inject({
    method: "POST", url: `/documents/${docId}/send`,
    cookies: { access_token: senderToken },
    payload: { signers: [{ email: SIGNER_EMAIL, name: "PT Signer" }] },
  })

  const sr = await prisma.signingRequest.findFirst({ where: { documentId: docId } })
  const token = sr!.token

  // Authenticate (OTP) to get the signing cookie
  const { hashOtp } = await import("../services/signing.service.js")
  await prisma.signingRequest.update({
    where: { token },
    data: { otpHash: await hashOtp(TEST_OTP), otpAttempts: 0, otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), otpVerifiedAt: null },
  })
  const authRes = await app.inject({ method: "POST", url: `/sign/${token}/authenticate`, payload: { otp: TEST_OTP } })
  const raw = authRes.headers["set-cookie"]
  const cookies = Array.isArray(raw) ? raw : [raw as string]
  const signingJwt = cookies.find((x) => x.startsWith("signing_token="))!.split(";")[0].replace("signing_token=", "")

  // Sign the one required field
  const fieldsRes = await app.inject({ method: "GET", url: `/sign/${token}/fields`, cookies: { signing_token: signingJwt } })
  const fieldId = fieldsRes.json().data.fields[0].id
  await app.inject({
    method: "POST", url: `/sign/${token}/fields/${fieldId}`,
    cookies: { signing_token: signingJwt },
    payload: { value: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII=", captureMethod: "draw" },
  })

  // stash the signing cookie on the token for the test to use
  tokenJwt.set(token, signingJwt)
  return token
}

const tokenJwt = new Map<string, string>()

beforeAll(async () => {
  app = await buildServer()
  await app.ready()

  const signup = await app.inject({
    method: "POST", url: "/auth/signup",
    payload: { name: "PT Sender", email: SENDER_EMAIL, password: "testpassword123", orgName: `PT Org ${uid()}` },
  })
  expect(signup.statusCode).toBe(201)
  const c = signup.headers["set-cookie"] as string[]
  senderToken = c.find((x) => x.startsWith("access_token="))!.split(";")[0].replace("access_token=", "")
})

afterAll(async () => {
  await prisma.signature.deleteMany({ where: { signingRequest: { document: { creator: { email: SENDER_EMAIL } } } } })
  await prisma.signingRequest.deleteMany({ where: { document: { creator: { email: SENDER_EMAIL } } } })
  await prisma.documentField.deleteMany({ where: { document: { creator: { email: SENDER_EMAIL } } } })
  await prisma.document.deleteMany({ where: { creator: { email: SENDER_EMAIL } } })
  await prisma.user.deleteMany({ where: { email: SENDER_EMAIL } })
  await prisma.organization.deleteMany({ where: { users: { none: {} } } })
  await app.close()
  await prisma.$disconnect()
})

describe("POST /sign/:token/complete — page time tracking", () => {
  it("persists pageTimes to pageViewData on completion", async () => {
    const token = await makeReadyToComplete()
    const signingJwt = tokenJwt.get(token)!
    const pageTimes = [
      { page: 1, seconds: 42 },
      { page: 2, seconds: 17 },
    ]

    const res = await app.inject({
      method: "POST", url: `/sign/${token}/complete`,
      cookies: { signing_token: signingJwt },
      payload: { pageTimes },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.ok).toBe(true)

    const sr = await prisma.signingRequest.findUnique({ where: { token } })
    expect(sr?.status).toBe("signed")
    expect(sr?.pageViewData).toEqual(pageTimes)
  })

  it("leaves pageViewData null when no pageTimes provided", async () => {
    const token = await makeReadyToComplete()
    const signingJwt = tokenJwt.get(token)!

    const res = await app.inject({
      method: "POST", url: `/sign/${token}/complete`,
      cookies: { signing_token: signingJwt },
      payload: {},
    })
    expect(res.statusCode).toBe(200)

    const sr = await prisma.signingRequest.findUnique({ where: { token } })
    expect(sr?.status).toBe("signed")
    expect(sr?.pageViewData).toBeNull()
  })

  it("accepts an empty pageTimes array (stores empty array)", async () => {
    const token = await makeReadyToComplete()
    const signingJwt = tokenJwt.get(token)!

    const res = await app.inject({
      method: "POST", url: `/sign/${token}/complete`,
      cookies: { signing_token: signingJwt },
      payload: { pageTimes: [] },
    })
    expect(res.statusCode).toBe(200)

    const sr = await prisma.signingRequest.findUnique({ where: { token } })
    // Empty array is falsy-checked in the route (only stored when truthy length),
    // route spreads `pageTimes ? {...} : {}` — empty array is truthy so it IS stored
    expect(sr?.pageViewData).toEqual([])
  })

  it("ignores a malformed pageTimes shape but still completes", async () => {
    const token = await makeReadyToComplete()
    const signingJwt = tokenJwt.get(token)!

    const res = await app.inject({
      method: "POST", url: `/sign/${token}/complete`,
      cookies: { signing_token: signingJwt },
      payload: { pageTimes: "not-an-array" },
    })
    // safeParse fails → pageTimes undefined → completion still succeeds
    expect(res.statusCode).toBe(200)

    const sr = await prisma.signingRequest.findUnique({ where: { token } })
    expect(sr?.status).toBe("signed")
    expect(sr?.pageViewData).toBeNull()
  })

  it("rejects negative seconds (safeParse fails → ignored, completion succeeds)", async () => {
    const token = await makeReadyToComplete()
    const signingJwt = tokenJwt.get(token)!

    const res = await app.inject({
      method: "POST", url: `/sign/${token}/complete`,
      cookies: { signing_token: signingJwt },
      payload: { pageTimes: [{ page: 1, seconds: -5 }] },
    })
    expect(res.statusCode).toBe(200)

    const sr = await prisma.signingRequest.findUnique({ where: { token } })
    expect(sr?.pageViewData).toBeNull()
  })

  it("preserves multi-page ordering and exact second values", async () => {
    const token = await makeReadyToComplete()
    const signingJwt = tokenJwt.get(token)!
    const pageTimes = [
      { page: 1, seconds: 5 },
      { page: 2, seconds: 120 },
      { page: 3, seconds: 0 },
    ]

    await app.inject({
      method: "POST", url: `/sign/${token}/complete`,
      cookies: { signing_token: signingJwt },
      payload: { pageTimes },
    })

    const sr = await prisma.signingRequest.findUnique({ where: { token } })
    expect(sr?.pageViewData).toEqual(pageTimes)
  })

  it("requires the signing cookie — 401 without it (no pageTimes leak)", async () => {
    const token = await makeReadyToComplete()

    const res = await app.inject({
      method: "POST", url: `/sign/${token}/complete`,
      payload: { pageTimes: [{ page: 1, seconds: 10 }] },
    })
    expect(res.statusCode).toBe(401)

    const sr = await prisma.signingRequest.findUnique({ where: { token } })
    expect(sr?.pageViewData).toBeNull()
    expect(sr?.status).not.toBe("signed")
  })
})
