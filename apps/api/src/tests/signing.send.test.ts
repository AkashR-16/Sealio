/**
 * Additional signing/send integration tests covering gaps:
 *  - Multi-signer send (order preserved, both signing requests created)
 *  - Document with no fields assigned → 422
 *  - Document with fields but no signers provided → 400
 *  - Duplicate signer email in request (deduplication)
 *  - GET /documents/:id includes signingRequests after send
 *  - Email template content (invitation + OTP)
 *  - Signing request order for sequential signers
 */
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

// Capture emails sent during tests
const sentEmails: { to: string; subject: string; html: string }[] = []
vi.mock("../lib/mailer.js", () => ({
  sendMail: vi.fn(async (opts: { to: string; subject: string; html: string }) => {
    sentEmails.push(opts)
  }),
}))

const MINIMAL_PDF = Buffer.from(
  "%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\n" +
    "xref\n0 4\n0000000000 65535 f \n" +
    "trailer<</Size 4/Root 1 0 R>>\nstartxref\n9\n%%EOF",
)

const uniquePdf = (tag: string) =>
  Buffer.concat([MINIMAL_PDF, Buffer.from(`\n% ${tag}-${Date.now()}`)])

const SENDER_EMAIL = `sender-extra-${Date.now()}@sealio.test`
const SIGNER_A = `signerA-${Date.now()}@external.test`
const SIGNER_B = `signerB-${Date.now()}@external.test`

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

function mp(buf: Buffer, name = "test.pdf") {
  const b = "----B" + Date.now()
  return {
    body: Buffer.concat([
      Buffer.from(`--${b}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\nContent-Type: application/pdf\r\n\r\n`),
      buf,
      Buffer.from(`\r\n--${b}--\r\n`),
    ]),
    contentType: `multipart/form-data; boundary=${b}`,
  }
}

let app: Awaited<ReturnType<typeof buildServer>>
let token: string

beforeAll(async () => {
  app = await buildServer()
  await app.ready()

  const res = await app.inject({
    method: "POST", url: "/auth/signup",
    payload: { name: "Extra Sender", email: SENDER_EMAIL, password: "testpassword123", orgName: `Extra Send Org ${Date.now()}` },
  })
  expect(res.statusCode).toBe(201)
  const cookies = res.headers["set-cookie"] as string[]
  token = cookies.find((c) => c.startsWith("access_token="))!.split(";")[0].replace("access_token=", "")
})

afterAll(async () => {
  await prisma.signingRequest.deleteMany({ where: { document: { creator: { email: SENDER_EMAIL } } } })
  await prisma.documentField.deleteMany({ where: { document: { creator: { email: SENDER_EMAIL } } } })
  await prisma.document.deleteMany({ where: { creator: { email: SENDER_EMAIL } } })
  await prisma.user.deleteMany({ where: { email: SENDER_EMAIL } })
  await prisma.organization.deleteMany({ where: { users: { none: {} } } })
  await app.close()
  await prisma.$disconnect()
})

// ── Helper: upload + place fields ────────────────────────────────────────────

async function uploadAndAssign(tag: string, assignments: { email: string }[]) {
  const { body, contentType } = mp(uniquePdf(tag))
  const upRes = await app.inject({
    method: "POST", url: `/documents?title=${tag}`,
    headers: { "content-type": contentType, cookie: `access_token=${token}` },
    payload: body,
  })
  expect(upRes.statusCode).toBe(201)
  const docId = upRes.json().data.id

  await app.inject({
    method: "PUT", url: `/documents/${docId}/fields`,
    cookies: { access_token: token },
    payload: {
      fields: assignments.map((a, i) => ({
        type: "signature", page: 1,
        x: 10 + i * 25, y: 10, width: 20, height: 6,
        required: true, assignedToEmail: a.email,
      })),
    },
  })
  return docId
}

// ── Multi-signer send ─────────────────────────────────────────────────────────

describe("Multi-signer send", () => {
  it("creates one SigningRequest per signer with correct order", async () => {
    sentEmails.length = 0
    const docId = await uploadAndAssign("MultiSigner", [
      { email: SIGNER_A }, { email: SIGNER_B },
    ])

    const res = await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      cookies: { access_token: token },
      payload: {
        signers: [
          { email: SIGNER_A, name: "Alice" },
          { email: SIGNER_B, name: "Bob" },
        ],
      },
    })
    expect(res.statusCode).toBe(200)

    const requests = await prisma.signingRequest.findMany({
      where: { documentId: docId },
      orderBy: { order: "asc" },
    })
    expect(requests).toHaveLength(2)
    expect(requests[0].signerEmail).toBe(SIGNER_A)
    expect(requests[0].order).toBe(0)
    expect(requests[1].signerEmail).toBe(SIGNER_B)
    expect(requests[1].order).toBe(1)
  })

  it("sends 2 emails per signer (invitation + OTP) = 4 total for 2 signers", async () => {
    // emails captured from the multi-signer send above
    expect(sentEmails.length).toBe(4)
  })
})

// ── Email template content ────────────────────────────────────────────────────

