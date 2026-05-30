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

const MINIMAL_PDF = Buffer.from(
  "%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/MediaBox[0 0 612 792]>>endobj\n" +
    "xref\n0 4\n0000000000 65535 f \n" +
    "trailer<</Size 4/Root 1 0 R>>\nstartxref\n9\n%%EOF",
)

// Real JPEG magic bytes
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46])
// Real PNG magic bytes
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
// ZIP/PK magic bytes (same header as DOCX)
const ZIP_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00])

const ORG_A_EMAIL = `edge-org-a-${Date.now()}@sealio.test`
const ORG_B_EMAIL = `edge-org-b-${Date.now()}@sealio.test`
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

function makeMultipart(fileBuffer: Buffer, filename: string, contentType = "application/pdf") {
  const boundary = "----EdgeBoundary" + Date.now()
  const body = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
    ),
    fileBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  return { body, contentType: `multipart/form-data; boundary=${boundary}` }
}

let app: Awaited<ReturnType<typeof buildServer>>
let tokenA: string
let tokenB: string
let docIdA: string  // document owned by Org A

beforeAll(async () => {
  app = await buildServer()
  await app.ready()

  // Sign up Org A
  const resA = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { name: "User A", email: ORG_A_EMAIL, password: TEST_PASSWORD, orgName: `Edge Org A ${Date.now()}` },
  })
  expect(resA.statusCode).toBe(201)
  const cookiesA = resA.headers["set-cookie"] as string[]
  tokenA = cookiesA.find((c) => c.startsWith("access_token="))!.split(";")[0].replace("access_token=", "")

  // Sign up Org B
  const resB = await app.inject({
    method: "POST",
    url: "/auth/signup",
    payload: { name: "User B", email: ORG_B_EMAIL, password: TEST_PASSWORD, orgName: `Edge Org B ${Date.now()}` },
  })
  expect(resB.statusCode).toBe(201)
  const cookiesB = resB.headers["set-cookie"] as string[]
  tokenB = cookiesB.find((c) => c.startsWith("access_token="))!.split(";")[0].replace("access_token=", "")

  // Upload a document as Org A
  const { body, contentType } = makeMultipart(MINIMAL_PDF, "edge-test.pdf")
  const uploadRes = await app.inject({
    method: "POST",
    url: "/documents?title=Edge+Test+Doc",
    headers: { "content-type": contentType, cookie: `access_token=${tokenA}` },
    payload: body,
  })
  expect(uploadRes.statusCode).toBe(201)
  docIdA = uploadRes.json().data.id
})

afterAll(async () => {
  await prisma.documentField.deleteMany({ where: { document: { creator: { email: ORG_A_EMAIL } } } })
  await prisma.document.deleteMany({ where: { creator: { email: ORG_A_EMAIL } } })
  await prisma.user.deleteMany({ where: { email: { in: [ORG_A_EMAIL, ORG_B_EMAIL] } } })
  await prisma.organization.deleteMany({ where: { users: { none: {} } } })
  await app.close()
  await prisma.$disconnect()
})

// ─── Cross-org isolation ───────────────────────────────────────────────────────

describe("Cross-org isolation", () => {
  it("Org B cannot GET Org A's document (404 not 403)", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/documents/${docIdA}`,
      cookies: { access_token: tokenB },
    })
    // Must not leak document existence to foreign org
    expect(res.statusCode).toBe(404)
  })

  it("Org B cannot GET Org A's document file", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/documents/${docIdA}/file`,
      cookies: { access_token: tokenB },
    })
    expect(res.statusCode).toBe(404)
  })

  it("Org B cannot PUT fields on Org A's document", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/documents/${docIdA}/fields`,
      cookies: { access_token: tokenB },
      payload: {
        fields: [
          { type: "signature", page: 1, x: 10, y: 10, width: 20, height: 6, required: true, assignedToEmail: "" },
        ],
      },
    })
    expect(res.statusCode).toBe(404)
  })

  it("Org B cannot GET fields on Org A's document", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/documents/${docIdA}/fields`,
      cookies: { access_token: tokenB },
    })
    expect(res.statusCode).toBe(404)
  })

  it("Org A's document does NOT appear in Org B's document list", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/documents?page=1&limit=100",
      cookies: { access_token: tokenB },
    })
    expect(res.statusCode).toBe(200)
    const ids = res.json().data.documents.map((d: { id: string }) => d.id)
    expect(ids).not.toContain(docIdA)
  })
})

