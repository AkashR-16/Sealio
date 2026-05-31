import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@sealio/db"
import { buildServer, MINI_PDF, loginAndGetCookies, cookieHeader, uploadTestDocument } from "../helpers/setup.js"

const TS = Date.now()
const EMAIL = `qa-field-unit-${TS}@sealio.test`
const PASSWORD = "securepass99"
const ORG = `QA Field Unit ${TS}`
const SIGNER = `signer-${TS}@sealio.test`

let app: Awaited<ReturnType<typeof buildServer>>
let cookies: Record<string, string>
let docId: string

beforeAll(async () => {
  app = await buildServer()
  await app.inject({
    method: "POST", url: "/auth/signup",
    payload: { name: "QA Field User", email: EMAIL, password: PASSWORD, orgName: ORG },
  })
  cookies = await loginAndGetCookies(app, EMAIL, PASSWORD)
  docId = await uploadTestDocument(app, cookies)
})

afterAll(async () => {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } })
  if (user) {
    await prisma.documentField.deleteMany({ where: { document: { orgId: user.orgId } } })
    await prisma.document.deleteMany({ where: { orgId: user.orgId } })
    await prisma.user.deleteMany({ where: { orgId: user.orgId } })
    await prisma.organization.deleteMany({ where: { id: user.orgId } })
  }
  await app.close()
  await prisma.$disconnect()
})

// ─── Field Placement ─────────────────────────────────────────────────────────

describe("Field Placement — Save and Retrieve", () => {
  it("A signature field can be placed on a document page and saved successfully - Positive", async () => {
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: {
        fields: [{ type: "signature", page: 1, x: 10, y: 10, width: 30, height: 10, required: true, assignedToEmail: SIGNER }],
      },
    })
    expect(res.statusCode).toBe(200)
    const saved = res.json().data.fields
    expect(saved).toHaveLength(1)
    expect(saved[0].type).toBe("signature")
  })

  it("All seven field types (signature, initials, date, full name, text, checkbox, dropdown) can be placed in one save - Positive", async () => {
    const allTypes = ["signature", "initials", "date", "full_name", "text", "checkbox", "dropdown"]
    const fields = allTypes.map((type, i) => ({
      type, page: 1, x: i * 10, y: i * 10, width: 20, height: 8, required: true, assignedToEmail: SIGNER,
    }))
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.fields).toHaveLength(7)
  })

  it("Saving fields again completely replaces the previous set of fields on the document - Positive", async () => {
    // First save: 3 fields
    await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [
        { type: "signature", page: 1, x: 5,  y: 5,  width: 20, height: 8, required: true, assignedToEmail: SIGNER },
        { type: "date",      page: 1, x: 30, y: 5,  width: 20, height: 8, required: true, assignedToEmail: SIGNER },
        { type: "text",      page: 1, x: 55, y: 5,  width: 20, height: 8, required: true, assignedToEmail: SIGNER },
      ]},
    })
    // Second save: 1 field only
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [
        { type: "initials", page: 1, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: SIGNER },
      ]},
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.fields).toHaveLength(1)
    expect(res.json().data.fields[0].type).toBe("initials")
  })

  it("All previously saved fields can be retrieved from a document - Positive", async () => {
    await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [
        { type: "checkbox", page: 1, x: 5, y: 5, width: 10, height: 8, required: false, assignedToEmail: SIGNER },
      ]},
    })
    const res = await app.inject({
      method: "GET", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
    })
    expect(res.statusCode).toBe(200)
    const fields = res.json().data.fields
    expect(Array.isArray(fields)).toBe(true)
    expect(fields[0].type).toBe("checkbox")
  })

  it("A field can be marked as optional, allowing signers to skip it - Positive", async () => {
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [
        { type: "text", page: 1, x: 5, y: 5, width: 30, height: 8, required: false, assignedToEmail: SIGNER },
      ]},
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.fields[0].required).toBe(false)
  })
})

// ─── Validation ───────────────────────────────────────────────────────────────

describe("Field Placement — Validation", () => {
  it("Placing a field with an unrecognised type is blocked - Negative", async () => {
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [{ type: "unknown_type", page: 1, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: SIGNER }] },
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })

  it("Placing a field that overflows the right edge of the page is blocked - Negative", async () => {
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [{ type: "signature", page: 1, x: 80, y: 10, width: 30, height: 10, required: true, assignedToEmail: SIGNER }] },
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })

  it("Placing a field that overflows the bottom edge of the page is blocked - Negative", async () => {
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [{ type: "signature", page: 1, x: 10, y: 80, width: 10, height: 30, required: true, assignedToEmail: SIGNER }] },
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })

  it("Placing a field on page number zero (pages start at 1) is blocked - Negative", async () => {
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [{ type: "signature", page: 0, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: SIGNER }] },
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })

  it("Placing fields on a document without being logged in is blocked - Negative", async () => {
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      payload: { fields: [{ type: "signature", page: 1, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: SIGNER }] },
    })
    expect(res.statusCode).toBe(401)
  })
})
