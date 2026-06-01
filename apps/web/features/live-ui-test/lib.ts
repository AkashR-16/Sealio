// Browser-side helpers for the Live UI Test runner.
// All checks hit the real API at NEXT_PUBLIC_API_URL using the tester's own session.

export const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
export const MAILHOG = "http://localhost:8025"

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function uniqueEmail(): string {
  return `live+${Date.now()}-${Math.random().toString(36).slice(2, 8)}@sealio.test`
}

// ─── Minimal valid PDF (same single-page PDF used by the QA suite) ────────────

const MINI_PDF_B64 =
  "JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8" +
  "PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdl" +
  "L01lZGlhQm94WzAgMCA2MTIgNzkyXS9QYXJlbnQgMiAwIFI+PmVuZG9iagp4cmVmCjAgNAowMDAwMDAw" +
  "MDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA1OCAwMDAwMCBuIAowMDAwMDAw" +
  "MTE1IDAwMDAwIG4gCnRyYWlsZXI8PC9TaXplIDQvUm9vdCAxIDAgUj4+CnN0YXJ0eHJlZgoxOTAKJSVF" +
  "T0Y="

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

/** Build a Blob from byte/string parts (casts around the strict BlobPart lib typing). */
export function blobOf(parts: Array<Uint8Array | ArrayBuffer | string>, type: string): Blob {
  return new Blob(parts as BlobPart[], { type })
}

/** A unique PDF blob each call (appends a comment) so SHA-256 never collides → no 409. */
export function miniPdfBlob(): Blob {
  const base = base64ToBytes(MINI_PDF_B64)
  const tail = new TextEncoder().encode(`\n%% live:${Date.now()}-${Math.random()}\n`)
  return blobOf([base, tail], "application/pdf")
}

/** Two PDF blobs built from the SAME bytes → identical hash (for duplicate-detection checks). */
export function duplicatePdfBlob(seed: string): Blob {
  const base = base64ToBytes(MINI_PDF_B64)
  const tail = new TextEncoder().encode(`\n%% dup:${seed}\n`)
  return blobOf([base, tail], "application/pdf")
}

/** A non-PDF blob (PNG magic header) for invalid-upload checks. */
export function pngBlob(): Blob {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(40).fill(0)])
  return blobOf([bytes], "image/png")
}

// ─── Fetch wrappers ───────────────────────────────────────────────────────────

/** Authenticated request — sends the tester's real session cookie. */
export async function authReq(method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

/** Standalone request — never sends or stores session cookies (keeps tester logged in). */
export async function anonReq(method: string, path: string, body?: unknown, rawBody?: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    credentials: "omit",
    headers: body !== undefined || rawBody !== undefined ? { "Content-Type": "application/json" } : {},
    body: rawBody !== undefined ? rawBody : body !== undefined ? JSON.stringify(body) : undefined,
  })
}

/** Request with an explicit Authorization bearer token (for token-tampering checks). */
export async function bearerReq(method: string, path: string, token: string): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    credentials: "omit",
    headers: { Authorization: `Bearer ${token}` },
  })
}

export async function asJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}))
}

/** Pulls the API's error message out of a failed response body (so logs show *why*, not just the status). */
export async function errBody(res: Response): Promise<string> {
  try {
    const j = await res.clone().json()
    return j?.error?.message ?? j?.message ?? ""
  } catch {
    return (await res.text().catch(() => "")).trim().slice(0, 300)
  }
}

// ─── Shared operations (use the tester's own session) ─────────────────────────

export async function uploadDoc(): Promise<string> {
  const fd = new FormData()
  fd.append("file", miniPdfBlob(), "live-test.pdf")
  const res = await fetch(`${API}/documents`, { method: "POST", credentials: "include", body: fd })
  if (res.status !== 201) {
    const msg = await errBody(res)
    throw new Error(`Upload expected 201, got ${res.status}${msg ? ` — ${msg}` : ""}`)
  }
  const j = await res.json()
  assert(j.data?.id, "Upload response missing document id")
  return j.data.id
}

export async function placeFieldsForSelf(docId: string, email: string): Promise<string[]> {
  const res = await authReq("PUT", `/documents/${docId}/fields`, {
    fields: [
      { type: "signature", page: 1, x: 10, y: 10, width: 30, height: 10, required: true, assignedToEmail: email },
      { type: "date", page: 1, x: 10, y: 25, width: 20, height: 8, required: true, assignedToEmail: email },
      { type: "full_name", page: 1, x: 10, y: 40, width: 25, height: 8, required: true, assignedToEmail: email },
    ],
  })
  assert(res.status === 200, `Place fields expected 200, got ${res.status}`)
  const j = await res.json()
  return (j.data.fields as Array<{ id: string }>).map((f) => f.id)
}

/** Sends the document to the tester's own address and returns the signing token (read from doc detail). */
export async function sendToSelf(docId: string, email: string): Promise<string> {
  const res = await authReq("POST", `/documents/${docId}/send`, { signers: [{ email, name: "Live Tester" }] })
  assert(res.status === 200, `Send expected 200, got ${res.status}`)
  const detail = await authReq("GET", `/documents/${docId}`)
  const dj = await detail.json()
  const token = dj.data?.signingRequests?.[0]?.token
  assert(token, "No signing token found on document detail")
  return token
}

/** Polls the same-origin Mailhog proxy for the 6-digit verification code sent to the given address. */
export async function fetchOtp(email: string): Promise<string> {
  for (let i = 0; i < 12; i++) {
    await sleep(700)
    try {
      const res = await fetch(`/api/live-ui-test/otp?email=${encodeURIComponent(email)}`, { cache: "no-store" })
      const data = await res.json()
      if (data.otp) return data.otp as string
    } catch {
      // proxy not ready yet — retry
    }
  }
  throw new Error(`Verification code not found for ${email}`)
}

/** Returns true once an email has arrived for the given address (via the same-origin proxy). */
export async function mailReceived(email: string): Promise<boolean> {
  for (let i = 0; i < 8; i++) {
    await sleep(700)
    try {
      const res = await fetch(`/api/live-ui-test/otp?email=${encodeURIComponent(email)}`, { cache: "no-store" })
      const data = await res.json()
      if (data.hasMail) return true
    } catch {
      // retry
    }
  }
  return false
}

/** Authenticates the signing session via OTP (sets signing_token cookie). */
export async function authenticateSigning(token: string, email: string): Promise<void> {
  const otp = await fetchOtp(email)
  const res = await authReq("POST", `/sign/${token}/authenticate`, { otp })
  assert(res.status === 200, `OTP authenticate expected 200, got ${res.status}`)
  const j = await res.json()
  assert(j.data?.authenticated === true, "OTP authenticate did not confirm authentication")
}

/** Full helper: upload → place fields → send → returns { docId, signingToken, fieldIds }. */
export async function setupSignableDoc(email: string): Promise<{ docId: string; signingToken: string; fieldIds: string[] }> {
  const docId = await uploadDoc()
  const fieldIds = await placeFieldsForSelf(docId, email)
  const signingToken = await sendToSelf(docId, email)
  return { docId, signingToken, fieldIds }
}