describe("Email template content", () => {
  it("invitation email subject contains sender name and document title", async () => {
    const invitation = sentEmails.find((e) => e.subject.includes("requested your signature"))
    expect(invitation).toBeTruthy()
    expect(invitation!.subject).toContain("Extra Sender")
    expect(invitation!.subject).toContain("MultiSigner")
  })

  it("invitation email HTML contains a signing link (/sign/)", async () => {
    const invitation = sentEmails.find((e) => e.subject.includes("requested your signature"))
    expect(invitation!.html).toContain("/sign/")
  })

  it("OTP email subject contains the 6-digit code", async () => {
    const otpEmails = sentEmails.filter((e) => e.subject.includes("verification code"))
    expect(otpEmails.length).toBeGreaterThan(0)
    // Subject format: "Your Sealio verification code: 123456"
    const match = otpEmails[0].subject.match(/:\s*(\d{6})/)
    expect(match).toBeTruthy()
    expect(match![1]).toHaveLength(6)
  })

  it("OTP email HTML contains the same code as the subject", async () => {
    const otpEmail = sentEmails.find((e) => e.subject.includes("verification code"))!
    const codeInSubject = otpEmail.subject.match(/:\s*(\d{6})/)![1]
    expect(otpEmail.html).toContain(codeInSubject)
  })

  it("OTP email is sent to the correct signer email", async () => {
    const toSignerA = sentEmails.filter((e) => e.to === SIGNER_A)
    expect(toSignerA.length).toBe(2) // invitation + OTP
  })
})

// ── Validation edge cases ─────────────────────────────────────────────────────

describe("Send validation edge cases", () => {
  it("document with no fields assigned → 422", async () => {
    const { body, contentType } = mp(uniquePdf("NoFields"))
    const upRes = await app.inject({
      method: "POST", url: "/documents?title=NoFields",
      headers: { "content-type": contentType, cookie: `access_token=${token}` },
      payload: body,
    })
    const docId = upRes.json().data.id
    // No fields placed at all

    const res = await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      cookies: { access_token: token },
      payload: { signers: [{ email: SIGNER_A, name: "Alice" }] },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toMatch(/no fields/i)
  })

  it("signer not assigned to any field → 422", async () => {
    const docId = await uploadAndAssign("UnassignedSigner", [{ email: SIGNER_A }])

    const res = await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      cookies: { access_token: token },
      payload: { signers: [{ email: "nobody@unknown.com", name: "Ghost" }] },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toContain("nobody@unknown.com")
  })

  it("duplicate signer email is deduplicated (one SigningRequest created)", async () => {
    const docId = await uploadAndAssign("DedupSigner", [{ email: SIGNER_A }])

    await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      cookies: { access_token: token },
      payload: {
        signers: [
          { email: SIGNER_A, name: "Alice First" },
          { email: SIGNER_A, name: "Alice Second" },
        ],
      },
    })

    const requests = await prisma.signingRequest.findMany({ where: { documentId: docId } })
    expect(requests).toHaveLength(1)
  })
})

// ── GET /documents/:id includes signingRequests after send ────────────────────

describe("GET /documents/:id — signingRequests included after send", () => {
  it("includes signingRequests array with correct signer data", async () => {
    const docId = await uploadAndAssign("WithSR", [{ email: SIGNER_A }])

    await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      cookies: { access_token: token },
      payload: { signers: [{ email: SIGNER_A, name: "Alice" }] },
    })

    const res = await app.inject({
      method: "GET", url: `/documents/${docId}`,
      cookies: { access_token: token },
    })
    expect(res.statusCode).toBe(200)
    const doc = res.json().data
    expect(doc.status).toBe("sent")
    expect(Array.isArray(doc.signingRequests)).toBe(true)
    expect(doc.signingRequests).toHaveLength(1)
    expect(doc.signingRequests[0].signerEmail).toBe(SIGNER_A)
    expect(doc.signingRequests[0].token).toBeTruthy()
  })
})

// ── Sign/:token after document is sent ───────────────────────────────────────

describe("GET /sign/:token — various states", () => {
  let srToken: string

  beforeAll(async () => {
    const docId = await uploadAndAssign("TokenStates", [{ email: SIGNER_A }])
    await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      cookies: { access_token: token },
      payload: { signers: [{ email: SIGNER_A, name: "Alice" }] },
    })
    const sr = await prisma.signingRequest.findFirst({ where: { documentId: docId } })
    srToken = sr!.token
  })

  it("returns status=pending before OTP verification", async () => {
    const res = await app.inject({ method: "GET", url: `/sign/${srToken}` })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.status).toBe("pending")
    expect(res.json().data.alreadyVerified).toBe(false)
  })

  it("returns alreadyVerified=true after OTP verification", async () => {
    const { generateOtp, hashOtp } = await import("../services/signing.service.js")
    const otp = generateOtp()
    const otpHash = await hashOtp(otp)
    await prisma.signingRequest.update({
      where: { token: srToken },
      data: { otpHash, otpAttempts: 0, otpExpiresAt: new Date(Date.now() + 5 * 60 * 1000) },
    })

    await app.inject({
      method: "POST", url: `/sign/${srToken}/authenticate`,
      payload: { otp },
    })

    const res = await app.inject({ method: "GET", url: `/sign/${srToken}` })
    expect(res.json().data.alreadyVerified).toBe(true)
  })
})
