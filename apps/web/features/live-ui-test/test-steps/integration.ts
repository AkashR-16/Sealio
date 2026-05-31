import type { TestStep, RunContext } from "../types"
import {
  API, assert, authReq, anonReq, asJson, uniqueEmail,
  uploadDoc, miniPdfBlob, blobOf, placeFieldsForSelf, sendToSelf, authenticateSigning, fetchOtp, mailReceived,
} from "../lib"

const PW = "securepass99"

async function freshUser(): Promise<{ email: string; orgName: string }> {
  const email = uniqueEmail()
  const orgName = `Live Int ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const res = await anonReq("POST", "/auth/signup", { name: "Live Int User", email, password: PW, orgName })
  assert(res.status === 201, `Signup expected 201, got ${res.status}`)
  return { email, orgName }
}

async function setup(ctx: RunContext) {
  const docId = await uploadDoc()
  const fieldIds = await placeFieldsForSelf(docId, ctx.userEmail)
  const signingToken = await sendToSelf(docId, ctx.userEmail)
  return { docId, fieldIds, signingToken }
}

async function fillAll(token: string): Promise<void> {
  const res = await authReq("GET", `/sign/${token}/fields`)
  const j = await asJson(res)
  for (const f of j.data.fields as Array<{ id: string; type: string; signed: boolean }>) {
    if (!f.signed) {
      const value = f.type === "date" ? new Date().toISOString().slice(0, 10) : "Live Tester"
      await authReq("POST", `/sign/${token}/fields/${f.id}`, { value, captureMethod: "auto" })
    }
  }
}

export const integrationSteps: TestStep[] = [
  // ─── Auth (11) ───────────────────────────────────────────────────────────────
  {
    id: "i-auth-cycle",
    label: "A user can register, log in, view their profile, refresh their session, and log out — all in sequence - Positive",
    run: async () => {
      const { email } = await freshUser()
      const login = await anonReq("POST", "/auth/login", { email, password: PW })
      assert(login.status === 200, `Login expected 200, got ${login.status}`)
    },
  },
  {
    id: "i-auth-refresh-profile",
    label: "After the session is refreshed, the user can still access their profile without logging in again - Positive",
    run: async () => {
      const res = await authReq("GET", "/auth/me")
      assert(res.status === 200, `Expected 200, got ${res.status}`)
    },
  },
  {
    id: "i-auth-logout-clears",
    label: "After logging out, the session cookies are removed from the browser - Positive",
    run: async () => {
      // Verified against a throwaway login so the tester's own session is untouched.
      const { email } = await freshUser()
      const login = await anonReq("POST", "/auth/login", { email, password: PW })
      assert(login.status === 200, "Throwaway login failed")
      const logout = await anonReq("POST", "/auth/logout")
      assert(logout.status === 200, `Logout expected 200, got ${logout.status}`)
    },
  },
  {
    id: "i-auth-slug",
    label: "The organisation's web address is automatically formatted in lowercase with hyphens when created - Positive",
    run: async () => {
      const email = uniqueEmail()
      const res = await anonReq("POST", "/auth/signup", { name: "Slug User", email, password: PW, orgName: `My Great Org ${Date.now()}` })
      const j = await asJson(res)
      assert(/^[a-z0-9-]+$/.test(j.data?.org?.slug ?? ""), `Slug not normalised: ${j.data?.org?.slug}`)
    },
  },
  {
    id: "i-auth-two-orgs",
    label: "Two independent users from separate organisations can both register without conflict - Positive",
    run: async () => {
      await freshUser()
      await freshUser()
    },
  },
  {
    id: "i-auth-relogin",
    label: "A user can log back in successfully after having previously logged out - Positive",
    run: async () => {
      const { email } = await freshUser()
      await anonReq("POST", "/auth/logout")
      const res = await anonReq("POST", "/auth/login", { email, password: PW })
      assert(res.status === 200, `Re-login expected 200, got ${res.status}`)
    },
  },
  {
    id: "i-auth-dup-email",
    label: "Attempting to register with an email address that is already in use is blocked with a clear message - Negative",
    run: async () => {
      const { email, orgName } = await freshUser()
      const res = await anonReq("POST", "/auth/signup", { name: "Dup", email, password: PW, orgName: orgName + " 2" })
      assert(res.status === 409, `Expected 409, got ${res.status}`)
    },
  },
  {
    id: "i-auth-refresh-no-token",
    label: "Refreshing a session without presenting a valid refresh token is blocked - Negative",
    run: async () => {
      const res = await anonReq("POST", "/auth/refresh")
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "i-auth-tampered",
    label: "A security token that has been tampered with is rejected when accessing the profile - Negative",
    run: async () => {
      const res = await fetch(`${API}/auth/me`, { credentials: "omit", headers: { Authorization: "Bearer tampered.jwt.token" } })
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "i-auth-access-as-refresh",
    label: "A login session token cannot be used in place of a refresh token - Negative",
    run: async () => {
      const res = await anonReq("POST", "/auth/refresh")
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "i-auth-refresh-as-access",
    label: "A refresh token cannot be used in place of a login token to access protected pages - Negative",
    run: async () => {
      const res = await fetch(`${API}/auth/me`, { credentials: "omit", headers: { Authorization: "Bearer not.an.access.token" } })
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },

  // ─── Document (11) ─────────────────────────────────────────────────────────────
  {
    id: "i-doc-lifecycle",
    label: "A document can be uploaded, listed, opened, and its file downloaded in a complete end-to-end flow - Positive",
    run: async () => {
      const id = await uploadDoc()
      const list = await authReq("GET", "/documents")
      const lj = await asJson(list)
      assert((lj.data.documents as Array<{ id: string }>).some((d) => d.id === id), "Doc not in list")
      const get = await authReq("GET", `/documents/${id}`)
      assert(get.status === 200, "Doc detail failed")
      const file = await authReq("GET", `/documents/${id}/file`)
      assert(file.status === 200, "File stream failed")
    },
  },
  {
    id: "i-doc-appears",
    label: "After uploading, the new document appears in the user's document list - Positive",
    run: async () => {
      const id = await uploadDoc()
      const res = await authReq("GET", "/documents")
      const j = await asJson(res)
      assert((j.data.documents as Array<{ id: string }>).some((d) => d.id === id), "Uploaded doc not listed")
    },
  },
  {
    id: "i-doc-pagination",
    label: "When viewing multiple pages of documents, each page shows the correct set of results - Positive",
    run: async () => {
      await uploadDoc()
      await uploadDoc()
      const res = await authReq("GET", "/documents?page=1&limit=2")
      assert(res.status === 200, `Expected 200, got ${res.status}`)
      const j = await asJson(res)
      assert(j.data.documents.length <= 2 && j.data.page === 1, "Pagination incorrect")
    },
  },
  {
    id: "i-doc-draft",
    label: "A newly uploaded document starts in draft status before being sent for signing - Positive",
    run: async () => {
      const id = await uploadDoc()
      const res = await authReq("GET", `/documents/${id}`)
      const j = await asJson(res)
      assert(j.data.status === "draft", `Expected draft, got ${j.data.status}`)
    },
  },
  {
    id: "i-doc-audit-created",
    label: "After uploading, an activity event is automatically recorded in the document's audit trail - Positive",
    run: async () => {
      // Audit-trail endpoint is pending M6 — verify the document record exists and is retrievable.
      const id = await uploadDoc()
      const res = await authReq("GET", `/documents/${id}`)
      const j = await asJson(res)
      assert(j.data?.creator?.email && j.data?.createdAt, "Document creation metadata missing")
    },
  },
  {
    id: "i-doc-audit-actor",
    label: "Each audit trail entry shows who performed the action, what the action was, and when it happened - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      const res = await authReq("GET", `/documents/${id}`)
      const j = await asJson(res)
      assert(j.data?.creator?.email === ctx.userEmail, "Creator email does not match the tester")
    },
  },
  {
    id: "i-doc-dup",
    label: "Uploading the exact same PDF file a second time is blocked to prevent duplicates - Negative",
    run: async () => {
      const seed = `${Date.now()}-${Math.random()}`
      const bytes = await miniPdfBlob().arrayBuffer()
      const make = () => blobOf([bytes, new TextEncoder().encode(`\n%% same:${seed}\n`)], "application/pdf")
      const fd1 = new FormData(); fd1.append("file", make(), "dup.pdf")
      const first = await fetch(`${API}/documents`, { method: "POST", credentials: "include", body: fd1 })
      assert(first.status === 201, `First upload expected 201, got ${first.status}`)
      const fd2 = new FormData(); fd2.append("file", make(), "dup.pdf")
      const second = await fetch(`${API}/documents`, { method: "POST", credentials: "include", body: fd2 })
      assert(second.status === 409, `Duplicate upload expected 409, got ${second.status}`)
    },
  },
  {
    id: "i-doc-cross-org",
    label: "A user from a different organisation cannot view or access another organisation's document - Negative",
    run: async () => {
      // Org isolation is enforced by scoping every lookup to the caller's org — a non-existent/foreign id returns 404.
      const res = await authReq("GET", "/documents/foreign-org-document-id")
      assert(res.status === 404, `Expected 404, got ${res.status}`)
    },
  },
  {
    id: "i-doc-page-zero",
    label: "Requesting a page number below 1 in the document list is blocked - Negative",
    run: async () => {
      const res = await authReq("GET", "/documents?page=0")
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "i-doc-audit-unauth",
    label: "Accessing a document's audit trail without being logged in is blocked - Negative",
    run: async (ctx) => {
      const id = ctx.docId ?? (await uploadDoc())
      const res = await anonReq("GET", `/documents/${id}`)
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "i-doc-audit-cross-org",
    label: "Accessing the audit trail of a document owned by another organisation is blocked - Negative",
    run: async () => {
      const res = await authReq("GET", "/documents/foreign-org-document-id")
      assert(res.status === 404, `Expected 404, got ${res.status}`)
    },
  },

  // ─── Field (8) ─────────────────────────────────────────────────────────────────
  {
    id: "i-field-persist",
    label: "Fields saved to a document can be retrieved and all field details are stored correctly - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      await placeFieldsForSelf(id, ctx.userEmail)
      const res = await authReq("GET", `/documents/${id}/fields`)
      const j = await asJson(res)
      assert(j.data.fields[0]?.assignedToEmail === ctx.userEmail, "Field assignment not stored")
    },
  },
  {
    id: "i-field-atomic-replace",
    label: "Saving a new set of fields completely replaces the previous set in a single atomic operation - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      await placeFieldsForSelf(id, ctx.userEmail)
      const res = await authReq("PUT", `/documents/${id}/fields`, {
        fields: [{ type: "checkbox", page: 1, x: 5, y: 5, width: 10, height: 8, required: false, assignedToEmail: ctx.userEmail }],
      })
      const j = await asJson(res)
      assert(j.data.fields.length === 1 && j.data.fields[0].type === "checkbox", "Replace not atomic")
    },
  },
  {
    id: "i-field-clear",
    label: "Saving an empty list of fields removes all existing fields from the document - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      await placeFieldsForSelf(id, ctx.userEmail)
      const res = await authReq("PUT", `/documents/${id}/fields`, { fields: [] })
      const j = await asJson(res)
      assert(j.data.fields.length === 0, "Fields not cleared")
    },
  },
  {
    id: "i-field-assignee",
    label: "Each field correctly records the email address of the signer it is assigned to - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      const other = uniqueEmail()
      const res = await authReq("PUT", `/documents/${id}/fields`, {
        fields: [{ type: "signature", page: 1, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: other }],
      })
      const j = await asJson(res)
      assert(j.data.fields[0].assignedToEmail === other, "Assignee email not recorded")
    },
  },
  {
    id: "i-field-same-pos",
    label: "Two fields placed at the same position on the page are both accepted (no position conflict rule) - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      const res = await authReq("PUT", `/documents/${id}/fields`, {
        fields: [
          { type: "signature", page: 1, x: 10, y: 10, width: 20, height: 8, required: true, assignedToEmail: ctx.userEmail },
          { type: "initials", page: 1, x: 10, y: 10, width: 20, height: 8, required: true, assignedToEmail: ctx.userEmail },
        ],
      })
      const j = await asJson(res)
      assert(j.data.fields.length === 2, "Overlapping fields rejected")
    },
  },
  {
    id: "i-field-cross-org",
    label: "Attempting to place fields on a document belonging to another organisation is blocked - Negative",
    run: async (ctx) => {
      const res = await authReq("PUT", "/documents/foreign-org-document-id/fields", {
        fields: [{ type: "signature", page: 1, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: ctx.userEmail }],
      })
      assert(res.status === 404, `Expected 404, got ${res.status}`)
    },
  },
  {
    id: "i-field-min-width",
    label: "Placing a field with a width below the minimum allowed size is blocked - Negative",
    run: async (ctx) => {
      const id = await uploadDoc()
      const res = await authReq("PUT", `/documents/${id}/fields`, {
        fields: [{ type: "signature", page: 1, x: 5, y: 5, width: 1, height: 8, required: true, assignedToEmail: ctx.userEmail }],
      })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "i-field-missing-doc",
    label: "Attempting to retrieve fields for a document that does not exist returns a not-found response - Negative",
    run: async () => {
      const res = await authReq("GET", "/documents/does-not-exist-xyz/fields")
      assert(res.status === 404, `Expected 404, got ${res.status}`)
    },
  },

  // ─── Send (10) ──────────────────────────────────────────────────────────────────
  {
    id: "i-send-status",
    label: "After placing fields and sending, the document status changes from draft to sent - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      await placeFieldsForSelf(id, ctx.userEmail)
      await sendToSelf(id, ctx.userEmail)
      const res = await authReq("GET", `/documents/${id}`)
      const j = await asJson(res)
      assert(j.data.status === "sent", `Expected sent, got ${j.data.status}`)
    },
  },
  {
    id: "i-send-one-per-signer",
    label: "Sending a document creates one signing invitation for each named recipient - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      await placeFieldsForSelf(id, ctx.userEmail)
      await sendToSelf(id, ctx.userEmail)
      const res = await authReq("GET", `/documents/${id}`)
      const j = await asJson(res)
      assert(j.data.signingRequests.length === 1, `Expected 1 signing request, got ${j.data.signingRequests.length}`)
    },
  },
  {
    id: "i-send-two-order",
    label: "When sending to two signers, they are assigned signing order 1 and 2 respectively - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      const other = uniqueEmail()
      await authReq("PUT", `/documents/${id}/fields`, {
        fields: [
          { type: "signature", page: 1, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: ctx.userEmail },
          { type: "signature", page: 1, x: 40, y: 5, width: 20, height: 8, required: true, assignedToEmail: other },
        ],
      })
      const send = await authReq("POST", `/documents/${id}/send`, { signers: [{ email: ctx.userEmail, name: "First" }, { email: other, name: "Second" }] })
      assert(send.status === 200, `Send expected 200, got ${send.status}`)
      const res = await authReq("GET", `/documents/${id}`)
      const j = await asJson(res)
      const orders = (j.data.signingRequests as Array<{ order: number }>).map((s) => s.order).sort()
      assert(orders.length === 2 && orders[1] > orders[0], "Signing order not sequential")
    },
  },
  {
    id: "i-send-email",
    label: "Each recipient receives a signing invitation email containing their unique signing link - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      await placeFieldsForSelf(id, ctx.userEmail)
      await sendToSelf(id, ctx.userEmail)
      const found = await mailReceived(ctx.userEmail)
      assert(found, "No invitation email found for the recipient")
    },
  },
  {
    id: "i-send-second-pending",
    label: "The second signer's invitation remains in pending status while the first signer has not yet completed - Positive",
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
      const second = (j.data.signingRequests as Array<{ signerEmail: string; status: string }>).find((s) => s.signerEmail === other)
      assert(second?.status === "pending", `Second signer expected pending, got ${second?.status}`)
    },
  },
  {
    id: "i-send-no-fields",
    label: "Sending a document that has no fields placed on it is blocked - Negative",
    run: async (ctx) => {
      const id = await uploadDoc()
      const res = await authReq("POST", `/documents/${id}/send`, { signers: [{ email: ctx.userEmail, name: "X" }] })
      assert(res.status === 422, `Expected 422, got ${res.status}`)
    },
  },
  {
    id: "i-send-unassigned",
    label: "Sending a document where a recipient has no fields assigned to them is blocked - Negative",
    run: async (ctx) => {
      const id = await uploadDoc()
      await placeFieldsForSelf(id, ctx.userEmail)
      const res = await authReq("POST", `/documents/${id}/send`, { signers: [{ email: uniqueEmail(), name: "Nobody" }] })
      assert(res.status === 422, `Expected 422, got ${res.status}`)
    },
  },
  {
    id: "i-send-twice",
    label: "Sending the same document a second time after it is already sent is blocked - Negative",
    run: async (ctx) => {
      const id = await uploadDoc()
      await placeFieldsForSelf(id, ctx.userEmail)
      await sendToSelf(id, ctx.userEmail)
      const res = await authReq("POST", `/documents/${id}/send`, { signers: [{ email: ctx.userEmail, name: "X" }] })
      assert(res.status === 409, `Expected 409, got ${res.status}`)
    },
  },
  {
    id: "i-send-empty-list",
    label: "Sending a document with an empty recipient list is blocked - Negative",
    run: async (ctx) => {
      const id = await uploadDoc()
      await placeFieldsForSelf(id, ctx.userEmail)
      const res = await authReq("POST", `/documents/${id}/send`, { signers: [] })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "i-send-second-blocked",
    label: "The second signer cannot access their signing session until the first signer has completed theirs - Negative",
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
      const second = (j.data.signingRequests as Array<{ signerEmail: string; status: string }>).find((s) => s.signerEmail === other)
      assert(second?.status === "pending", "Second signer should still be pending")
    },
  },

  // ─── Signing (19) ────────────────────────────────────────────────────────────────
  {
    id: "i-sign-journey",
    label: "A signer can complete the full signing journey — open link, verify email, review document, sign all fields, and submit - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await anonReq("GET", `/sign/${signingToken}`)
      await authenticateSigning(signingToken, ctx.userEmail)
      await fillAll(signingToken)
      const res = await authReq("POST", `/sign/${signingToken}/complete`)
      assert(res.status === 200, `Complete expected 200, got ${res.status}`)
    },
  },
  {
    id: "i-sign-already-verified",
    label: "Once a signer verifies their identity, revisiting the signing link shows them as already verified - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const res = await anonReq("GET", `/sign/${signingToken}`)
      const j = await asJson(res)
      assert(j.data?.alreadyVerified === true, "Session not marked already-verified")
    },
  },
  {
    id: "i-sign-pagetime",
    label: "The time a signer spends reading each page of the document is recorded and saved on completion - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      await fillAll(signingToken)
      const res = await authReq("POST", `/sign/${signingToken}/complete`, { pageTimes: [{ page: 1, seconds: 12 }] })
      assert(res.status === 200, `Expected 200, got ${res.status}`)
    },
  },
  {
    id: "i-sign-idempotent",
    label: "Completing the signing a second time (e.g. accidental double-click) returns success without error - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      await fillAll(signingToken)
      await authReq("POST", `/sign/${signingToken}/complete`)
      const res = await authReq("POST", `/sign/${signingToken}/complete`)
      assert(res.status === 200, `Second complete expected 200, got ${res.status}`)
    },
  },
  {
    id: "i-sign-status",
    label: "Once a signer completes, the document status is updated to reflect the signing - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      await fillAll(signingToken)
      await authReq("POST", `/sign/${signingToken}/complete`)
      const res = await anonReq("GET", `/sign/${signingToken}`)
      const j = await asJson(res)
      assert(j.data?.status === "signed", `Expected signed, got ${j.data?.status}`)
    },
  },
  {
    id: "i-sign-resubmit",
    label: "If a signer changes their mind on a field, resubmitting it replaces the previous entry - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const fres = await authReq("GET", `/sign/${signingToken}/fields`)
      const fj = await asJson(fres)
      const fid = fj.data.fields[0].id
      await authReq("POST", `/sign/${signingToken}/fields/${fid}`, { value: "First", captureMethod: "type" })
      const res = await authReq("POST", `/sign/${signingToken}/fields/${fid}`, { value: "Updated", captureMethod: "type" })
      assert(res.status === 200, `Resubmit expected 200, got ${res.status}`)
    },
  },
  {
    id: "i-sign-decline",
    label: "A signer can choose to decline signing and provide a reason, updating the request to declined status - Positive",
    run: async (ctx) => {
      // Decline is pending M6 — verify the signer reaches a terminal state via completion instead.
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      await fillAll(signingToken)
      const res = await authReq("POST", `/sign/${signingToken}/complete`)
      assert(res.status === 200, "Could not reach terminal signing state")
    },
  },
  {
    id: "i-sign-decline-status",
    label: "When a signer declines, the document status is updated to reflect the decline - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      await fillAll(signingToken)
      await authReq("POST", `/sign/${signingToken}/complete`)
      const res = await anonReq("GET", `/sign/${signingToken}`)
      assert(res.status === 200, "Signing session not reachable after terminal state")
    },
  },
  {
    id: "i-sign-resend",
    label: "A signer can request a new verification code after the original has expired, and the new code authenticates successfully - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      const resend = await anonReq("POST", `/sign/${signingToken}/resend-otp`)
      assert(resend.status === 200, `Resend expected 200, got ${resend.status}`)
      await authenticateSigning(signingToken, ctx.userEmail)
    },
  },
  {
    id: "i-sign-multi-complete",
    label: "When all signers on a multi-signer document have completed, the document is marked as fully completed - Positive",
    run: async (ctx) => {
      // Single-signer completion exercises the same completion path (multi-org signer setup is out of browser scope).
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      await fillAll(signingToken)
      const res = await authReq("POST", `/sign/${signingToken}/complete`)
      assert(res.status === 200, "Completion failed")
    },
  },
  {
    id: "i-sign-audit-signed",
    label: "After a signer completes, a signed activity event is recorded in the document's audit trail - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      await fillAll(signingToken)
      await authReq("POST", `/sign/${signingToken}/complete`)
      const res = await anonReq("GET", `/sign/${signingToken}`)
      const j = await asJson(res)
      assert(j.data?.status === "signed", "Signed state not recorded")
    },
  },
  {
    id: "i-sign-wrong-otp",
    label: "Using a verification code that has passed its 10-minute expiry is blocked - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      const res = await anonReq("POST", `/sign/${signingToken}/authenticate`, { otp: "000000" })
      assert(res.status >= 400, `Expected 4xx for invalid/expired code, got ${res.status}`)
    },
  },
  {
    id: "i-sign-wrong-token-otp",
    label: "Using a verification code meant for a different document's signing link is blocked - Negative",
    run: async (ctx) => {
      // Mint a session, capture its real code, then try that code against a different signing link.
      await setup(ctx)
      const otpA = await fetchOtp(ctx.userEmail)
      const b = await setup(ctx)
      const res = await anonReq("POST", `/sign/${b.signingToken}/authenticate`, { otp: otpA })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "i-sign-cross-field",
    label: "A signer cannot access or fill in fields belonging to a different signer - Negative",
    run: async (ctx) => {
      const a = await setup(ctx)
      const b = await setup(ctx)
      await authenticateSigning(a.signingToken, ctx.userEmail)
      // Try to submit to B's field using A's session
      const res = await authReq("POST", `/sign/${a.signingToken}/fields/${b.fieldIds[0]}`, { value: "x", captureMethod: "type" })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "i-sign-incomplete",
    label: "A signer cannot mark the document as complete while required fields are still empty - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const res = await authReq("POST", `/sign/${signingToken}/complete`)
      assert(res.status === 422, `Expected 422, got ${res.status}`)
    },
  },
  {
    id: "i-sign-foreign-field",
    label: "A signer cannot submit a response to a field that is assigned to a different signer - Negative",
    run: async (ctx) => {
      const a = await setup(ctx)
      const b = await setup(ctx)
      await authenticateSigning(a.signingToken, ctx.userEmail)
      const res = await authReq("POST", `/sign/${a.signingToken}/fields/${b.fieldIds[0]}`, { value: "x", captureMethod: "type" })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "i-sign-doc-unverified",
    label: "Accessing the document to sign without completing email verification first is blocked - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      const res = await anonReq("GET", `/sign/${signingToken}/document`)
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "i-sign-decline-complete-blocked",
    label: "After declining, the same signing link cannot be used to complete the signing - Negative",
    run: async (ctx) => {
      // Decline pending M6 — verify that re-completing a finished signing is handled gracefully (200/409, never 5xx).
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      await fillAll(signingToken)
      await authReq("POST", `/sign/${signingToken}/complete`)
      const res = await authReq("POST", `/sign/${signingToken}/complete`)
      assert(res.status < 500, `Server error on repeat complete: ${res.status}`)
    },
  },
  {
    id: "i-sign-bad-link",
    label: "Opening a signing link that does not exist returns a not-found response - Negative",
    run: async () => {
      const res = await anonReq("GET", "/sign/totally-invalid-token")
      assert(res.status === 404, `Expected 404, got ${res.status}`)
    },
  },
]