// ─── Field bounds refine validation ───────────────────────────────────────────

describe("Field bounds validation (x + width ≤ 100, y + height ≤ 100)", () => {
  it("rejects x=90, width=20 (sum=110) with 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/documents/${docIdA}/fields`,
      cookies: { access_token: tokenA },
      payload: {
        fields: [{ type: "text", page: 1, x: 90, y: 10, width: 20, height: 4, required: true, assignedToEmail: "" }],
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toContain("width")
  })

  it("rejects y=95, height=10 (sum=105) with 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/documents/${docIdA}/fields`,
      cookies: { access_token: tokenA },
      payload: {
        fields: [{ type: "text", page: 1, x: 10, y: 95, width: 10, height: 10, required: true, assignedToEmail: "" }],
      },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().error.message).toContain("height")
  })

  it("accepts x=80, width=20 (sum=100 exactly) with 200", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/documents/${docIdA}/fields`,
      cookies: { access_token: tokenA },
      payload: {
        fields: [{ type: "text", page: 1, x: 80, y: 10, width: 20, height: 4, required: true, assignedToEmail: "" }],
      },
    })
    expect(res.statusCode).toBe(200)
  })

  it("accepts y=90, height=10 (sum=100 exactly) with 200", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/documents/${docIdA}/fields`,
      cookies: { access_token: tokenA },
      payload: {
        fields: [{ type: "text", page: 1, x: 10, y: 90, width: 10, height: 10, required: true, assignedToEmail: "" }],
      },
    })
    expect(res.statusCode).toBe(200)
  })

  it("rejects x=0, width=101 with 400", async () => {
    const res = await app.inject({
      method: "PUT",
      url: `/documents/${docIdA}/fields`,
      cookies: { access_token: tokenA },
      payload: {
        fields: [{ type: "text", page: 1, x: 0, y: 0, width: 101, height: 4, required: true, assignedToEmail: "" }],
      },
    })
    // width > 100 also fails the Zod max(100) before refine
    expect(res.statusCode).toBe(400)
  })
})

// ─── Non-PDF binary upload rejection ──────────────────────────────────────────

describe("Non-PDF binary uploads rejected with 422", () => {
  it("rejects JPEG (FF D8 FF magic bytes) with 422", async () => {
    const { body, contentType } = makeMultipart(JPEG_BYTES, "photo.pdf")
    const res = await app.inject({
      method: "POST",
      url: "/documents?title=JPEG+Test",
      headers: { "content-type": contentType, cookie: `access_token=${tokenA}` },
      payload: body,
    })
    expect(res.statusCode).toBe(422)
  })

  it("rejects PNG (89 50 4E 47 magic bytes) with 422", async () => {
    const { body, contentType } = makeMultipart(PNG_BYTES, "image.pdf")
    const res = await app.inject({
      method: "POST",
      url: "/documents?title=PNG+Test",
      headers: { "content-type": contentType, cookie: `access_token=${tokenA}` },
      payload: body,
    })
    expect(res.statusCode).toBe(422)
  })

  it("rejects ZIP/DOCX (PK magic bytes) with 422", async () => {
    const { body, contentType } = makeMultipart(ZIP_BYTES, "document.pdf")
    const res = await app.inject({
      method: "POST",
      url: "/documents?title=ZIP+Test",
      headers: { "content-type": contentType, cookie: `access_token=${tokenA}` },
      payload: body,
    })
    expect(res.statusCode).toBe(422)
  })

  it("rejects empty file with 422", async () => {
    const { body, contentType } = makeMultipart(Buffer.alloc(0), "empty.pdf")
    const res = await app.inject({
      method: "POST",
      url: "/documents?title=Empty+Test",
      headers: { "content-type": contentType, cookie: `access_token=${tokenA}` },
      payload: body,
    })
    expect(res.statusCode).toBe(422)
  })

  it("rejects plain text with 422", async () => {
    const { body, contentType } = makeMultipart(Buffer.from("hello world this is text"), "text.pdf")
    const res = await app.inject({
      method: "POST",
      url: "/documents?title=Text+Test",
      headers: { "content-type": contentType, cookie: `access_token=${tokenA}` },
      payload: body,
    })
    expect(res.statusCode).toBe(422)
  })
})

