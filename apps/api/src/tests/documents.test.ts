import { describe, it, expect, beforeAll, afterAll } from "vitest"
import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import multipart from "@fastify/multipart"
import { jwtPlugin } from "../plugins/jwt.js"
import { authRoutes } from "../routes/auth.js"
import { documentRoutes } from "../routes/documents.js"
import { fieldRoutes } from "../routes/fields.js"
import { prisma } from "@sealio/db"

// Minimal valid PDF (isPdf checks first 4 bytes: %PDF)
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\n" +
    "xref\n0 4\n0000000000 65535 f \n" +
    "trailer<</Size 4/Root 1 0 R>>\nstartxref\n9\n%%EOF",
)

const TEST_EMAIL = `test-docs-${Date.now()}@sealio.test`
const TEST_PASSWORD = "testpassword123"

async function buildServer() {
  const app = Fastify({ logger: false })
  await app.register(cookie, { secret: "test-secret-32-chars-placeholder!" })
  await app.register(cors, { origin: true, credentials: true })
  await app.register(jwtPlugin)
  await app.register(authRoutes)
  await app.register(documentRoutes)
  await app.register(fieldRoutes)
  return app
}

function makeMultipart(fileBuffer: Buffer, filename: string) {
  const boundary = "----TestBoundary" + Date.now()
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

let app: Awaited<ReturnType<typeof buildServer>>
let accessToken: string
let createdDocId: string

beforeAll(async () => {
  app = await buildServer()
  await app.ready()

  // Sign up → get access token
  const res = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: {
      name: "Doc Test User",
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      orgName: `Docs Test Org ${Date.now()}`,
    },
  })
  expect(res.statusCode).toBe(201)
  const cookies = res.headers["set-cookie"] as string[]
  const tokenCookie = cookies.find((c) => c.startsWith("access_token="))!
  accessToken = tokenCookie.split(";")[0].replace("access_token=", "")
})

afterAll(async () => {
  await prisma.documentField.deleteMany({
    where: { document: { creator: { email: TEST_EMAIL } } },
  })
  await prisma.document.deleteMany({
    where: { creator: { email: TEST_EMAIL } },
  })
  await prisma.user.deleteMany({ where: { email: TEST_EMAIL } })
  await prisma.organization.deleteMany({ where: { users: { none: {} } } })
  await app.close()
  await prisma.$disconnect()
})

// ─── Document upload ────────────────────────────────────────────────────────

describe("POST /documents", () => {
  it("uploads a PDF and returns document record", async () => {
    const { body, contentType } = makeMultipart(MINIMAL_PDF, "test-contract.pdf")

    const res = await app.inject({
      method: "POST",
      url: "/documents?title=Test+Contract",
      headers: { "content-type": contentType, cookie: `access_token=${accessToken}` },
      payload: body,
    })

    expect(res.statusCode).toBe(201)
    const doc = res.json().data
    expect(doc.title).toBe("Test Contract")
    expect(doc.status).toBe("draft")
    expect(doc.hashSha256).toBeTruthy()
    createdDocId = doc.id
  })

  it("rejects a duplicate upload with 409", async () => {
    const { body, contentType } = makeMultipart(MINIMAL_PDF, "test-contract.pdf")

    const res = await app.inject({
      method: "POST",
      url: "/documents?title=Duplicate",
      headers: { "content-type": contentType, cookie: `access_token=${accessToken}` },
      payload: body,
    })

    expect(res.statusCode).toBe(409)
    expect(res.json().error.message).toContain("already been uploaded")
  })

  it("rejects non-PDF with 422", async () => {
    const { body, contentType } = makeMultipart(Buffer.from("this is not a pdf"), "fake.pdf")

    const res = await app.inject({
      method: "POST",
      url: "/documents?title=Bad",
      headers: { "content-type": contentType, cookie: `access_token=${accessToken}` },
      payload: body,
    })

    expect(res.statusCode).toBe(422)
  })

  it("rejects unauthenticated upload with 401", async () => {
    const { body, contentType } = makeMultipart(MINIMAL_PDF, "test.pdf")

    const res = await app.inject({
      method: "POST",
      url: "/documents",
      headers: { "content-type": contentType },
      payload: body,
    })

    expect(res.statusCode).toBe(401)
  })
})

// ─── Document list ───────────────────────────────────────────────────────────

