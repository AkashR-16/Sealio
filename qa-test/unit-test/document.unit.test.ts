import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "@sealio/db"
import { buildServer, MINI_PDF, loginAndGetCookies, extractCookies, cookieHeader } from "../helpers/setup.js"

const TS = Date.now()
const EMAIL = `qa-doc-unit-${TS}@sealio.test`
const PASSWORD = "securepass99"
const ORG = `QA Doc Unit ${TS}`

let app: Awaited<ReturnType<typeof buildServer>>
let cookies: Record<string, string>

function makeMultipart(filename: string, fileBuffer: Buffer, contentType = "application/pdf") {
  const boundary = "----QABoundary"
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

// Each call returns a unique PDF buffer to avoid DUPLICATE_DOCUMENT (409) across tests
function uniquePdf(): Buffer {
  return Buffer.concat([MINI_PDF, Buffer.from(`%% qa-unit:${Date.now()}-${Math.random()}\n`)])
}

beforeAll(async () => {
  app = await buildServer()
  await app.inject({
    method: "POST", url: "/auth/signup",
    payload: { name: "QA Doc User", email: EMAIL, password: PASSWORD, orgName: ORG },
  })
  cookies = await loginAndGetCookies(app, EMAIL, PASSWORD)
})

afterAll(async () => {
  const user = await prisma.user.findUnique({ where: { email: EMAIL } })
  if (user) {
    await prisma.document.deleteMany({ where: { orgId: user.orgId } })
    await prisma.user.deleteMany({ where: { orgId: user.orgId } })
    await prisma.organization.deleteMany({ where: { id: user.orgId } })
  }
  await app.close()
  await prisma.$disconnect()
})

// ─── Upload ───────────────────────────────────────────────────────────────────

describe("Document Upload", () => {
  it("A valid PDF document can be uploaded and a record is created in draft status - Positive", async () => {
    const { body, contentType } = makeMultipart("contract.pdf", uniquePdf())
    const res = await app.inject({
      method: "POST", url: "/documents?title=My+Contract",
      headers: { "content-type": contentType, cookie: cookieHeader(cookies) },
      payload: body,
    })
    expect(res.statusCode).toBe(201)
    const { data } = res.json()
    expect(data.id).toBeTruthy()
    expect(data.status).toBe("draft")
    expect(data.title).toBe("My Contract")
  })

  it("Every uploaded document is assigned a unique security fingerprint to detect duplicates - Positive", async () => {
    const { body, contentType } = makeMultipart("fp-test.pdf", uniquePdf())
    const res = await app.inject({
      method: "POST", url: "/documents",
      headers: { "content-type": contentType, cookie: cookieHeader(cookies) },
      payload: body,
    })
    expect(res.statusCode).toBe(201)
    const { data } = res.json()
    expect(data.hashSha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it("When no title is provided during upload, the original filename is used as the document title - Positive", async () => {
    const { body, contentType } = makeMultipart("my-agreement.pdf", uniquePdf())
    const res = await app.inject({
      method: "POST", url: "/documents",
      headers: { "content-type": contentType, cookie: cookieHeader(cookies) },
      payload: body,
    })
    expect(res.statusCode).toBe(201)
    // Server strips the .pdf extension when deriving title from filename
    expect(res.json().data.title).toBe("my-agreement")
  })

  it("Uploading a non-PDF file (e.g. an image or Word document) is blocked - Negative", async () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(50).fill(0)])
    const { body, contentType } = makeMultipart("image.png", pngHeader)
    const res = await app.inject({
      method: "POST", url: "/documents",
      headers: { "content-type": contentType, cookie: cookieHeader(cookies) },
      payload: body,
    })
    expect(res.statusCode).toBe(422)
  })

  it("Uploading a completely empty file is blocked - Negative", async () => {
    const { body, contentType } = makeMultipart("empty.pdf", Buffer.alloc(0))
    const res = await app.inject({
      method: "POST", url: "/documents",
      headers: { "content-type": contentType, cookie: cookieHeader(cookies) },
      payload: body,
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })

  it("Uploading a file without the correct multipart form format is blocked - Negative", async () => {
    const res = await app.inject({
      method: "POST", url: "/documents",
      headers: { "content-type": "application/json", cookie: cookieHeader(cookies) },
      payload: JSON.stringify({ file: "notafile" }),
    })
    expect(res.statusCode).toBeGreaterThanOrEqual(400)
  })

  it("Uploading a document without being logged in is blocked - Negative", async () => {
    const { body, contentType } = makeMultipart("unauth.pdf", MINI_PDF)
    const res = await app.inject({
      method: "POST", url: "/documents",
      headers: { "content-type": contentType },
      payload: body,
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── List & Retrieve ──────────────────────────────────────────────────────────

describe("Document List and Retrieval", () => {
  let docId: string

  beforeAll(async () => {
    const { body, contentType } = makeMultipart("retrieve-test.pdf", uniquePdf())
    const res = await app.inject({
      method: "POST", url: "/documents",
      headers: { "content-type": contentType, cookie: cookieHeader(cookies) },
      payload: body,
    })
    docId = res.json().data.id
  })

  it("The documents list is returned with page number and total count for navigation - Positive", async () => {
    const res = await app.inject({
      method: "GET", url: "/documents",
      headers: { cookie: cookieHeader(cookies) },
    })
    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(Array.isArray(data.documents)).toBe(true)
    // API returns flat pagination: { documents, page, limit, total, totalPages }
    expect(data.page).toBeDefined()
    expect(data.total).toBeDefined()
  })

  it("Full document information (title, status, dates) can be retrieved by document ID - Positive", async () => {
    const res = await app.inject({
      method: "GET", url: `/documents/${docId}`,
      headers: { cookie: cookieHeader(cookies) },
    })
    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data.id).toBe(docId)
    expect(data.status).toBeDefined()
    expect(data.createdAt).toBeDefined()
  })

  it("A time-limited secure download link is generated for viewing an uploaded document - Positive", async () => {
    const res = await app.inject({
      method: "GET", url: `/documents/${docId}/file`,
      headers: { cookie: cookieHeader(cookies) },
    })
    expect([200, 302]).toContain(res.statusCode)
  })

  it("Requesting a document that does not exist returns a not-found response - Negative", async () => {
    const res = await app.inject({
      method: "GET", url: "/documents/nonexistent-id-xyz",
      headers: { cookie: cookieHeader(cookies) },
    })
    expect(res.statusCode).toBe(404)
  })

  it("Browsing the documents list without being logged in is blocked - Negative", async () => {
    const res = await app.inject({ method: "GET", url: "/documents" })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Field Detection Stub ─────────────────────────────────────────────────────

describe("Automated Field Detection", () => {
  let docId: string

  beforeAll(async () => {
    const { body, contentType } = makeMultipart("detect-test.pdf", uniquePdf())
    const res = await app.inject({
      method: "POST", url: "/documents",
      headers: { "content-type": contentType, cookie: cookieHeader(cookies) },
      payload: body,
    })
    docId = res.json().data.id
  })

  it("Requesting automated field detection returns a response indicating the feature is coming soon - Positive", async () => {
    const res = await app.inject({
      method: "POST", url: `/documents/${docId}/detect-fields`,
      headers: { cookie: cookieHeader(cookies) },
    })
    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(Array.isArray(data.fields)).toBe(true)
    expect(data.fields).toHaveLength(0)
    expect(data.message).toBeTruthy()
  })

  it("Requesting automated field detection without being logged in is blocked - Negative", async () => {
    const res = await app.inject({ method: "POST", url: `/documents/${docId}/detect-fields` })
    expect(res.statusCode).toBe(401)
  })
})
