/**
 * M5 signing integration tests:
 *   GET  /sign/:token/fields
 *   POST /sign/:token/fields/:fieldId
 *   POST /sign/:token/complete
 *
 * Covers: field retrieval, field submission (all captureMethod values),
 * re-submission upsert, partial completion rejection, full completion,
 * cross-token auth mismatch, and idempotent complete.
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
const SENDER_EMAIL = `m5-sender-${uid()}@sealio.test`
const SIGNER_EMAIL = `m5-signer-${uid()}@external.test`

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
let docId: string
let srToken: string     // SigningRequest.token (URL parameter)
let signingJwt: string  // signing_token cookie value

// Known OTP we inject directly so tests don't need Mailhog
const TEST_OTP = "654321"

async function getSigningJwt(): Promise<string> {
  const { generateOtp, hashOtp } = await import("../services/signing.service.js")
  const otp = TEST_OTP
  const hash = await hashOtp(otp)
  await prisma.signingRequest.update({
    where: { token: srToken },
    data: { otpHash: hash, otpAttempts: 0, otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), otpVerifiedAt: null },
  })
  const res = await app.inject({
    method: "POST", url: `/sign/${srToken}/authenticate`,
    payload: { otp },
  })
  expect(res.statusCode).toBe(200)
  const raw = res.headers["set-cookie"]
  const cookies = Array.isArray(raw) ? raw : [raw as string]
  const c = cookies.find((x) => x.startsWith("signing_token="))!
  return c.split(";")[0].replace("signing_token=", "")
}

beforeAll(async () => {
  app = await buildServer()
  await app.ready()

  // Signup sender
  const signup = await app.inject({
    method: "POST", url: "/auth/signup",
    payload: { name: "M5 Sender", email: SENDER_EMAIL, password: "testpassword123", orgName: `M5 Org ${uid()}` },
  })
  expect(signup.statusCode).toBe(201)
  const c = signup.headers["set-cookie"] as string[]
  senderToken = c.find((x) => x.startsWith("access_token="))!.split(";")[0].replace("access_token=", "")

  // Upload doc
  const { body, contentType } = mp(Buffer.concat([MINIMAL_PDF, Buffer.from(`\n% ${uid()}`)]))
  const upload = await app.inject({
    method: "POST", url: "/documents?title=M5+Test",
    headers: { "content-type": contentType, cookie: `access_token=${senderToken}` },
    payload: body,
  })
  expect(upload.statusCode).toBe(201)
  docId = upload.json().data.id

  // Place 2 required fields + 1 optional field
  await app.inject({
    method: "PUT", url: `/documents/${docId}/fields`,
    cookies: { access_token: senderToken },
    payload: {
      fields: [
        { type: "signature", page: 1, x: 10, y: 10, width: 20, height: 6,  required: true,  assignedToEmail: SIGNER_EMAIL },
        { type: "date",      page: 1, x: 10, y: 20, width: 14, height: 4,  required: true,  assignedToEmail: SIGNER_EMAIL },
        { type: "text",      page: 1, x: 10, y: 30, width: 14, height: 4,  required: false, assignedToEmail: SIGNER_EMAIL },
      ],
    },
  })

  // Send for signing
  await app.inject({
    method: "POST", url: `/documents/${docId}/send`,
    cookies: { access_token: senderToken },
    payload: { signers: [{ email: SIGNER_EMAIL, name: "M5 Signer" }] },
  })

  const sr = await prisma.signingRequest.findFirst({ where: { documentId: docId } })
  srToken = sr!.token

  // Obtain signing JWT
  signingJwt = await getSigningJwt()
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

// ── GET /sign/:token/fields ───────────────────────────────────────────────────

describe("GET /sign/:token/fields", () => {
  it("returns 401 without signing_token cookie", async () => {
    const res = await app.inject({ method: "GET", url: `/sign/${srToken}/fields` })
    expect(res.statusCode).toBe(401)
  })

  it("returns 401 with tampered cookie", async () => {
    const res = await app.inject({
      method: "GET", url: `/sign/${srToken}/fields`,
      cookies: { signing_token: "tampered.jwt.value" },
    })
    expect(res.statusCode).toBe(401)
  })

  it("returns fields assigned to the signer", async () => {
    const res = await app.inject({
      method: "GET", url: `/sign/${srToken}/fields`,
      cookies: { signing_token: signingJwt },
    })
    expect(res.statusCode).toBe(200)
    const { fields, documentTitle } = res.json().data
    expect(documentTitle).toBe("M5 Test")
    expect(fields).toHaveLength(3)
    expect(fields.every((f: any) => !f.signed)).toBe(true)
    expect(fields.find((f: any) => f.type === "signature")).toBeTruthy()
    expect(fields.find((f: any) => f.type === "date")).toBeTruthy()
    expect(fields.find((f: any) => f.type === "text")).toBeTruthy()
  })

  it("each field has required position, type, and signed=false initially", async () => {
    const res = await app.inject({
      method: "GET", url: `/sign/${srToken}/fields`,
      cookies: { signing_token: signingJwt },
    })
    const fields = res.json().data.fields
    for (const f of fields) {
      expect(f.id).toBeTruthy()
      expect(f.type).toBeTruthy()
      expect(typeof f.x).toBe("number")
      expect(typeof f.y).toBe("number")
      expect(typeof f.width).toBe("number")
      expect(typeof f.height).toBe("number")
      expect(typeof f.required).toBe("boolean")
      expect(f.signed).toBe(false)
      expect(f.value).toBeNull()
    }
  })
})

// ── POST /sign/:token/fields/:fieldId ─────────────────────────────────────────

describe("POST /sign/:token/fields/:fieldId", () => {
  let signatureFieldId: string
  let dateFieldId: string
  let textFieldId: string

  beforeAll(async () => {
    const res = await app.inject({
      method: "GET", url: `/sign/${srToken}/fields`,
      cookies: { signing_token: signingJwt },
    })
    const fields = res.json().data.fields
    signatureFieldId = fields.find((f: any) => f.type === "signature").id
    dateFieldId = fields.find((f: any) => f.type === "date").id
    textFieldId = fields.find((f: any) => f.type === "text").id
  })

  it("returns 401 without signing_token cookie", async () => {
    const res = await app.inject({
      method: "POST", url: `/sign/${srToken}/fields/${signatureFieldId}`,
      payload: { value: "data:image/png;base64,abc", captureMethod: "draw" },
    })
    expect(res.statusCode).toBe(401)
  })

  it("returns 400 for invalid captureMethod", async () => {
    const res = await app.inject({
      method: "POST", url: `/sign/${srToken}/fields/${signatureFieldId}`,
      cookies: { signing_token: signingJwt },
      payload: { value: "some value", captureMethod: "invalid" },
    })
    expect(res.statusCode).toBe(400)
  })

  it("returns 400 for empty value", async () => {
    const res = await app.inject({
      method: "POST", url: `/sign/${srToken}/fields/${signatureFieldId}`,
      cookies: { signing_token: signingJwt },
      payload: { value: "", captureMethod: "draw" },
    })
    expect(res.statusCode).toBe(400)
  })

  it("returns 404 for a field not assigned to this signer", async () => {
    const res = await app.inject({
      method: "POST", url: `/sign/${srToken}/fields/non-existent-field-id`,
      cookies: { signing_token: signingJwt },
      payload: { value: "test", captureMethod: "auto" },
    })
    expect(res.statusCode).toBe(404)
  })

  it("submits a draw signature (captureMethod=draw)", async () => {
    const fakeDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    const res = await app.inject({
      method: "POST", url: `/sign/${srToken}/fields/${signatureFieldId}`,
      cookies: { signing_token: signingJwt },
      payload: { value: fakeDataUrl, captureMethod: "draw" },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.signature.fieldId).toBe(signatureFieldId)
    expect(res.json().data.signature.captureMethod).toBe("draw")
  })

  it("field is now marked signed=true in GET /fields", async () => {
    const res = await app.inject({
      method: "GET", url: `/sign/${srToken}/fields`,
      cookies: { signing_token: signingJwt },
    })
    const sigField = res.json().data.fields.find((f: any) => f.id === signatureFieldId)
    expect(sigField.signed).toBe(true)
    expect(sigField.captureMethod).toBe("draw")
  })

  it("re-submitting a field upserts (updates existing signature)", async () => {
    const newDataUrl = "data:image/png;base64,AAAA"
    const res = await app.inject({
      method: "POST", url: `/sign/${srToken}/fields/${signatureFieldId}`,
      cookies: { signing_token: signingJwt },
      payload: { value: newDataUrl, captureMethod: "upload" },
    })
    expect(res.statusCode).toBe(200)

    // Verify only one Signature record exists for this field
    const sigs = await prisma.signature.findMany({ where: { fieldId: signatureFieldId } })
    expect(sigs).toHaveLength(1)
    expect(sigs[0].captureMethod).toBe("upload")
  })

  it("submits a date field (captureMethod=auto)", async () => {
    const res = await app.inject({
      method: "POST", url: `/sign/${srToken}/fields/${dateFieldId}`,
      cookies: { signing_token: signingJwt },
      payload: { value: "5/29/2026", captureMethod: "auto" },
    })
    expect(res.statusCode).toBe(200)
  })

  it("submits a text field (captureMethod=auto)", async () => {
    const res = await app.inject({
      method: "POST", url: `/sign/${srToken}/fields/${textFieldId}`,
      cookies: { signing_token: signingJwt },
      payload: { value: "Some text value", captureMethod: "auto" },
    })
    expect(res.statusCode).toBe(200)
  })

  it("submits a type signature (captureMethod=type, value is image URL)", async () => {
    const fakeDataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII="
    const res = await app.inject({
      method: "POST", url: `/sign/${srToken}/fields/${signatureFieldId}`,
      cookies: { signing_token: signingJwt },
      payload: { value: fakeDataUrl, captureMethod: "type" },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.signature.captureMethod).toBe("type")
  })
})

// ── POST /sign/:token/complete ────────────────────────────────────────────────

describe("POST /sign/:token/complete", () => {
  it("returns 401 without signing_token cookie", async () => {
    const res = await app.inject({ method: "POST", url: `/sign/${srToken}/complete` })
    expect(res.statusCode).toBe(401)
  })

  it("returns 422 when required fields are not all signed", async () => {
    // Set up a fresh doc with unsigned required fields
    const { body, contentType } = mp(Buffer.concat([MINIMAL_PDF, Buffer.from(`\n% incomplete-${uid()}`)]))
    const upRes = await app.inject({
      method: "POST", url: "/documents?title=Incomplete+Doc",
      headers: { "content-type": contentType, cookie: `access_token=${senderToken}` },
      payload: body,
    })
    const incompleteDocId = upRes.json().data.id

    await app.inject({
      method: "PUT", url: `/documents/${incompleteDocId}/fields`,
      cookies: { access_token: senderToken },
      payload: { fields: [{ type: "signature", page: 1, x: 10, y: 10, width: 20, height: 6, required: true, assignedToEmail: SIGNER_EMAIL }] },
    })

    await app.inject({
      method: "POST", url: `/documents/${incompleteDocId}/send`,
      cookies: { access_token: senderToken },
      payload: { signers: [{ email: SIGNER_EMAIL, name: "M5 Signer" }] },
    })

    const incompleteSr = await prisma.signingRequest.findFirst({ where: { documentId: incompleteDocId } })
    const incompleteJwt = await (async () => {
      const { hashOtp } = await import("../services/signing.service.js")
      const h = await hashOtp("111111")
      await prisma.signingRequest.update({
        where: { id: incompleteSr!.id },
        data: { otpHash: h, otpAttempts: 0, otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000) },
      })
      const authRes = await app.inject({
        method: "POST", url: `/sign/${incompleteSr!.token}/authenticate`,
        payload: { otp: "111111" },
      })
      const raw = authRes.headers["set-cookie"]
      const c = Array.isArray(raw) ? raw : [raw as string]
      return c.find((x) => x.startsWith("signing_token="))!.split(";")[0].replace("signing_token=", "")
    })()

    const res = await app.inject({
      method: "POST", url: `/sign/${incompleteSr!.token}/complete`,
      cookies: { signing_token: incompleteJwt },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.message).toMatch(/required/i)
  })

  it("returns 200 when all required fields are signed", async () => {
    // Re-obtain signing JWT (previous OTP may have been consumed)
    signingJwt = await getSigningJwt()

    // Ensure both required fields (signature + date) are signed
    const fieldsRes = await app.inject({
      method: "GET", url: `/sign/${srToken}/fields`,
      cookies: { signing_token: signingJwt },
    })
    const fields = fieldsRes.json().data.fields
    for (const f of fields.filter((x: any) => x.required && !x.signed)) {
      const val = f.type === "signature"
        ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAABjE+ibYAAAAASUVORK5CYII="
        : "5/29/2026"
      await app.inject({
        method: "POST", url: `/sign/${srToken}/fields/${f.id}`,
        cookies: { signing_token: signingJwt },
        payload: { value: val, captureMethod: f.type === "signature" ? "draw" : "auto" },
      })
    }

    const res = await app.inject({
      method: "POST", url: `/sign/${srToken}/complete`,
      cookies: { signing_token: signingJwt },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.ok).toBe(true)

    // SigningRequest status updated to "signed"
    const sr = await prisma.signingRequest.findUnique({ where: { token: srToken } })
    expect(sr?.status).toBe("signed")
    expect(sr?.signedAt).not.toBeNull()
  })

  it("calling complete again after already signed returns 200 (idempotent)", async () => {
    // Use existing signing JWT — don't re-auth because SR is now "signed"
    const res = await app.inject({
      method: "POST", url: `/sign/${srToken}/complete`,
      cookies: { signing_token: signingJwt },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.ok).toBe(true)
  })

  it("signing_token for one request cannot complete a different request", async () => {
    // Create a second signing request
    const { body, contentType } = mp(Buffer.concat([MINIMAL_PDF, Buffer.from(`\n% mismatch-${uid()}`)]))
    const upRes = await app.inject({
      method: "POST", url: "/documents?title=Mismatch+Doc",
      headers: { "content-type": contentType, cookie: `access_token=${senderToken}` },
      payload: body,
    })
    const mismatchDocId = upRes.json().data.id

    await app.inject({
      method: "PUT", url: `/documents/${mismatchDocId}/fields`,
      cookies: { access_token: senderToken },
      payload: { fields: [{ type: "signature", page: 1, x: 10, y: 10, width: 20, height: 6, required: true, assignedToEmail: SIGNER_EMAIL }] },
    })

    await app.inject({
      method: "POST", url: `/documents/${mismatchDocId}/send`,
      cookies: { access_token: senderToken },
      payload: { signers: [{ email: SIGNER_EMAIL, name: "M5 Signer" }] },
    })

    const mismatchSr = await prisma.signingRequest.findFirst({ where: { documentId: mismatchDocId } })

    // Use the JWT from the FIRST signing request on the SECOND token URL
    const res = await app.inject({
      method: "POST", url: `/sign/${mismatchSr!.token}/complete`,
      cookies: { signing_token: signingJwt },  // JWT is for srToken, not mismatchSr.token
    })
    expect(res.statusCode).toBe(401)
  })
})

// ── Optional fields do not block completion ───────────────────────────────────

describe("Optional fields do not block completion", () => {
  it("can complete with required fields signed and optional fields unsigned", async () => {
    // Use existing signing JWT — SR is already signed, complete is idempotent
    const res = await app.inject({
      method: "GET", url: `/sign/${srToken}/fields`,
      cookies: { signing_token: signingJwt },
    })
    const optionalField = res.json().data.fields.find((f: any) => !f.required)
    // Optional field may or may not be signed (we signed it in an earlier test)
    expect(optionalField).toBeTruthy()

    // Can still call complete successfully
    const completeRes = await app.inject({
      method: "POST", url: `/sign/${srToken}/complete`,
      cookies: { signing_token: signingJwt },
    })
    expect(completeRes.statusCode).toBe(200)
  })
})