// ─── Empty fields array clears all fields ─────────────────────────────────────

describe("Empty fields array atomically clears all fields", () => {
  it("saves two fields, then empty array PUT returns zero fields", async () => {
    // First, save two fields
    const putRes = await app.inject({
      method: "PUT",
      url: `/documents/${docIdA}/fields`,
      cookies: { access_token: tokenA },
      payload: {
        fields: [
          { type: "signature", page: 1, x: 10, y: 10, width: 20, height: 6, required: true, assignedToEmail: "a@example.com" },
          { type: "date",      page: 1, x: 50, y: 10, width: 14, height: 4, required: true, assignedToEmail: "a@example.com" },
        ],
      },
    })
    expect(putRes.statusCode).toBe(200)
    expect(putRes.json().data.fields).toHaveLength(2)

    // Now clear with empty array
    const clearRes = await app.inject({
      method: "PUT",
      url: `/documents/${docIdA}/fields`,
      cookies: { access_token: tokenA },
      payload: { fields: [] },
    })
    expect(clearRes.statusCode).toBe(200)
    expect(clearRes.json().data.fields).toHaveLength(0)

    // GET confirms zero fields
    const getRes = await app.inject({
      method: "GET",
      url: `/documents/${docIdA}/fields`,
      cookies: { access_token: tokenA },
    })
    expect(getRes.statusCode).toBe(200)
    expect(getRes.json().data.fields).toHaveLength(0)
  })
})

// ─── Sequential saves: second PUT replaces first ───────────────────────────────

describe("Sequential saves: second PUT always replaces first", () => {
  it("first PUT saves signature field, second PUT replaces with date field", async () => {
    const base = { method: "PUT" as const, url: `/documents/${docIdA}/fields`, cookies: { access_token: tokenA } }

    const res1 = await app.inject({
      ...base,
      payload: { fields: [{ type: "signature", page: 1, x: 10, y: 10, width: 20, height: 6, required: true, assignedToEmail: "first@example.com" }] },
    })
    expect(res1.statusCode).toBe(200)
    expect(res1.json().data.fields[0].type).toBe("signature")

    const res2 = await app.inject({
      ...base,
      payload: { fields: [{ type: "date", page: 1, x: 50, y: 10, width: 14, height: 4, required: true, assignedToEmail: "second@example.com" }] },
    })
    expect(res2.statusCode).toBe(200)
    expect(res2.json().data.fields[0].type).toBe("date")

    // Final state: only the second save persists
    const getRes = await app.inject({ method: "GET", url: `/documents/${docIdA}/fields`, cookies: { access_token: tokenA } })
    const finalFields = getRes.json().data.fields
    expect(finalFields).toHaveLength(1)
    expect(finalFields[0].type).toBe("date")
  })
})

// ─── Multi-field mixed validity ────────────────────────────────────────────────

describe("Partial field validity: any invalid field rejects the whole batch", () => {
  it("one valid + one overflowing field → 400, no fields saved", async () => {
    const before = await app.inject({
      method: "GET",
      url: `/documents/${docIdA}/fields`,
      cookies: { access_token: tokenA },
    })
    const countBefore = before.json().data.fields.length

    const res = await app.inject({
      method: "PUT",
      url: `/documents/${docIdA}/fields`,
      cookies: { access_token: tokenA },
      payload: {
        fields: [
          // valid
          { type: "text",      page: 1, x: 10, y: 10, width: 20, height: 4, required: true, assignedToEmail: "" },
          // overflows page width: x=90 + width=20 = 110
          { type: "signature", page: 1, x: 90, y: 10, width: 20, height: 6, required: true, assignedToEmail: "" },
        ],
      },
    })

    expect(res.statusCode).toBe(400)

    // Fields unchanged
    const after = await app.inject({
      method: "GET",
      url: `/documents/${docIdA}/fields`,
      cookies: { access_token: tokenA },
    })
    expect(after.json().data.fields.length).toBe(countBefore)
  })
})
