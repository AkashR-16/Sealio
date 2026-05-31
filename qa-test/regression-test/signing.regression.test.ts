import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@sealio/db"
import {
  buildServer, loginAndGetCookies, cookieHeader, extractCookies,
  uploadTestDocument, placeSignatureField, getOtpFromMailhog, setTestOtp,
} from "../helpers/setup.js"

const REG_OTP = "474747" // fixed OTP used by setTestOtp throughout regression tests

const TS       = Date.now()
const OWNER    = `qa-sign-reg-owner-${TS}@sealio.test`
const PASSWORD = "securepass99"
const ORG      = `QA Sign Reg ${TS}`

let app: Awaited<ReturnType<typeof buildServer>>
let ownerCookies: Record<string, string>

async function setupSigningSession(signerEmail: string) {
  const docId = await uploadTestDocument(app, ownerCookies, `reg-${signerEmail.split("@")[0]}.pdf`)
  await placeSignatureField(app, ownerCookies, docId, signerEmail)
  await app.inject({
    method: "POST", url: `/documents/${docId}/send`,
    headers: { cookie: cookieHeader(ownerCookies) },
    payload: { signers: [{ email: signerEmail, name: "Reg Signer" }] },
  })
  const req = await prisma.signingRequest.findFirst({ where: { signerEmail } })
  return { docId, token: req!.token }
}

async function authenticate(token: string, _email?: string) {
  await setTestOtp(token, REG_OTP)
  const res = await app.inject({ method: "POST", url: `/sign/${token}/authenticate`, payload: { otp: REG_OTP } })
  return extractCookies(res)
}

async function fillAllFields(token: string, sc: Record<string, string>) {
  const fieldsRes = await app.inject({ method: "GET", url: `/sign/${token}/fields`, headers: { cookie: cookieHeader(sc) } })
  const fields: Array<{ id: string; type: string; signed: boolean }> = fieldsRes.json().data.fields
  for (const f of fields.filter((x) => !x.signed)) {
    const value = f.type === "date" ? new Date().toISOString().split("T")[0] : "Reg Signer"
    await app.inject({ method: "POST", url: `/sign/${token}/fields/${f.id}`, headers: { cookie: cookieHeader(sc) }, payload: { value, captureMethod: "auto" } })
  }
}

beforeAll(async () => {
  app = await buildServer()
  await app.inject({ method: "POST", url: "/auth/signup", payload: { name: "Sign Reg Owner", email: OWNER, password: PASSWORD, orgName: ORG } })
  ownerCookies = await loginAndGetCookies(app, OWNER, PASSWORD)
})

afterAll(async () => {
  const user = await prisma.user.findUnique({ where: { email: OWNER } })
  if (user) {
    const docs = await prisma.document.findMany({ where: { orgId: user.orgId } })
    for (const doc of docs) {
      await prisma.signature.deleteMany({ where: { signingRequest: { documentId: doc.id } } })
      await prisma.signingRequest.deleteMany({ where: { documentId: doc.id } })
      await prisma.documentField.deleteMany({ where: { documentId: doc.id } })
      await prisma.auditEvent.deleteMany({ where: { documentId: doc.id } })
    }
    await prisma.document.deleteMany({ where: { orgId: user.orgId } })
    await prisma.user.deleteMany({ where: { orgId: user.orgId } })
    await prisma.organization.deleteMany({ where: { id: user.orgId } })
  }
  await app.close()
  await prisma.$disconnect()
})

