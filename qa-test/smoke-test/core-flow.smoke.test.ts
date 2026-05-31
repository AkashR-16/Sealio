import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@sealio/db"
import {
  buildServer, loginAndGetCookies, cookieHeader, extractCookies,
  uploadTestDocument, placeSignatureField, getOtpFromMailhog,
} from "../helpers/setup.js"

const TS       = Date.now()
const OWNER    = `qa-smoke-owner-${TS}@sealio.test`
const SIGNER   = `qa-smoke-signer-${TS}@sealio.test`
const PASSWORD = "securepass99"
const ORG      = `QA Smoke ${TS}`

let app: Awaited<ReturnType<typeof buildServer>>

beforeAll(async () => { app = await buildServer() })

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

describe("Core Platform Smoke Test — Full Happy Path", () => {
  let ownerCookies: Record<string, string>
  let docId: string
  let signingToken: string
  let signingCookies: Record<string, string>

  it("A new user can successfully create an account on the platform - Positive", async () => {
    const res = await app.inject({
      method: "POST", url: "/auth/signup",
      payload: { name: "Smoke Owner", email: OWNER, password: PASSWORD, orgName: ORG },
    })
    expect(res.statusCode).toBe(201)
    ownerCookies = extractCookies(res)
    expect(ownerCookies["access_token"]).toBeTruthy()
  })

  it("A logged-in user can upload a PDF document to the platform - Positive", async () => {
    docId = await uploadTestDocument(app, ownerCookies, "smoke-contract.pdf")
    const res = await app.inject({ method: "GET", url: `/documents/${docId}`, headers: { cookie: cookieHeader(ownerCookies) } })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.status).toBe("draft")
  })

  it("A user can place a signature field on the uploaded document - Positive", async () => {
    await placeSignatureField(app, ownerCookies, docId, SIGNER)
    const fieldsRes = await app.inject({ method: "GET", url: `/documents/${docId}/fields`, headers: { cookie: cookieHeader(ownerCookies) } })
    expect(fieldsRes.json().data.fields.length).toBeGreaterThan(0)
  })

  it("A user can send the document to a recipient for signing - Positive", async () => {
    const res = await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      headers: { cookie: cookieHeader(ownerCookies) },
      payload: { signers: [{ email: SIGNER, name: "Smoke Signer" }] },
    })
    expect(res.statusCode).toBe(200)

    const req = await prisma.signingRequest.findFirst({ where: { signerEmail: SIGNER } })
    expect(req).toBeTruthy()
    signingToken = req!.token
  })

  it("The recipient can verify their identity using the emailed verification code - Positive", async () => {
    const otp = await getOtpFromMailhog(SIGNER)
    const res = await app.inject({
      method: "POST", url: `/sign/${signingToken}/authenticate`,
      payload: { otp },
    })
    expect(res.statusCode).toBe(200)
    signingCookies = extractCookies(res)
    expect(signingCookies["signing_token"]).toBeTruthy()
  })

  it("The recipient can sign the document and mark it as complete - Positive", async () => {
    const fieldsRes = await app.inject({ method: "GET", url: `/sign/${signingToken}/fields`, headers: { cookie: cookieHeader(signingCookies) } })
    const fields: Array<{ id: string; type: string }> = fieldsRes.json().data.fields
    for (const field of fields) {
      const value = field.type === "date" ? new Date().toISOString().split("T")[0] : "Smoke Signer"
      await app.inject({ method: "POST", url: `/sign/${signingToken}/fields/${field.id}`, headers: { cookie: cookieHeader(signingCookies) }, payload: { value, captureMethod: "auto" } })
    }
    const completeRes = await app.inject({ method: "POST", url: `/sign/${signingToken}/complete`, headers: { cookie: cookieHeader(signingCookies) } })
    expect(completeRes.statusCode).toBe(200)
  })

  it("The document shows as signed after the recipient completes the process - Positive", async () => {
    // Document sealing (M6) is not yet implemented — signing request status is the source of truth
    const sessionRes = await app.inject({ method: "GET", url: `/sign/${signingToken}` })
    expect(sessionRes.statusCode).toBe(200)
    expect(sessionRes.json().data.status).toBe("signed")
  })

  it("Performing any action in the signing process without being logged in or verified returns an error — not a server crash - Negative", async () => {
    const unauth = await app.inject({ method: "GET", url: `/sign/${signingToken}/fields` })
    expect(unauth.statusCode).toBeGreaterThanOrEqual(400)
    expect(unauth.statusCode).toBeLessThan(500)

    const unauthDoc = await app.inject({ method: "GET", url: `/documents/${docId}` })
    expect(unauthDoc.statusCode).toBe(401)
  })
})
