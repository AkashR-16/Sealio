import Fastify from "fastify"
import cors from "@fastify/cors"
import cookie from "@fastify/cookie"
import { prisma } from "@sealio/db"
import { jwtPlugin } from "../../apps/api/src/plugins/jwt.js"
import { authRoutes } from "../../apps/api/src/routes/auth.js"
import { documentRoutes } from "../../apps/api/src/routes/documents.js"
import { fieldRoutes } from "../../apps/api/src/routes/fields.js"
import { sendRoutes } from "../../apps/api/src/routes/send.js"
import { signingRoutes } from "../../apps/api/src/routes/signing.js"
import type { InjectOptions } from "fastify"

// ─── Server Builder ──────────────────────────────────────────────────────────

export async function buildServer() {
  const app = Fastify({ logger: false })
  await app.register(cookie, { secret: "test-secret-32-chars-placeholder!" })
  await app.register(cors, { origin: true, credentials: true })
  await app.register(jwtPlugin)
  await app.register(authRoutes)
  await app.register(documentRoutes)
  await app.register(fieldRoutes)
  await app.register(sendRoutes)
  await app.register(signingRoutes)
  app.get("/health", async () => ({ status: "ok", ts: new Date().toISOString() }))
  await app.ready()
  return app
}

// ─── Minimal Valid PDF (400 bytes) ───────────────────────────────────────────
// A single blank page PDF — used for all document upload tests

const MINI_PDF_B64 =
  "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8" +
  "PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdl" +
  "L01lZGlhQm94WzAgMCA2MTIgNzkyXS9QYXJlbnQgMiAwIFI+PmVuZG9iagp4cmVmCjAgNAowMDAwMDAw" +
  "MDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAw" +
  "MTE1IDAwMDAwIG4gCnRyYWlsZXI8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxOTAKJSVF" +
  "T0Y="

export const MINI_PDF = Buffer.from(MINI_PDF_B64, "base64")

// ─── Cookie Helpers ───────────────────────────────────────────────────────────

export function extractCookies(res: { headers: Record<string, unknown> }): Record<string, string> {
  const raw = res.headers["set-cookie"]
  const list: string[] = Array.isArray(raw) ? raw : raw ? [raw as string] : []
  const result: Record<string, string> = {}
  for (const entry of list) {
    const [pair] = entry.split(";")
    const [key, value] = pair.split("=")
    result[key.trim()] = value?.trim() ?? ""
  }
  return result
}

export function cookieHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ")
}

// ─── Auth Helper ─────────────────────────────────────────────────────────────

export async function loginAndGetCookies(
  app: Awaited<ReturnType<typeof buildServer>>,
  email: string,
  password: string,
): Promise<Record<string, string>> {
  const res = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password },
  })
  return extractCookies(res)
}

// ─── Mailhog OTP Helper ───────────────────────────────────────────────────────

const MAILHOG = "http://localhost:8025"

export async function getOtpFromMailhog(
  signerEmail: string,
  retries = 8,
  delayMs = 1000,
): Promise<string> {
  for (let i = 0; i < retries; i++) {
    await new Promise((r) => setTimeout(r, delayMs))
    try {
      const res = await fetch(`${MAILHOG}/api/v2/messages?limit=500`)
      const data = (await res.json()) as { items?: Array<{ Content: { Headers: Record<string, string[]>; Body: string } }> }
      const mail = data.items?.find(
        (m) =>
          m.Content?.Headers?.Subject?.[0]?.includes("verification code") &&
          m.Content?.Headers?.To?.[0]?.includes(signerEmail),
      )
      const match = mail?.Content?.Body?.match(/\b(\d{6})\b/)
      if (match?.[1]) return match[1]
    } catch {
      // retry
    }
  }
  throw new Error(`OTP not found in Mailhog for ${signerEmail} after ${retries} attempts`)
}

// ─── Direct OTP Setter (bypasses Mailhog for regression tests) ───────────────

export async function setTestOtp(token: string, knownOtp: string): Promise<void> {
  const { hash: bcryptHash } = await import("bcryptjs")
  const hashed = await bcryptHash(knownOtp, 10)
  await prisma.signingRequest.updateMany({
    where: { token },
    data: {
      otpHash: hashed,
      otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      otpAttempts: 0,
    },
  })
}

// ─── Document + Field Setup Helper ───────────────────────────────────────────

export async function uploadTestDocument(
  app: Awaited<ReturnType<typeof buildServer>>,
  cookies: Record<string, string>,
  filename = "test.pdf",
): Promise<string> {
  const boundary = "----TestBoundary"
  // Append a unique comment so every upload has a different SHA-256 hash
  const uniquePdf = Buffer.concat([MINI_PDF, Buffer.from(`%% qa-unique:${Date.now()}-${Math.random()}\n`)])
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/pdf\r\n\r\n`),
    uniquePdf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  const res = await app.inject({
    method: "POST",
    url: "/documents",
    headers: {
      "content-type": `multipart/form-data; boundary=${boundary}`,
      cookie: cookieHeader(cookies),
    },
    payload: body,
  })
  const body2 = res.json()
  if (res.statusCode !== 201) throw new Error(`Upload failed: ${JSON.stringify(body2)}`)
  return body2.data.id as string
}

export async function placeSignatureField(
  app: Awaited<ReturnType<typeof buildServer>>,
  cookies: Record<string, string>,
  docId: string,
  signerEmail: string,
): Promise<string> {
  const res = await app.inject({
    method: "PUT",
    url: `/documents/${docId}/fields`,
    headers: { cookie: cookieHeader(cookies) },
    payload: {
      fields: [
        { type: "signature", page: 1, x: 10, y: 10, width: 30, height: 10, required: true, assignedToEmail: signerEmail },
        { type: "date",      page: 1, x: 10, y: 25, width: 20, height: 8,  required: true, assignedToEmail: signerEmail },
        { type: "full_name", page: 1, x: 10, y: 40, width: 25, height: 8,  required: true, assignedToEmail: signerEmail },
      ],
    },
  })
  if (res.statusCode !== 200) throw new Error(`Field placement failed: ${res.body}`)
  return (res.json().data.fields[0] as { id: string }).id
}
