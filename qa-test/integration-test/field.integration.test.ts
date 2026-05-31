import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@sealio/db"
import { buildServer, loginAndGetCookies, cookieHeader, uploadTestDocument } from "../helpers/setup.js"

const TS = Date.now()
const EMAIL   = `qa-field-int-${TS}@sealio.test`
const EMAIL_B = `qa-field-int-b-${TS}@sealio.test`
const PASSWORD = "securepass99"
const ORG   = `QA Field Int ${TS}`
const ORG_B = `QA Field Int B ${TS}`
const SIGNER = `signer-field-${TS}@sealio.test`

let app: Awaited<ReturnType<typeof buildServer>>
let cookies: Record<string, string>
let cookiesB: Record<string, string>
let docId: string

const field = (overrides = {}) => ({
  type: "signature", page: 1, x: 10, y: 10, width: 25, height: 10,
  required: true, assignedToEmail: SIGNER, ...overrides,
})

beforeAll(async () => {
  app = await buildServer()
  await app.inject({ method: "POST", url: "/auth/signup", payload: { name: "Field Int User", email: EMAIL, password: PASSWORD, orgName: ORG } })
  await app.inject({ method: "POST", url: "/auth/signup", payload: { name: "Field Int B",    email: EMAIL_B, password: PASSWORD, orgName: ORG_B } })
  cookies  = await loginAndGetCookies(app, EMAIL, PASSWORD)
  cookiesB = await loginAndGetCookies(app, EMAIL_B, PASSWORD)
  docId = await uploadTestDocument(app, cookies)
})

afterAll(async () => {
  for (const email of [EMAIL, EMAIL_B]) {
    const user = await prisma.user.findUnique({ where: { email } })
    if (user) {
      await prisma.documentField.deleteMany({ where: { document: { orgId: user.orgId } } })
      await prisma.document.deleteMany({ where: { orgId: user.orgId } })
      await prisma.user.deleteMany({ where: { orgId: user.orgId } })
      await prisma.organization.deleteMany({ where: { id: user.orgId } })
    }
  }
  await app.close()
  await prisma.$disconnect()
})

describe("Field Persistence", () => {
  it("Fields saved to a document can be retrieved and all field details are stored correctly - Positive", async () => {
    await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [field({ type: "signature", x: 5, y: 5 })] },
    })
    const res = await app.inject({
      method: "GET", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
    })
    expect(res.statusCode).toBe(200)
    const saved = res.json().data.fields[0]
    expect(saved.type).toBe("signature")
    expect(saved.assignedToEmail).toBe(SIGNER)
    expect(saved.required).toBe(true)
  })

  it("Saving a new set of fields completely replaces the previous set in a single atomic operation - Positive", async () => {
    await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [field({ type: "signature" }), field({ type: "date", y: 25 }), field({ type: "text", y: 40 })] },
    })
    // Replace with just one field
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [field({ type: "checkbox", y: 10 })] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.fields).toHaveLength(1)
    expect(res.json().data.fields[0].type).toBe("checkbox")
  })

  it("Saving an empty list of fields removes all existing fields from the document - Positive", async () => {
    await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [field()] },
    })
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.fields).toHaveLength(0)
  })

  it("Each field correctly records the email address of the signer it is assigned to - Positive", async () => {
    const anotherSigner = `another-${TS}@sealio.test`
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [field({ assignedToEmail: anotherSigner })] },
    })
    expect(res.json().data.fields[0].assignedToEmail).toBe(anotherSigner)
  })

  it("Two fields placed at the same position on the page are both accepted (no position conflict rule) - Positive", async () => {
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [field({ type: "signature" }), field({ type: "initials" })] },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.fields).toHaveLength(2)
  })
})

describe("Field Placement — Blocked Flows", () => {
  it("Attempting to place fields on a document belonging to another organisation is blocked - Negative", async () => {
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookiesB) },
      payload: { fields: [field()] },
    })
    expect(res.statusCode).toBe(404)
  })

  it("Placing a field with a width below the minimum allowed size is blocked - Negative", async () => {
    const res = await app.inject({
      method: "PUT", url: `/documents/${docId}/fields`,
      headers: { cookie: cookieHeader(cookies) },
      payload: { fields: [field({ width: 1 })] },
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })

  it("Attempting to retrieve fields for a document that does not exist returns a not-found response - Negative", async () => {
    const res = await app.inject({
      method: "GET", url: "/documents/does-not-exist-xyz/fields",
      headers: { cookie: cookieHeader(cookies) },
    })
    expect(res.statusCode).toBe(404)
  })
})