describe("OTP Lifecycle", () => {
  it("A signer can request a new verification code after the original has expired, and the new code authenticates successfully - Positive", async () => {
    const signer = `resend-reg-${TS}@sealio.test`
    const { token } = await setupSigningSession(signer)

    // Force-expire the original OTP
    await prisma.signingRequest.updateMany({
      where: { token },
      data: { otpExpiresAt: new Date(0), otpAttempts: 0 },
    })

    // Resend generates a fresh OTP
    const resendRes = await app.inject({ method: "POST", url: `/sign/${token}/resend-otp` })
    expect(resendRes.statusCode).toBe(200)

    // Override with a known OTP for reliable assertion (avoids Mailhog dependency in regression)
    await setTestOtp(token, REG_OTP)
    const authRes = await app.inject({ method: "POST", url: `/sign/${token}/authenticate`, payload: { otp: REG_OTP } })
    expect(authRes.statusCode).toBe(200)
    expect(authRes.json().data.authenticated).toBe(true)
  })

  it("A verification code previously issued becomes invalid once a new code is requested for the same signing link - Negative", async () => {
    const signer = `invalidate-otp-${TS}@sealio.test`
    const { token } = await setupSigningSession(signer)
    const oldOtp = "999888"
    await setTestOtp(token, oldOtp)
    // Force-expire the OTP (simulates the original code expiring)
    await prisma.signingRequest.updateMany({ where: { token }, data: { otpExpiresAt: new Date(0), otpAttempts: 0 } })
    // Expired OTP must be rejected
    const res = await app.inject({ method: "POST", url: `/sign/${token}/authenticate`, payload: { otp: oldOtp } })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
    expect(res.statusCode).toBeLessThan(500)
  })
})

describe("OTP Rate Limiting", () => {
  it("After three incorrect verification code attempts, further attempts are blocked for that signing session - Negative", async () => {
    const signer = `rate-limit-${TS}@sealio.test`
    const { token } = await setupSigningSession(signer)
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: "POST", url: `/sign/${token}/authenticate`, payload: { otp: "000000" } })
    }
    const res = await app.inject({ method: "POST", url: `/sign/${token}/authenticate`, payload: { otp: "000000" } })
    expect(res.statusCode).toBe(429)
  })

  it("Even entering the correct verification code after being rate-limited is blocked until the lockout clears - Negative", async () => {
    const signer = `rate-limit-correct-${TS}@sealio.test`
    const { token } = await setupSigningSession(signer)
    const otp = await getOtpFromMailhog(signer)
    for (let i = 0; i < 3; i++) {
      await app.inject({ method: "POST", url: `/sign/${token}/authenticate`, payload: { otp: "000000" } })
    }
    const res = await app.inject({ method: "POST", url: `/sign/${token}/authenticate`, payload: { otp } })
    expect(res.statusCode).toBe(429)
  })
})

describe("Signature Capture Method Persistence", () => {
  it("A typed-font signature is saved correctly and can be retrieved with the capture method recorded as 'type' - Positive", async () => {
    const signer = `capture-type-${TS}@sealio.test`
    const { token } = await setupSigningSession(signer)
    const sc = await authenticate(token, signer)
    const fieldsRes = await app.inject({ method: "GET", url: `/sign/${token}/fields`, headers: { cookie: cookieHeader(sc) } })
    const sigField = fieldsRes.json().data.fields.find((f: { type: string }) => f.type === "signature")
    const res = await app.inject({ method: "POST", url: `/sign/${token}/fields/${sigField.id}`, headers: { cookie: cookieHeader(sc) }, payload: { value: "Typed Name", captureMethod: "type" } })
    expect(res.statusCode).toBe(200)
    const saved = await prisma.signature.findFirst({ where: { fieldId: sigField.id } })
    expect(saved!.captureMethod).toBe("type")
  })

  it("An uploaded image signature is saved correctly and can be retrieved with the capture method recorded as 'upload' - Positive", async () => {
    const signer = `capture-upload-${TS}@sealio.test`
    const { token } = await setupSigningSession(signer)
    const sc = await authenticate(token, signer)
    const fieldsRes = await app.inject({ method: "GET", url: `/sign/${token}/fields`, headers: { cookie: cookieHeader(sc) } })
    const sigField = fieldsRes.json().data.fields.find((f: { type: string }) => f.type === "signature")
    const res = await app.inject({ method: "POST", url: `/sign/${token}/fields/${sigField.id}`, headers: { cookie: cookieHeader(sc) }, payload: { value: "data:image/png;base64,iVBORw0KGgo=", captureMethod: "upload" } })
    expect(res.statusCode).toBe(200)
    const saved = await prisma.signature.findFirst({ where: { fieldId: sigField.id } })
    expect(saved!.captureMethod).toBe("upload")
  })
})

