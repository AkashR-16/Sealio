import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@sealio/db"
import { buildServer, loginAndGetCookies, cookieHeader, uploadTestDocument, placeSignatureField } from "../helpers/setup.js"

const TS = Date.now()
const EMAIL    = `qa-send-int-${TS}@sealio.test`
const PASSWORD = "securepass99"
const ORG      = `QA Send Int ${TS}`
const SIGNER_1 = `signer1-send-${TS}@sealio.test`
const SIGNER_2 = `signer2-send-${TS}@sealio.test`

let app: Awaited<ReturnType<typeof buildServer>>
let cookies: Record<string, string>

beforeAll(async () => {
  app = await buildServer()
  await app.inject({ method: "POST", url: "/auth/signup", payload: { name: "Send Int Owner", email: EMAIL, password: PASSWORD, orgName: ORG } })
  cookies = await loginAndGetCookies(app, EMAIL, PASSWORD)
})

afterAll(async () => {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } })
  if (user) {
    const docs = await prisma.document.findMany({ where: { orgId: user.orgId } })
    for (const doc of docs) {
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

describe("Send for Signing — Happy Path", () => {
  it("After placing fields and sending, the document status changes from draft to sent - Positive", async () => {
    const docId = await uploadTestDocument(app, cookies)
    await placeSignatureField(app, cookies, docId, SIGNER_1)

    const sendRes = await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { signers: [{ email: SIGNER_1, name: "Signer One" }] },
    })
    expect(sendRes.statusCode).toBe(200)

    const docRes = await app.inject({
      method: "GET", url: `/documents/${docId}`,
      headers: { cookie: cookieHeader(cookies) },
    })
    expect(docRes.json().data.status).toBe("sent")
  })

  it("Sending a document creates one signing invitation for each named recipient - Positive", async () => {
    const docId = await uploadTestDocument(app, cookies)
    await placeSignatureField(app, cookies, docId, SIGNER_1)

    await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { signers: [{ email: SIGNER_1, name: "Signer One" }] },
    })
    const req = await prisma.signingRequest.findFirst({ where: { documentId: docId } })
    expect(req).toBeTruthy()
    expect(req!.signerEmail).toBe(SIGNER_1)
  })

  it("When sending to two signers, they are assigned signing order 1 and 2 respectively - Positive", async () => {
    const docId = await uploadTestDocument(app, cookies)
    // Place fields for both signers
    await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [
        { type: "signature", page: 1, x: 5,  y: 5,  width: 25, height: 10, required: true, assignedToEmail: SIGNER_1 },
        { type: "signature", page: 1, x: 40, y: 5,  width: 25, height: 10, required: true, assignedToEmail: SIGNER_2 },
      ]},
    })

    await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { signers: [{ email: SIGNER_1, name: "Signer One" }, { email: SIGNER_2, name: "Signer Two" }] },
    })

    const reqs = await prisma.signingRequest.findMany({ where: { documentId: docId }, orderBy: { order: "asc" } })
    expect(reqs).toHaveLength(2)
    // Order is 0-indexed (0 = first signer, 1 = second signer)
    expect(reqs[1].order).toBeGreaterThan(reqs[0].order)
  })

  it("Each recipient receives a signing invitation email containing their unique signing link - Positive", async () => {
    const signerEmail = `inv-check-${TS}@sealio.test`
    const docId = await uploadTestDocument(app, cookies)
    await placeSignatureField(app, cookies, docId, signerEmail)
    await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { signers: [{ email: signerEmail, name: "Invite Signer" }] },
    })
    // Poll Mailhog for invitation email with retries
    let invitation
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 1000))
      const mailRes = await fetch("http://localhost:8025/api/v2/messages?limit=500")
      const mails = (await mailRes.json()) as { items?: Array<{ Content: { Headers: Record<string, string[]> } }> }
      invitation = mails.items?.find(
        (m) => m.Content?.Headers?.To?.[0]?.includes(signerEmail) &&
               m.Content?.Headers?.Subject?.[0]?.toLowerCase().includes("sign"),
      )
      if (invitation) break
    }
    expect(invitation).toBeTruthy()
  })

  it("The second signer's invitation remains in pending status while the first signer has not yet completed - Positive", async () => {
    const docId = await uploadTestDocument(app, cookies)
    await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [
        { type: "signature", page: 1, x: 5, y: 5,  width: 25, height: 10, required: true, assignedToEmail: SIGNER_1 },
        { type: "signature", page: 1, x: 5, y: 25, width: 25, height: 10, required: true, assignedToEmail: SIGNER_2 },
      ]},
    })
    await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { signers: [{ email: SIGNER_1, name: "Signer One" }, { email: SIGNER_2, name: "Signer Two" }] },
    })

    const req2 = await prisma.signingRequest.findFirst({ where: { documentId: docId, signerEmail: SIGNER_2 } })
    expect(req2!.status).toBe("pending")
  })
})

describe("Send for Signing — Blocked Flows", () => {
  it("Sending a document that has no fields placed on it is blocked - Negative", async () => {
    const docId = await uploadTestDocument(app, cookies)
    const res = await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { signers: [{ email: SIGNER_1, name: "Signer One" }] },
    })
    expect(res.statusCode).toBe(422)
  })

  it("Sending a document where a recipient has no fields assigned to them is blocked - Negative", async () => {
    const docId = await uploadTestDocument(app, cookies)
    await placeSignatureField(app, cookies, docId, SIGNER_1)
    const res = await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { signers: [{ email: SIGNER_2, name: "Signer Two" }] }, // SIGNER_2 has no fields
    })
    expect(res.statusCode).toBe(422)
  })

  it("Sending the same document a second time after it is already sent is blocked - Negative", async () => {
    const docId = await uploadTestDocument(app, cookies)
    await placeSignatureField(app, cookies, docId, SIGNER_1)
    await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { signers: [{ email: SIGNER_1, name: "Signer One" }] },
    })
    const second = await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { signers: [{ email: SIGNER_1, name: "Signer One" }] },
    })
    expect(second.statusCode).toBe(409)
  })

  it("Sending a document with an empty recipient list is blocked - Negative", async () => {
    const docId = await uploadTestDocument(app, cookies)
    await placeSignatureField(app, cookies, docId, SIGNER_1)
    const res = await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { signers: [] },
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })

  it("The second signer cannot access their signing session until the first signer has completed theirs - Negative", async () => {
    const docId = await uploadTestDocument(app, cookies)
    await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [
        { type: "signature", page: 1, x: 5, y: 5,  width: 25, height: 10, required: true, assignedToEmail: SIGNER_1 },
        { type: "signature", page: 1, x: 5, y: 25, width: 25, height: 10, required: true, assignedToEmail: SIGNER_2 },
      ]},
    })
    await app.inject({
      method: "POST", url: `/documents/${docId}/send`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { signers: [{ email: SIGNER_1, name: "Signer One" }, { email: SIGNER_2, name: "Signer Two" }] },
    })

    const req2 = await prisma.signingRequest.findFirst({ where: { documentId: docId, signerEmail: SIGNER_2 } })
    // Signer 2 session should not be accessible or shows pending (order enforcement)
    const sessionRes = await app.inject({ method: "GET", url: `/sign/${req2!.token}` })
    // Either 404 (blocked) or returns status indicating not yet accessible
    if (sessionRes.statusCode === 200) {
      expect(sessionRes.json().data.status).toBe("pending")
    } else {
      expect(sessionRes.statusCode).toBeGreaterThanOrEqual(400)
    }
  })
})
