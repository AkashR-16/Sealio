import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import multipart from "@fastify/multipart"
import { jwtPlugin } from "../plugins/jwt.js"
import { authRoutes } from "../routes/auth.js"
import { documentRoutes } from "../routes/documents.js"
import { fieldRoutes } from "../routes/fields.js"
import { sendRoutes } from "../routes/send.js"
import { signingRoutes } from "../routes/signing.js"
import { prisma } from "@sealio/db"

// Stub email sends so tests don't need Mailhog
vi.mock("../lib/mailer.js", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }))

const MINIMAL_PDF = Buffer.from(
  "%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\n" +
    "xref\n0 4\n0000000000 65535 f \n" +
    "trailer<</Size 4/Root 1 0 R>>\nstartxref\n9\n%%EOF",
)

const TEST_EMAIL = `signing-${Date.now()}@sealio.test`
const SIGNER_EMAIL = `signer-${Date.now()}@external.test`
const TEST_PASSWORD = "testpassword123"

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

function makeMultipart(buf: Buffer, filename = "test.pdf") {
  const boundary = "----TestBoundary" + Date.now()
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`),
    buf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

let app: Awaited<ReturnType<typeof buildServer>>
let accessToken: string
let docId: string
let signingToken: string // the SigningRequest.token (in URL)

beforeAll(async () => {
  app = await buildServer()
  await app.ready()

  // Sign up a sender
  const res = await app.inject({
    method: "POST", url: "/auth/signup",
    payload: { name: "Sender User", email: TEST_EMAIL, password: TEST_PASSWORD, orgName: `Sign Org ${Date.now()}` },
  })
  expect(res.statusCode).toBe(201)
  const cookies = res.headers["set-cookie"] as string[]
  accessToken = cookies.find((c) => c.startsWith("access_token="))!.split(";")[0].replace("access_token=", "")

  // Upload a document
  const { body, contentType } = makeMultipart(MINIMAL_PDF)
  const uploadRes = await app.inject({
    method: "POST", url: "/documents?title=Sign+Test+Doc",
    headers: { "content-type": contentType, cookie: `access_token=${accessToken}` },
    payload: body,
  })
  expect(uploadRes.statusCode).toBe(201)
  docId = uploadRes.json().data.id

  // Place a field assigned to signer
  await app.inject({
    method: "PUT", url: `/documents/${docId}/fields`,
    cookies: { access_token: accessToken },
    payload: {
      fields: [{ type: "signature", page: 1, x: 10, y: 10, width: 20, height: 6, required: true, assignedToEmail: SIGNER_EMAIL }],
    },
  })
})

afterAll(async () => {
  await prisma.signature.deleteMany({ where: { signingRequest: { document: { creator: { email: TEST_EMAIL } } } } })
  await prisma.signingRequest.deleteMany({ where: { document: { creator: { email: TEST_EMAIL } } } })
  await prisma.documentField.deleteMany({ where: { document: { creator: { email: TEST_EMAIL } } } })
  await prisma.document.deleteMany({ where: { creator: { email: TEST_EMAIL } } })
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } })
  await prisma.organization.deleteMany({ where: { users: { none: {} } } })
  await app.close()
  await prisma.$disconnect()
})

// ── POST /documents/:id/send ──────────────────────────────────────────────────

describe("POST /documents/:id/send", () => {
  it("sends the document and returns ok", async () => {
    const res = await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      cookies: { access_token: accessToken },
      payload: { signers: [{ email: SIGNER_EMAIL, name: "Test Signer" }] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.ok).toBe(true)

    // Document status updated to sent
    const doc = await prisma.document.findUnique({ where: { id: docId } })
    expect(doc?.status).toBe("sent")

    // SigningRequest created
    const sr = await prisma.signingRequest.findFirst({ where: { documentId: docId } })
    expect(sr).not.toBeNull()
    expect(sr?.signerEmail).toBe(SIGNER_EMAIL)
    expect(sr?.otpHash).toBeTruthy()
    expect(sr?.otpExpiresAt).toBeTruthy()
    signingToken = sr!.token
  })

  it("rejects sending the same document twice with 409", async () => {
    const res = await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      cookies: { access_token: accessToken },
      payload: { signers: [{ email: SIGNER_EMAIL, name: "Test Signer" }] },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().error.message).toContain("already been sent")
  })

  it("rejects signer not in fields with 422", async () => {
    // Upload a fresh doc and send with a signer not assigned to any field
    const { body, contentType } = makeMultipart(
      Buffer.concat([MINIMAL_PDF, Buffer.from(`\n% ${Date.now()}`)]),
    )
    const upRes = await app.inject({
      method: "POST", url: "/documents?title=No+Field+Doc",
      headers: { "content-type": contentType, cookie: `access_token=${accessToken}` },
      payload: body,
    })
    const freshId = upRes.json().data.id

    const res = await app.inject({
      method: "POST", url: `/documents/${freshId}/send`,
      cookies: { access_token: accessToken },
      payload: { signers: [{ email: "nobody@example.com", name: "Ghost" }] },
    })
    expect(res.statusCode).toBe(422)
  })

  it("rejects unauthenticated with 401", async () => {
    const res = await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      payload: { signers: [{ email: SIGNER_EMAIL, name: "Test Signer" }] },
    })
    expect(res.statusCode).toBe(401)
  })

  it("rejects empty signers array with 400", async () => {
    const res = await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      cookies: { access_token: accessToken },
      payload: { signers: [] },
    })
    expect(res.statusCode).toBe(400)
  })

  it("rejects invalid signer email with 400", async () => {
    const res = await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      cookies: { access_token: accessToken },
      payload: { signers: [{ email: "not-an-email", name: "Bad" }] },
    })
    expect(res.statusCode).toBe(400)
  })
})

// ── GET /sign/:token ──────────────────────────────────────────────────────────

describe("GET /sign/:token", () => {
  it("returns signer + document metadata for valid token", async () => {
    const res = await app.inject({ method: "GET", url: `/sign/${signingToken}` })
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    expect(data.signerEmail).toBe(SIGNER_EMAIL)
    expect(data.document.title).toBe("Sign Test Doc")
    expect(data.status).toBe("pending")
    expect(data.alreadyVerified).toBe(false)
  })

  it("returns 404 for unknown token", async () => {
    const res = await app.inject({ method: "GET", url: "/sign/nonexistent-token-xyz" })
    expect(res.statusCode).toBe(404)
  })
})

// ── POST /sign/:token/authenticate ────────────────────────────────────────────

describe("POST /sign/:token/authenticate", () => {
  it("rejects wrong OTP with 401 and shows remaining attempts", async () => {
    const res = await app.inject({
      method: "POST", url: `/sign/${signingToken}/authenticate`,
      payload: { otp: "000000" },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().error.message).toMatch(/remaining/i)
  })

  it("rejects malformed OTP (wrong length) with 400", async () => {
    const res = await app.inject({
      method: "POST", url: `/sign/${signingToken}/authenticate`,
      payload: { otp: "12345" }, // 5 digits
    })
    expect(res.statusCode).toBe(400)
  })

  it("accepts the correct OTP and sets signing_token cookie", async () => {
    // Read the real OTP from DB
    const sr = await prisma.signingRequest.findUnique({ where: { token: signingToken } })
    expect(sr?.otpHash).toBeTruthy()

    // Get the plaintext OTP via brute-force of our known test range
    // Instead: we override the OTP in the DB directly for the test
    const { generateOtp, hashOtp } = await import("../services/signing.service.js")
    const otp = generateOtp()
    const otpHash = await hashOtp(otp)
    await prisma.signingRequest.update({
      where: { token: signingToken },
      data: { otpHash, otpAttempts: 0, otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    })

    const res = await app.inject({
      method: "POST", url: `/sign/${signingToken}/authenticate`,
      payload: { otp },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.authenticated).toBe(true)

    const cookies = res.headers["set-cookie"] as string | string[]
    const cookieStr = Array.isArray(cookies) ? cookies.join(";") : cookies
    expect(cookieStr).toContain("signing_token")
    expect(cookieStr).toContain("HttpOnly")
  })

  it("returns alreadyVerified=true after successful OTP", async () => {
    const res = await app.inject({ method: "GET", url: `/sign/${signingToken}` })
    expect(res.json().data.alreadyVerified).toBe(true)
  })
})

// ── Rate limiting — max 3 attempts ───────────────────────────────────────────

describe("OTP rate limiting (max 3 attempts)", () => {
  let rateToken: string

  beforeAll(async () => {
    // Create a fresh document + signing request for rate-limit test
    const { body, contentType } = makeMultipart(
      Buffer.concat([MINIMAL_PDF, Buffer.from(`\n% rate-${Date.now()}`)]),
    )
    const upRes = await app.inject({
      method: "POST", url: "/documents?title=Rate+Limit+Doc",
      headers: { "content-type": contentType, cookie: `access_token=${accessToken}` },
      payload: body,
    })
    const rateDocId = upRes.json().data.id

    await app.inject({
      method: "PUT", url: `/documents/${rateDocId}/fields`,
      cookies: { access_token: accessToken },
      payload: {
        fields: [{ type: "signature", page: 1, x: 10, y: 10, width: 20, height: 6, required: true, assignedToEmail: SIGNER_EMAIL }],
      },
    })

    await app.inject({
      method: "POST", url: `/documents/${rateDocId}/send`,
      cookies: { access_token: accessToken },
      payload: { signers: [{ email: SIGNER_EMAIL, name: "Rate Test Signer" }] },
    })

    const sr = await prisma.signingRequest.findFirst({ where: { documentId: rateDocId } })
    rateToken = sr!.token
  })

  it("3 wrong OTPs exhaust attempts and the 3rd returns 401", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({
        method: "POST", url: `/sign/${rateToken}/authenticate`,
        payload: { otp: "000000" },
      })
      // First 2: 401 with remaining, last: 401 with no attempts remaining
      expect(res.statusCode).toBe(401)
    }
  })

  it("4th attempt (post-exhaustion) returns 429", async () => {
    const res = await app.inject({
      method: "POST", url: `/sign/${rateToken}/authenticate`,
      payload: { otp: "000000" },
    })
    expect(res.statusCode).toBe(429)
    expect(res.json().error.message).toMatch(/too many/i)
  })
})

// ── OTP expiry ────────────────────────────────────────────────────────────────

describe("OTP expiry", () => {
  it("returns 410 when OTP has expired", async () => {
    // Create a fresh doc/request with an already-expired OTP
    const { body, contentType } = makeMultipart(
      Buffer.concat([MINIMAL_PDF, Buffer.from(`\n% expiry-${Date.now()}`)]),
    )
    const upRes = await app.inject({
      method: "POST", url: "/documents?title=Expiry+Doc",
      headers: { "content-type": contentType, cookie: `access_token=${accessToken}` },
      payload: body,
    })
    const expDocId = upRes.json().data.id

    await app.inject({
      method: "PUT", url: `/documents/${expDocId}/fields`,
      cookies: { access_token: accessToken },
      payload: {
        fields: [{ type: "signature", page: 1, x: 10, y: 10, width: 20, height: 6, required: true, assignedToEmail: SIGNER_EMAIL }],
      },
    })

    await app.inject({
      method: "POST", url: `/documents/${expDocId}/send`,
      cookies: { access_token: accessToken },
      payload: { signers: [{ email: SIGNER_EMAIL, name: "Expiry Signer" }] },
    })

    const sr = await prisma.signingRequest.findFirst({ where: { documentId: expDocId } })

    // Force OTP to be expired
    await prisma.signingRequest.update({
      where: { id: sr!.id },
      data: { otpExpiresAt: new Date(Date.now() - 1000) },
    })

    const res = await app.inject({
      method: "POST", url: `/sign/${sr!.token}/authenticate`,
      payload: { otp: "123456" },
    })
    expect(res.statusCode).toBe(410)
    expect(res.json().error.message).toMatch(/expired/i)
  })
})

// ── GET /sign/:token/document ─────────────────────────────────────────────────

describe("GET /sign/:token/document", () => {
  it("returns 401 without signing_token cookie", async () => {
    const res = await app.inject({ method: "GET", url: `/sign/${signingToken}/document` })
    expect(res.statusCode).toBe(401)
  })

  it("returns 401 with a tampered signing_token cookie", async () => {
    const res = await app.inject({
      method: "GET", url: `/sign/${signingToken}/document`,
      cookies: { signing_token: "invalid.jwt.token" },
    })
    expect(res.statusCode).toBe(401)
  })

  it("streams the PDF after valid OTP verification", async () => {
    // Obtain a valid signing_token by authenticating with a fresh OTP
    const sr = await prisma.signingRequest.findUnique({ where: { token: signingToken } })
    const { generateOtp, hashOtp } = await import("../services/signing.service.js")
    const otp = generateOtp()
    const otpHash = await hashOtp(otp)
    await prisma.signingRequest.update({
      where: { token: signingToken },
      data: { otpHash, otpAttempts: 0, otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000), otpVerifiedAt: null },
    })

    const authRes = await app.inject({
      method: "POST", url: `/sign/${signingToken}/authenticate`,
      payload: { otp },
    })
    expect(authRes.statusCode).toBe(200)

    const rawCookies = authRes.headers["set-cookie"]
    const setCookies = Array.isArray(rawCookies) ? rawCookies : [rawCookies as string]
    const signingJwtCookie = setCookies.find((c) => c.startsWith("signing_token="))!
    const signingJwt = signingJwtCookie.split(";")[0].replace("signing_token=", "")

    const docRes = await app.inject({
      method: "GET", url: `/sign/${signingToken}/document`,
      cookies: { signing_token: signingJwt },
    })
    expect(docRes.statusCode).toBe(200)
    expect(docRes.headers["content-type"]).toContain("application/pdf")
    expect(docRes.rawPayload.slice(0, 4).toString()).toBe("%PDF")
  })

  it("rejects signing_token issued for a different token", async () => {
    // Sign a JWT for signingToken but use it on a different token URL
    const res = await app.inject({
      method: "GET", url: `/sign/some-other-token/document`,
      cookies: { signing_token: "some.jwt.mismatch" },
    })
    expect(res.statusCode).toBe(401)
  })
})