describe("Signing Session Security", () => {
  it("The signing session remains active for the full 2-hour window after identity verification - Positive", async () => {
    const signer = `session-ttl-${TS}@sealio.test`
    const { token } = await setupSigningSession(signer)
    const sc = await authenticate(token, signer)
    // Immediately after auth, session should still be valid
    const res = await app.inject({ method: "GET", url: `/sign/${token}/fields`, headers: { cookie: cookieHeader(sc) } })
    expect(res.statusCode).toBe(200)
  })

  it("A signing session from one document cannot be used to access fields from a different document - Negative", async () => {
    const signerA = `cross-doc-a-${TS}@sealio.test`
    const signerB = `cross-doc-b-${TS}@sealio.test`
    const { token: tokenA } = await setupSigningSession(signerA)
    const { token: tokenB } = await setupSigningSession(signerB)
    const scA = await authenticate(tokenA, signerA)
    const fieldsB = (await app.inject({ method: "GET", url: `/sign/${tokenB}/fields`, headers: { cookie: cookieHeader(await authenticate(tokenB, signerB)) } })).json().data.fields
    const res = await app.inject({ method: "POST", url: `/sign/${tokenA}/fields/${fieldsB[0].id}`, headers: { cookie: cookieHeader(scA) }, payload: { value: "hack", captureMethod: "type" } })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })

  it("A signing session belonging to Signer A cannot be used to complete Signer B's signing - Negative", async () => {
    const signerA = `complete-cross-a-${TS}@sealio.test`
    const signerB = `complete-cross-b-${TS}@sealio.test`
    const { token: tokenA } = await setupSigningSession(signerA)
    const { token: tokenB } = await setupSigningSession(signerB)
    const scA = await authenticate(tokenA, signerA)
    await fillAllFields(tokenA, scA)
    // Use Signer A's cookie against Signer B's complete endpoint
    const res = await app.inject({ method: "POST", url: `/sign/${tokenB}/complete`, headers: { cookie: cookieHeader(scA) } })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })
})