describe("GET /documents", () => {
  it("returns paginated list with the uploaded document", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/documents?page=1&limit=20",
      cookies: { access_token: accessToken },
    })

    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data.documents.length).toBeGreaterThan(0)
    expect(body.data.total).toBeGreaterThan(0)
    expect(body.data.page).toBe(1)
  })

  it("rejects unauthenticated request with 401", async () => {
    const res = await app.inject({ method: "GET", url: "/documents" })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Document get ────────────────────────────────────────────────────────────

describe("GET /documents/:id", () => {
  it("returns document detail for owner", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/documents/${createdDocId}`,
      cookies: { access_token: accessToken },
    })

    expect(res.statusCode).toBe(200)
    const doc = res.json().data
    expect(doc.id).toBe(createdDocId)
    expect(doc.status).toBe("draft")
  })

  it("returns 404 for unknown document id", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/documents/nonexistent-id-xyz",
      cookies: { access_token: accessToken },
    })

    expect(res.statusCode).toBe(404)
  })
})

// ─── Document file stream ────────────────────────────────────────────────────

describe("GET /documents/:id/file", () => {
  it("streams PDF bytes with content-type application/pdf", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/documents/${createdDocId}/file`,
      cookies: { access_token: accessToken },
    })

    expect(res.statusCode).toBe(200)
    expect(res.headers["content-type"]).toContain("application/pdf")
    // Response body starts with %PDF
    expect(res.rawPayload.slice(0, 4).toString()).toBe("%PDF")
  })

  it("returns 401 without auth", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/documents/${createdDocId}/file`,
    })
    expect(res.statusCode).toBe(401)
  })
})

// ─── Fields PUT ──────────────────────────────────────────────────────────────

const VALID_FIELDS = [
  {
    type: "signature",
    page: 1,
    x: 10,
    y: 20,
    width: 20,
    height: 6,
    required: true,
    assignedToEmail: "signer@example.com",
  },
  {
    type: "date",
    page: 1,
    x: 50,
    y: 20,
    width: 14,
    height: 4,
    required: true,
    assignedToEmail: "signer@example.com",
  },
]

describe("PUT /documents/:id/fields", () => {
  it("saves fields and returns them with ids", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/documents/${createdDocId}/fields`,
      cookies: { access_token: accessToken },
      payload: { fields: VALID_FIELDS },
    })

    expect(res.statusCode).toBe(200)
    const saved = res.json().data.fields
    expect(saved).toHaveLength(2)
    expect(saved[0].type).toBe("signature")
    expect(saved[0].id).toBeTruthy()
    expect(saved[1].type).toBe("date")
  })

  it("replaces all fields atomically on second PUT", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/documents/${createdDocId}/fields`,
      cookies: { access_token: accessToken },
      payload: {
        fields: [
          {
            type: "initials",
            page: 2,
            x: 5,
            y: 5,
            width: 10,
            height: 5,
            required: false,
            assignedToEmail: "other@example.com",
          },
        ],
      },
    })

    expect(res.statusCode).toBe(200)
    const saved = res.json().data.fields
    // Only 1 field — previous 2 replaced
    expect(saved).toHaveLength(1)
    expect(saved[0].type).toBe("initials")
  })

  it("rejects invalid field type with 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/documents/${createdDocId}/fields`,
      cookies: { access_token: accessToken },
      payload: {
        fields: [
          {
            type: "INVALID_TYPE",
            page: 1,
            x: 10,
            y: 10,
            width: 10,
            height: 4,
            required: true,
            assignedToEmail: "signer@example.com",
          },
        ],
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it("rejects x/y out of bounds with 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/documents/${createdDocId}/fields`,
      cookies: { access_token: accessToken },
      payload: {
        fields: [
          {
            type: "text",
            page: 1,
            x: 150, // > 100
            y: 10,
            width: 10,
            height: 4,
            required: true,
            assignedToEmail: "signer@example.com",
          },
        ],
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it("accepts empty assignedToEmail for unassigned draft fields", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/documents/${createdDocId}/fields`,
      cookies: { access_token: accessToken },
      payload: {
        fields: [
          {
            type: "text",
            page: 1,
            x: 10,
            y: 10,
            width: 10,
            height: 4,
            required: true,
            assignedToEmail: "",
          },
        ],
      },
    })

    expect(res.statusCode).toBe(200)
  })

  it("rejects a malformed (non-empty, non-email) assignedToEmail with 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/documents/${createdDocId}/fields`,
      cookies: { access_token: accessToken },
      payload: {
        fields: [
          {
            type: "text",
            page: 1,
            x: 10,
            y: 10,
            width: 10,
            height: 4,
            required: true,
            assignedToEmail: "not-an-email",
          },
        ],
      },
    })

    expect(res.statusCode).toBe(400)
  })

  it("returns 404 for unknown document", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/documents/nonexistent-id/fields",
      cookies: { access_token: accessToken },
      payload: { fields: [] },
    })

    expect(res.statusCode).toBe(404)
  })

  it("rejects unauthenticated request with 401", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/documents/${createdDocId}/fields`,
      payload: { fields: [] },
    })

    expect(res.statusCode).toBe(401)
  })
})

// ─── Fields GET ──────────────────────────────────────────────────────────────

describe("GET /documents/:id/fields", () => {
  it("returns current saved fields", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/documents/${createdDocId}/fields`,
      cookies: { access_token: accessToken },
    })

    expect(res.statusCode).toBe(200)
    const fields = res.json().data.fields
    expect(Array.isArray(fields)).toBe(true)
    expect(fields.length).toBeGreaterThan(0)
  })

  it("returns 404 for unknown document", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/documents/nonexistent-id/fields",
      cookies: { access_token: accessToken },
    })

    expect(res.statusCode).toBe(404)
  })

  it("rejects unauthenticated request with 401", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/documents/${createdDocId}/fields`,
    })

    expect(res.statusCode).toBe(401)
  })
})

// ─── AI detect-fields stub ───────────────────────────────────────────────────

describe("POST /documents/:id/detect-fields", () => {
  it("returns empty fields array (stub)", async () => {
    const res = await app.inject({
      method: "POST",
      url: `/documents/${createdDocId}/detect-fields`,
      cookies: { access_token: accessToken },
    })

    expect(res.statusCode).toBe(200)
    expect(res.json().data.fields).toEqual([])
  })
})
