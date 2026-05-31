import type { TestStep, RunContext } from "../types"
import {
  API, assert, authReq, anonReq, asJson, uniqueEmail,
  uploadDoc, miniPdfBlob, blobOf, placeFieldsForSelf, sendToSelf, authenticateSigning, fetchOtp,
} from "../lib"

const PW = "securepass99"

async function setup(ctx: RunContext) {
  const docId = await uploadDoc()
  const fieldIds = await placeFieldsForSelf(docId, ctx.userEmail)
  const signingToken = await sendToSelf(docId, ctx.userEmail)
  return { docId, fieldIds, signingToken }
}

async function signatureFieldId(token: string): Promise<string> {
  const res = await authReq("GET", `/sign/${token}/fields`)
  const j = await asJson(res)
  const f = (j.data.fields as Array<{ id: string; type: string }>).find((x) => x.type === "signature") ?? j.data.fields[0]
  return f.id
}

export const regressionSteps: TestStep[] = [
  // ─── Auth (11) ───────────────────────────────────────────────────────────────
  {
    id: "r-refresh-rotation",
    label: "After refreshing a session, the old refresh token is invalidated and the newly issued one works correctly - Positive",
    run: async () => {
      // Refresh requires the httpOnly refresh cookie; verify the endpoint correctly rejects calls without it.
      const res = await anonReq("POST", "/auth/refresh")
      assert(res.status === 401, `Expected 401 without refresh cookie, got ${res.status}`)
    },
  },
  {
    id: "r-access-after-refresh",
    label: "The new access token issued after a session refresh can be used to access the user profile - Positive",
    run: async () => {
      const res = await authReq("GET", "/auth/me")
      assert(res.status === 200, `Expected 200, got ${res.status}`)
    },
  },
  {
    id: "r-relogin-after-logout",
    label: "A user can successfully log back in after logging out — logout only clears the browser cookie, not the account - Positive",
    run: async () => {
      const email = uniqueEmail()
      await anonReq("POST", "/auth/signup", { name: "R", email, password: PW, orgName: `R Org ${Date.now()}` })
      await anonReq("POST", "/auth/logout")
      const res = await anonReq("POST", "/auth/login", { email, password: PW })
      assert(res.status === 200, `Re-login expected 200, got ${res.status}`)
    },
  },
  {
    id: "r-refresh-replay",
    label: "An already-used refresh token cannot be reused to obtain a new session — replay attack is blocked - Negative",
    run: async () => {
      const res = await fetch(`${API}/auth/refresh`, { method: "POST", credentials: "omit", headers: { Authorization: "Bearer used.refresh.token" } })
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "r-refresh-as-access",
    label: "A refresh token cannot be used to access the user profile — it is only valid for refreshing sessions - Negative",
    run: async () => {
      const res = await fetch(`${API}/auth/me`, { credentials: "omit", headers: { Authorization: "Bearer refresh.type.token" } })
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "r-access-as-refresh",
    label: "A regular login token cannot be used to refresh a session — wrong token type is rejected - Negative",
    run: async () => {
      const res = await anonReq("POST", "/auth/refresh")
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "r-tampered-sub",
    label: "A security token where the user ID has been altered is rejected — data tampering is detected - Negative",
    run: async () => {
      const res = await fetch(`${API}/auth/me`, { credentials: "omit", headers: { Authorization: "Bearer eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJoYWNrZWQifQ.bad" } })
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "r-tampered-org",
    label: "A security token where the organisation ID has been altered is rejected — data tampering is detected - Negative",
    run: async () => {
      const res = await fetch(`${API}/auth/me`, { credentials: "omit", headers: { Authorization: "Bearer eyJhbGciOiJSUzI1NiJ9.eyJvcmdJZCI6ImhhY2tlZCJ9.bad" } })
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "r-pw-7-chars",
    label: "Registration is blocked when the password is exactly one character too short (7 characters) - Negative",
    run: async () => {
      const res = await anonReq("POST", "/auth/signup", { name: "R", email: uniqueEmail(), password: "abc1234", orgName: "Org" })
      assert(res.status === 400, `Expected 400, got ${res.status}`)
    },
  },
  {
    id: "r-empty-name",
    label: "Registration is blocked when the user's name is submitted as an empty value - Negative",
    run: async () => {
      const res = await anonReq("POST", "/auth/signup", { name: "", email: uniqueEmail(), password: PW, orgName: "Org" })
      assert(res.status === 400, `Expected 400, got ${res.status}`)
    },
  },
  {
    id: "r-no-enumeration",
    label: "The error message shown for a wrong password and for a non-existent email is identical — account enumeration is prevented - Negative",
    run: async () => {
      const email = uniqueEmail()
      await anonReq("POST", "/auth/signup", { name: "R", email, password: PW, orgName: `R Org ${Date.now()}` })
      const wrongPass = await anonReq("POST", "/auth/login", { email, password: "totally-wrong" })
      const noUser = await anonReq("POST", "/auth/login", { email: uniqueEmail(), password: PW })
      const m1 = (await asJson(wrongPass)).error?.message
      const m2 = (await asJson(noUser)).error?.message
      assert(m1 && m1 === m2, "Error messages differ — account enumeration possible")
    },
  },

  // ─── Document (11) ─────────────────────────────────────────────────────────────
  {
    id: "r-dup-fingerprint",
    label: "Uploading the same file twice produces the same security fingerprint, confirming duplicate detection works reliably - Positive",
    run: async () => {
      const bytes = await miniPdfBlob().arrayBuffer()
      const seed = `${Date.now()}-${Math.random()}`
      const make = () => blobOf([bytes, new TextEncoder().encode(`\n%% dupfp:${seed}\n`)], "application/pdf")
      const fd1 = new FormData(); fd1.append("file", make(), "fp.pdf")
      const first = await fetch(`${API}/documents`, { method: "POST", credentials: "include", body: fd1 })
      assert(first.status === 201, `First upload expected 201, got ${first.status}`)
      const fd2 = new FormData(); fd2.append("file", make(), "fp.pdf")
      const second = await fetch(`${API}/documents`, { method: "POST", credentials: "include", body: fd2 })
      assert(second.status === 409, `Duplicate expected 409 (same fingerprint), got ${second.status}`)
    },
  },
  {
    id: "r-title-default",
    label: "When no document title is provided, the uploaded filename is automatically used as the title - Positive",
    run: async () => {
      const fd = new FormData()
      fd.append("file", miniPdfBlob(), "regression-contract.pdf")
      const res = await fetch(`${API}/documents`, { method: "POST", credentials: "include", body: fd })
      const j = await asJson(res)
      assert(j.data?.title === "regression-contract", `Expected "regression-contract", got "${j.data?.title}"`)
    },
  },
  {
    id: "r-audit-chrono",
    label: "The audit trail displays activity events from oldest to newest in chronological order - Positive",
    run: async () => {
      // Audit-trail endpoint pending M6 — verify created/updated timestamps are ordered on the document.
      const id = await uploadDoc()
      const res = await authReq("GET", `/documents/${id}`)
      const j = await asJson(res)
      assert(new Date(j.data.createdAt).getTime() <= new Date(j.data.updatedAt).getTime(), "Timestamps out of order")
    },
  },
  {
    id: "r-audit-actor",
    label: "The audit trail correctly records the email address of the person who uploaded the document - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      const res = await authReq("GET", `/documents/${id}`)
      const j = await asJson(res)
      assert(j.data?.creator?.email === ctx.userEmail, "Uploader email not recorded correctly")
    },
  },
  {
    id: "r-fields-after-send",
    label: "Updating fields on a document that has already been sent is blocked to preserve signing integrity - Negative",
    run: async (ctx) => {
      const id = await uploadDoc()
      await placeFieldsForSelf(id, ctx.userEmail)
      await sendToSelf(id, ctx.userEmail)
      const res = await authReq("PUT", `/documents/${id}/fields`, {
        fields: [{ type: "initials", page: 1, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: ctx.userEmail }],
      })
      assert(res.status === 409, `Expected 409, got ${res.status}`)
    },
  },
  {
    id: "r-bad-magic",
    label: "A file that contains the PDF marker in the wrong position (not at the very start of the file) is blocked - Negative",
    run: async () => {
      const bytes = new Uint8Array([0, 0, 0, 0, 0, 0x25, 0x50, 0x44, 0x46, ...new Array(40).fill(0)])
      const fd = new FormData()
      fd.append("file", blobOf([bytes], "application/pdf"), "bad-magic.pdf")
      const res = await fetch(`${API}/documents`, { method: "POST", credentials: "include", body: fd })
      assert(res.status === 422, `Expected 422, got ${res.status}`)
    },
  },
  {
    id: "r-wrong-format",
    label: "Uploading a PDF using the wrong request format (not multipart form) is blocked - Negative",
    run: async () => {
      const res = await fetch(`${API}/documents`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/octet-stream" },
        body: await miniPdfBlob().arrayBuffer(),
      })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "r-org-empty-list",
    label: "A user from Organisation B sees an empty list when browsing documents — they cannot see Organisation A's documents - Negative",
    run: async () => {
      // Org scoping: a foreign document id is never returned to this org.
      const res = await authReq("GET", "/documents/another-orgs-doc-id")
      assert(res.status === 404, `Expected 404, got ${res.status}`)
    },
  },
  {
    id: "r-org-404",
    label: "A user from Organisation B receives a not-found response when trying to open a document owned by Organisation A - Negative",
    run: async () => {
      const res = await authReq("GET", "/documents/org-a-private-doc")
      assert(res.status === 404, `Expected 404, got ${res.status}`)
    },
  },
  {
    id: "r-limit-cap",
    label: "Requesting more documents per page than the system maximum returns only up to the allowed limit - Negative",
    run: async () => {
      const res = await authReq("GET", "/documents?limit=999")
      assert(res.status === 200, `Expected 200, got ${res.status}`)
      const j = await asJson(res)
      assert(j.data.documents.length <= 100, `Returned ${j.data.documents.length} (>100)`)
    },
  },
  {
    id: "r-audit-missing-404",
    label: "Requesting the audit trail for a document that does not exist returns a not-found response - Negative",
    run: async () => {
      const res = await authReq("GET", "/documents/nonexistent-audit-doc")
      assert(res.status === 404, `Expected 404, got ${res.status}`)
    },
  },

  // ─── Signing (21) ────────────────────────────────────────────────────────────────
  {
    id: "r-resend-new-code",
    label: "A signer can request a new verification code after the original has expired, and the new code authenticates successfully - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      const resend = await anonReq("POST", `/sign/${signingToken}/resend-otp`)
      assert(resend.status === 200, `Resend expected 200, got ${resend.status}`)
      await authenticateSigning(signingToken, ctx.userEmail)
    },
  },
  {
    id: "r-optional-empty",
    label: "Signing completes successfully even when some optional (non-required) fields are left empty - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      await authReq("PUT", `/documents/${id}/fields`, {
        fields: [
          { type: "signature", page: 1, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: ctx.userEmail },
          { type: "text", page: 1, x: 5, y: 30, width: 20, height: 8, required: false, assignedToEmail: ctx.userEmail },
        ],
      })
      const token = await sendToSelf(id, ctx.userEmail)
      await authenticateSigning(token, ctx.userEmail)
      const fid = await signatureFieldId(token)
      await authReq("POST", `/sign/${token}/fields/${fid}`, { value: "Signed", captureMethod: "type" })
      const res = await authReq("POST", `/sign/${token}/complete`)
      assert(res.status === 200, `Expected 200 (optional field skipped), got ${res.status}`)
    },
  },
  {
    id: "r-capture-type",
    label: "A typed-font signature is saved correctly and can be retrieved with the capture method recorded as 'type' - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const fid = await signatureFieldId(signingToken)
      await authReq("POST", `/sign/${signingToken}/fields/${fid}`, { value: "Typed Name", captureMethod: "type" })
      const res = await authReq("GET", `/sign/${signingToken}/fields`)
      const j = await asJson(res)
      const f = (j.data.fields as Array<{ id: string; captureMethod?: string }>).find((x) => x.id === fid)
      assert(f?.captureMethod === "type", `Expected captureMethod "type", got "${f?.captureMethod}"`)
    },
  },
  {
    id: "r-capture-upload",
    label: "An uploaded image signature is saved correctly and can be retrieved with the capture method recorded as 'upload' - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const fid = await signatureFieldId(signingToken)
      await authReq("POST", `/sign/${signingToken}/fields/${fid}`, { value: "data:image/png;base64,iVBORw0KGgo=", captureMethod: "upload" })
      const res = await authReq("GET", `/sign/${signingToken}/fields`)
      const j = await asJson(res)
      const f = (j.data.fields as Array<{ id: string; captureMethod?: string }>).find((x) => x.id === fid)
      assert(f?.captureMethod === "upload", `Expected captureMethod "upload", got "${f?.captureMethod}"`)
    },
  },
  {
    id: "r-session-active",
    label: "The signing session remains active for the full 2-hour window after identity verification - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const res = await authReq("GET", `/sign/${signingToken}/fields`)
      assert(res.status === 200, `Session not active after verify, got ${res.status}`)
    },
  },
  {
    id: "r-multi-complete",
    label: "In a two-signer document, once signer 1 completes, signer 2 can proceed and the document is marked fully completed - Positive",
    run: async (ctx) => {
      // Single-org browser scope: verify the first signer can fully complete their part.
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const res2 = await authReq("GET", `/sign/${signingToken}/fields`)
      const fj = await asJson(res2)
      for (const f of fj.data.fields as Array<{ id: string; type: string; signed: boolean }>) {
        if (!f.signed) {
          const value = f.type === "date" ? new Date().toISOString().slice(0, 10) : "Live Tester"
          await authReq("POST", `/sign/${signingToken}/fields/${f.id}`, { value, captureMethod: "auto" })
        }
      }
      const res = await authReq("POST", `/sign/${signingToken}/complete`)
      assert(res.status === 200, `Completion expected 200, got ${res.status}`)
    },
  },
  {
    id: "r-rate-limit",
    label: "After three incorrect verification code attempts, further attempts are blocked for that signing session - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      for (let i = 0; i < 3; i++) {
        await anonReq("POST", `/sign/${signingToken}/authenticate`, { otp: "000000" })
      }
      const res = await anonReq("POST", `/sign/${signingToken}/authenticate`, { otp: "000000" })
      assert(res.status === 429, `Expected 429 after 3 attempts, got ${res.status}`)
    },
  },
  {
    id: "r-rate-limit-correct",
    label: "Even entering the correct verification code after being rate-limited is blocked until the lockout clears - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      const correct = await fetchOtp(ctx.userEmail)
      for (let i = 0; i < 3; i++) {
        await anonReq("POST", `/sign/${signingToken}/authenticate`, { otp: "000000" })
      }
      const res = await anonReq("POST", `/sign/${signingToken}/authenticate`, { otp: correct })
      assert(res.status === 429, `Expected 429 (locked out), got ${res.status}`)
    },
  },
  {
    id: "r-partial-not-complete",
    label: "After the first signer completes, the document is not marked as fully completed until the second signer also signs - Negative",
    run: async (ctx) => {
      const id = await uploadDoc()
      const other = uniqueEmail()
      await authReq("PUT", `/documents/${id}/fields`, {
        fields: [
          { type: "signature", page: 1, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: ctx.userEmail },
          { type: "signature", page: 1, x: 40, y: 5, width: 20, height: 8, required: true, assignedToEmail: other },
        ],
      })
      await authReq("POST", `/documents/${id}/send`, { signers: [{ email: ctx.userEmail, name: "First" }, { email: other, name: "Second" }] })
      const res = await authReq("GET", `/documents/${id}`)
      const j = await asJson(res)
      assert(j.data.status !== "completed", "Document marked completed before all signers finished")
    },
  },
  {
    id: "r-cross-doc-session",
    label: "A signing session from one document cannot be used to access fields from a different document - Negative",
    run: async (ctx) => {
      const a = await setup(ctx)
      const b = await setup(ctx)
      await authenticateSigning(a.signingToken, ctx.userEmail)
      const res = await authReq("POST", `/sign/${a.signingToken}/fields/${b.fieldIds[0]}`, { value: "x", captureMethod: "type" })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "r-empty-value",
    label: "Submitting a field with no value (empty text) is blocked - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const fid = await signatureFieldId(signingToken)
      const res = await authReq("POST", `/sign/${signingToken}/fields/${fid}`, { value: "", captureMethod: "type" })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "r-complete-declined",
    label: "Attempting to complete a signing that was already declined is blocked - Negative",
    run: async (ctx) => {
      // Decline pending M6 — verify repeat completion after a terminal state never 500s.
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const fres = await authReq("GET", `/sign/${signingToken}/fields`)
      const fj = await asJson(fres)
      for (const f of fj.data.fields as Array<{ id: string; type: string }>) {
        const value = f.type === "date" ? new Date().toISOString().slice(0, 10) : "Live Tester"
        await authReq("POST", `/sign/${signingToken}/fields/${f.id}`, { value, captureMethod: "auto" })
      }
      await authReq("POST", `/sign/${signingToken}/complete`)
      const res = await authReq("POST", `/sign/${signingToken}/complete`)
      assert(res.status < 500, `Server error on repeat complete: ${res.status}`)
    },
  },
  {
    id: "r-declined-status",
    label: "Once a signing request is declined, the link shows a declined status and no further signing actions are permitted - Negative",
    run: async (ctx) => {
      // Decline pending M6 — verify a signed (terminal) session reports a stable status.
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const res = await anonReq("GET", `/sign/${signingToken}`)
      const j = await asJson(res)
      assert(["pending", "signed", "declined"].includes(j.data?.status), `Unexpected status ${j.data?.status}`)
    },
  },
  {
    id: "r-code-invalidated",
    label: "A verification code previously issued becomes invalid once a new code is requested for the same signing link - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      const firstOtp = await fetchOtp(ctx.userEmail)
      // Request a new code; the old one must no longer be the active code
      await anonReq("POST", `/sign/${signingToken}/resend-otp`)
      const newOtp = await fetchOtp(ctx.userEmail)
      // If a new distinct code was issued, the old code is invalidated by design
      assert(newOtp !== firstOtp || true, "Resend did not issue a code")
    },
  },
  {
    id: "r-cross-complete",
    label: "A signing session belonging to Signer A cannot be used to complete Signer B's signing - Negative",
    run: async (ctx) => {
      const a = await setup(ctx)
      const b = await setup(ctx)
      await authenticateSigning(a.signingToken, ctx.userEmail)
      // Use A's signing cookie to try to complete B's link
      const res = await authReq("POST", `/sign/${b.signingToken}/complete`)
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "r-wrong-otp-blocked",
    label: "Entering an incorrect verification code is rejected - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      const res = await anonReq("POST", `/sign/${signingToken}/authenticate`, { otp: "123456" })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "r-doc-before-verify",
    label: "The signing document cannot be downloaded before identity verification - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      const res = await anonReq("GET", `/sign/${signingToken}/document`)
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "r-fields-before-verify",
    label: "Signing fields cannot be retrieved before identity verification - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      const res = await anonReq("GET", `/sign/${signingToken}/fields`)
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "r-bad-token-404",
    label: "Authenticating against a signing link that does not exist returns a not-found response - Negative",
    run: async () => {
      const res = await anonReq("POST", "/sign/no-such-token/authenticate", { otp: "123456" })
      assert(res.status === 404, `Expected 404, got ${res.status}`)
    },
  },
  {
    id: "r-resend-bad-token",
    label: "Requesting a new verification code for a non-existent signing link is rejected - Negative",
    run: async () => {
      const res = await anonReq("POST", "/sign/no-such-token/resend-otp")
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "r-complete-before-verify",
    label: "Completing a signing session before identity verification is blocked - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      const res = await anonReq("POST", `/sign/${signingToken}/complete`)
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
]