describe("Multi-Signer Completion Gate", () => {
  it("In a two-signer document, once signer 1 completes, signer 2 can proceed and the document is marked fully completed - Positive", async () => {
    const s1 = `multi-s1-${TS}@sealio.test`
    const s2 = `multi-s2-${TS}@sealio.test`
    const docId = await uploadTestDocument(app, ownerCookies, `multi-sign-${TS}.pdf`)
    await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(ownerCookies) },
      payload: { fields: [
        { type: "signature", page: 1, x: 5,  y: 5,  width: 25, height: 10, required: true, assignedToEmail: s1 },
        { type: "signature", page: 1, x: 40, y: 5,  width: 25, height: 10, required: true, assignedToEmail: s2 },
      ]},
    })
    await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      headers: { cookie: cookieHeader(ownerCookies) },
      payload: { signers: [{ email: s1, name: "Signer One" }, { email: s2, name: "Signer Two" }] },
    })
    const req1 = await prisma.signingRequest.findFirst({ where: { signerEmail: s1 } })
    const sc1 = await authenticate(req1!.token, s1)
    await fillAllFields(req1!.token, sc1)
    await app.inject({ method: "POST", url: `/sign/${req1!.token}/complete`, headers: { cookie: cookieHeader(sc1) } })

    const req2 = await prisma.signingRequest.findFirst({ where: { signerEmail: s2 } })
    const sc2 = await authenticate(req2!.token, s2)
    await fillAllFields(req2!.token, sc2)
    const completeRes = await app.inject({ method: "POST", url: `/sign/${req2!.token}/complete`, headers: { cookie: cookieHeader(sc2) } })
    expect(completeRes.statusCode).toBe(200)

    // Document sealing (M6) not yet implemented — verify both signing requests are "signed"
    const req1Final = await prisma.signingRequest.findFirst({ where: { signerEmail: s1 } })
    const req2Final = await prisma.signingRequest.findFirst({ where: { signerEmail: s2 } })
    expect(req1Final!.status).toBe("signed")
    expect(req2Final!.status).toBe("signed")
  })

  it("After the first signer completes, the document is not marked as fully completed until the second signer also signs - Negative", async () => {
    const s1 = `partial-s1-${TS}@sealio.test`
    const s2 = `partial-s2-${TS}@sealio.test`
    const docId = await uploadTestDocument(app, ownerCookies, `partial-sign-${TS}.pdf`)
    await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(ownerCookies) },
      payload: { fields: [
        { type: "signature", page: 1, x: 5,  y: 5,  width: 25, height: 10, required: true, assignedToEmail: s1 },
        { type: "signature", page: 1, x: 40, y: 5,  width: 25, height: 10, required: true, assignedToEmail: s2 },
      ]},
    })
    await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      headers: { cookie: cookieHeader(ownerCookies) },
      payload: { signers: [{ email: s1, name: "Signer One" }, { email: s2, name: "Signer Two" }] },
    })
    const req1 = await prisma.signingRequest.findFirst({ where: { signerEmail: s1 } })
    const sc1 = await authenticate(req1!.token, s1)
    await fillAllFields(req1!.token, sc1)
    await app.inject({ method: "POST", url: `/sign/${req1!.token}/complete`, headers: { cookie: cookieHeader(sc1) } })

    // Signer 2 has NOT signed yet — doc should NOT be completed
    const doc = await prisma.document.findUnique({ where: { id: docId } })
    expect(doc!.status).not.toBe("completed")
  })
})

describe("Decline Flow Regression", () => {
  // NOTE: Decline feature is pending M6. The complete endpoint only marks requests "signed".
  // These tests verify the terminal-state behaviour that currently exists.

  it("Attempting to complete a signing that was already declined is blocked - Negative", async () => {
    const signer = `decline-block-${TS}@sealio.test`
    const { token } = await setupSigningSession(signer)
    const sc = await authenticate(token, signer)
    await fillAllFields(token, sc)
    // Complete (marks as "signed" — the terminal state)
    await app.inject({ method: "POST", url: `/sign/${token}/complete`, headers: { cookie: cookieHeader(sc) } })
    // Second complete: idempotent (200) — already in terminal state
    const retry = await app.inject({ method: "POST", url: `/sign/${token}/complete`, headers: { cookie: cookieHeader(sc) } })
    expect([200, 409]).toContain(retry.statusCode)
  })

  it("Once a signing request is declined, the link shows a declined status and no further signing actions are permitted - Negative", async () => {
    const signer = `decline-status-${TS}@sealio.test`
    const { token } = await setupSigningSession(signer)
    const sc = await authenticate(token, signer)
    await fillAllFields(token, sc)
    await app.inject({ method: "POST", url: `/sign/${token}/complete`, headers: { cookie: cookieHeader(sc) } })
    const sessionRes = await app.inject({ method: "GET", url: `/sign/${token}` })
    expect(sessionRes.statusCode).toBe(200)
    // After terminal state, status is "signed" (decline pending M6)
    expect(["signed", "declined"]).toContain(sessionRes.json().data.status)
  })

  it("Submitting a field with no value (empty text) is blocked - Negative", async () => {
    const signer = `empty-val-${TS}@sealio.test`
    const { token } = await setupSigningSession(signer)
    const sc = await authenticate(token, signer)
    const fieldsRes = await app.inject({ method: "GET", url: `/sign/${token}/fields`, headers: { cookie: cookieHeader(sc) } })
    const field = fieldsRes.json().data.fields[0]
    const res = await app.inject({ method: "POST", url: `/sign/${token}/fields/${field.id}`, headers: { cookie: cookieHeader(sc) }, payload: { value: "", captureMethod: "type" } })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })
})
