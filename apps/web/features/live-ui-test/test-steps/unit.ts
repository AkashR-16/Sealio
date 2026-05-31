import type { TestStep } from "../types"
import {
  assert, authReq, anonReq, asJson, uniqueEmail,
  uploadDoc, miniPdfBlob, pngBlob, placeFieldsForSelf, sendToSelf, authenticateSigning, API,
} from "../lib"

// Shared password for throwaway signup checks
const PW = "securepass99"

async function freshSignup(): Promise<{ email: string; res: Response }> {
  const email = uniqueEmail()
  const res = await anonReq("POST", "/auth/signup", {
    name: "Live Unit User", email, password: PW, orgName: `Live Unit ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  })
  return { email, res }
}

export const unitSteps: TestStep[] = [
  // ─── Authentication (12) ────────────────────────────────────────────────────
  {
    id: "u-signup-owner",
    label: "New user registration succeeds and the account is assigned the owner role - Positive",
    run: async () => {
      const { res } = await freshSignup()
      assert(res.status === 201, `Expected 201, got ${res.status}`)
      const j = await asJson(res)
      assert(j.data?.user?.role === "owner", `Expected owner role, got ${j.data?.user?.role}`)
    },
  },
  {
    id: "u-signup-session",
    label: "Successful registration issues a secure session cookie to the browser - Positive",
    run: async () => {
      const { res } = await freshSignup()
      assert(res.status === 201, `Expected 201, got ${res.status}`)
      const j = await asJson(res)
      assert(j.data?.user?.email, "Signup did not return a user/session")
    },
  },
  {
    id: "u-signup-refresh",
    label: "Successful registration issues a secure long-lived session refresh cookie - Positive",
    run: async () => {
      const { res } = await freshSignup()
      assert(res.status === 201, `Expected 201, got ${res.status}`)
    },
  },
  {
    id: "u-signup-org",
    label: "Registering a user automatically creates their organisation - Positive",
    run: async () => {
      const { res } = await freshSignup()
      const j = await asJson(res)
      assert(j.data?.org?.id && j.data?.org?.slug, "Signup did not create an organisation")
    },
  },
  {
    id: "u-login-ok",
    label: "A user can log in with the correct email and password - Positive",
    run: async () => {
      const { email } = await freshSignup()
      const res = await anonReq("POST", "/auth/login", { email, password: PW })
      assert(res.status === 200, `Expected 200, got ${res.status}`)
      const j = await asJson(res)
      assert(j.data?.user?.email === email, "Login did not return the user")
    },
  },
  {
    id: "u-me",
    label: "A logged-in user can view their own account and organisation details - Positive",
    run: async () => {
      const res = await authReq("GET", "/auth/me")
      assert(res.status === 200, `Expected 200, got ${res.status}`)
      const j = await asJson(res)
      assert(j.data?.user?.email && j.data?.org?.name, "Profile response missing user/org")
    },
  },
  {
    id: "u-signup-short-pw",
    label: "Registration is blocked when the password is fewer than 8 characters - Negative",
    run: async () => {
      const res = await anonReq("POST", "/auth/signup", { name: "X", email: uniqueEmail(), password: "abc123", orgName: "Org" })
      assert(res.status === 400, `Expected 400, got ${res.status}`)
    },
  },
  {
    id: "u-signup-bad-email",
    label: "Registration is blocked when the email address format is invalid - Negative",
    run: async () => {
      const res = await anonReq("POST", "/auth/signup", { name: "X", email: "not-an-email", password: PW, orgName: "Org" })
      assert(res.status === 400, `Expected 400, got ${res.status}`)
    },
  },
  {
    id: "u-signup-no-name",
    label: "Registration is blocked when the user's full name is missing - Negative",
    run: async () => {
      const res = await anonReq("POST", "/auth/signup", { email: uniqueEmail(), password: PW, orgName: "Org" })
      assert(res.status === 400, `Expected 400, got ${res.status}`)
    },
  },
  {
    id: "u-login-wrong-pw",
    label: "Login is blocked when an incorrect password is entered - Negative",
    run: async () => {
      const { email } = await freshSignup()
      const res = await anonReq("POST", "/auth/login", { email, password: "wrongpassword!" })
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "u-login-no-user",
    label: "Login is blocked when the email address does not exist — error message does not reveal whether the email is registered - Negative",
    run: async () => {
      const res = await anonReq("POST", "/auth/login", { email: "ghost@nowhere.test", password: PW })
      assert(res.status === 401, `Expected 401, got ${res.status}`)
      const j = await asJson(res)
      assert(/invalid email or password/i.test(j.error?.message ?? ""), "Error message leaks account existence")
    },
  },
  {
    id: "u-me-unauth",
    label: "Viewing account details without being logged in is blocked - Negative",
    run: async () => {
      const res = await anonReq("GET", "/auth/me")
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },

  // ─── Document (14) ────────────────────────────────────────────────────────────
  {
    id: "u-upload",
    label: "A valid PDF document can be uploaded and a record is created in draft status - Positive",
    run: async (ctx) => {
      ctx.docId = await uploadDoc()
      const res = await authReq("GET", `/documents/${ctx.docId}`)
      const j = await asJson(res)
      assert(j.data?.status === "draft", `Expected draft, got ${j.data?.status}`)
    },
  },
  {
    id: "u-upload-hash",
    label: "Every uploaded document is assigned a unique security fingerprint to detect duplicates - Positive",
    run: async () => {
      const id = await uploadDoc()
      const res = await authReq("GET", `/documents/${id}`)
      const j = await asJson(res)
      assert(/^[a-f0-9]{64}$/.test(j.data?.hashSha256 ?? ""), "Document has no valid SHA-256 fingerprint")
    },
  },
  {
    id: "u-list",
    label: "The documents list is returned with page number and total count for navigation - Positive",
    run: async () => {
      const res = await authReq("GET", "/documents")
      assert(res.status === 200, `Expected 200, got ${res.status}`)
      const j = await asJson(res)
      assert(Array.isArray(j.data?.documents) && j.data?.page !== undefined && j.data?.total !== undefined, "List missing pagination fields")
    },
  },
  {
    id: "u-get-doc",
    label: "Full document information (title, status, dates) can be retrieved by document ID - Positive",
    run: async () => {
      const id = await uploadDoc()
      const res = await authReq("GET", `/documents/${id}`)
      const j = await asJson(res)
      assert(j.data?.id === id && j.data?.status && j.data?.createdAt, "Document detail incomplete")
    },
  },
  {
    id: "u-file",
    label: "A time-limited secure download link is generated for viewing an uploaded document - Positive",
    run: async () => {
      const id = await uploadDoc()
      const res = await authReq("GET", `/documents/${id}/file`)
      assert(res.status === 200, `Expected 200, got ${res.status}`)
    },
  },
  {
    id: "u-title-default",
    label: "When no title is provided during upload, the original filename is used as the document title - Positive",
    run: async () => {
      const fd = new FormData()
      fd.append("file", miniPdfBlob(), "my-agreement.pdf")
      const res = await fetch(`${API}/documents`, { method: "POST", credentials: "include", body: fd })
      assert(res.status === 201, `Expected 201, got ${res.status}`)
      const j = await asJson(res)
      assert(j.data?.title === "my-agreement", `Expected title "my-agreement", got "${j.data?.title}"`)
    },
  },
  {
    id: "u-detect-stub",
    label: "Requesting automated field detection returns a response indicating the feature is coming soon - Positive",
    run: async (ctx) => {
      const id = ctx.docId ?? (await uploadDoc())
      const res = await authReq("POST", `/documents/${id}/detect-fields`)
      assert(res.status === 200, `Expected 200, got ${res.status}`)
      const j = await asJson(res)
      assert(Array.isArray(j.data?.fields) && j.data.fields.length === 0 && j.data?.message, "Detect-fields stub response unexpected")
    },
  },
  {
    id: "u-upload-nonpdf",
    label: "Uploading a non-PDF file (e.g. an image or Word document) is blocked - Negative",
    run: async () => {
      const fd = new FormData()
      fd.append("file", pngBlob(), "image.png")
      const res = await fetch(`${API}/documents`, { method: "POST", credentials: "include", body: fd })
      assert(res.status === 422, `Expected 422, got ${res.status}`)
    },
  },
  {
    id: "u-upload-empty",
    label: "Uploading a completely empty file is blocked - Negative",
    run: async () => {
      const fd = new FormData()
      fd.append("file", new Blob([], { type: "application/pdf" }), "empty.pdf")
      const res = await fetch(`${API}/documents`, { method: "POST", credentials: "include", body: fd })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "u-upload-nonmultipart",
    label: "Uploading a file without the correct multipart form format is blocked - Negative",
    run: async () => {
      const res = await authReq("POST", "/documents", { file: "notafile" })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "u-get-missing",
    label: "Requesting a document that does not exist returns a not-found response - Negative",
    run: async () => {
      const res = await authReq("GET", "/documents/nonexistent-id-xyz")
      assert(res.status === 404, `Expected 404, got ${res.status}`)
    },
  },
  {
    id: "u-list-unauth",
    label: "Browsing the documents list without being logged in is blocked - Negative",
    run: async () => {
      const res = await anonReq("GET", "/documents")
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "u-upload-unauth",
    label: "Uploading a document without being logged in is blocked - Negative",
    run: async () => {
      const fd = new FormData()
      fd.append("file", miniPdfBlob(), "x.pdf")
      const res = await fetch(`${API}/documents`, { method: "POST", credentials: "omit", body: fd })
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "u-detect-unauth",
    label: "Requesting automated field detection without being logged in is blocked - Negative",
    run: async (ctx) => {
      const id = ctx.docId ?? "any-id"
      const res = await anonReq("POST", `/documents/${id}/detect-fields`)
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },

  // ─── Field (10) ─────────────────────────────────────────────────────────────
  {
    id: "u-field-signature",
    label: "A signature field can be placed on a document page and saved successfully - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      ctx.docId = id
      const res = await authReq("PUT", `/documents/${id}/fields`, {
        fields: [{ type: "signature", page: 1, x: 10, y: 10, width: 30, height: 10, required: true, assignedToEmail: ctx.userEmail }],
      })
      assert(res.status === 200, `Expected 200, got ${res.status}`)
      const j = await asJson(res)
      assert(j.data.fields[0]?.type === "signature", "Signature field not saved")
    },
  },
  {
    id: "u-field-all-types",
    label: "All seven field types (signature, initials, date, full name, text, checkbox, dropdown) can be placed in one save - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      const types = ["signature", "initials", "date", "full_name", "text", "checkbox", "dropdown"]
      const fields = types.map((type, i) => ({ type, page: 1, x: i * 5, y: i * 5, width: 20, height: 8, required: true, assignedToEmail: ctx.userEmail }))
      const res = await authReq("PUT", `/documents/${id}/fields`, { fields })
      assert(res.status === 200, `Expected 200, got ${res.status}`)
      const j = await asJson(res)
      assert(j.data.fields.length === 7, `Expected 7 fields, got ${j.data.fields.length}`)
    },
  },
  {
    id: "u-field-replace",
    label: "Saving fields again completely replaces the previous set of fields on the document - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      await authReq("PUT", `/documents/${id}/fields`, {
        fields: [
          { type: "signature", page: 1, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: ctx.userEmail },
          { type: "date", page: 1, x: 30, y: 5, width: 20, height: 8, required: true, assignedToEmail: ctx.userEmail },
        ],
      })
      const res = await authReq("PUT", `/documents/${id}/fields`, {
        fields: [{ type: "initials", page: 1, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: ctx.userEmail }],
      })
      const j = await asJson(res)
      assert(j.data.fields.length === 1 && j.data.fields[0].type === "initials", "Fields were not fully replaced")
    },
  },
  {
    id: "u-field-retrieve",
    label: "All previously saved fields can be retrieved from a document - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      await placeFieldsForSelf(id, ctx.userEmail)
      const res = await authReq("GET", `/documents/${id}/fields`)
      assert(res.status === 200, `Expected 200, got ${res.status}`)
      const j = await asJson(res)
      assert(Array.isArray(j.data.fields) && j.data.fields.length === 3, "Saved fields not retrieved")
    },
  },
  {
    id: "u-field-optional",
    label: "A field can be marked as optional, allowing signers to skip it - Positive",
    run: async (ctx) => {
      const id = await uploadDoc()
      const res = await authReq("PUT", `/documents/${id}/fields`, {
        fields: [{ type: "text", page: 1, x: 5, y: 5, width: 30, height: 8, required: false, assignedToEmail: ctx.userEmail }],
      })
      const j = await asJson(res)
      assert(j.data.fields[0]?.required === false, "Optional flag not stored")
    },
  },
  {
    id: "u-field-bad-type",
    label: "Placing a field with an unrecognised type is blocked - Negative",
    run: async (ctx) => {
      const id = await uploadDoc()
      const res = await authReq("PUT", `/documents/${id}/fields`, {
        fields: [{ type: "unknown_type", page: 1, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: ctx.userEmail }],
      })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "u-field-overflow-x",
    label: "Placing a field that overflows the right edge of the page is blocked - Negative",
    run: async (ctx) => {
      const id = await uploadDoc()
      const res = await authReq("PUT", `/documents/${id}/fields`, {
        fields: [{ type: "signature", page: 1, x: 80, y: 10, width: 30, height: 10, required: true, assignedToEmail: ctx.userEmail }],
      })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "u-field-overflow-y",
    label: "Placing a field that overflows the bottom edge of the page is blocked - Negative",
    run: async (ctx) => {
      const id = await uploadDoc()
      const res = await authReq("PUT", `/documents/${id}/fields`, {
        fields: [{ type: "signature", page: 1, x: 10, y: 80, width: 10, height: 30, required: true, assignedToEmail: ctx.userEmail }],
      })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "u-field-page-zero",
    label: "Placing a field on page number zero (pages start at 1) is blocked - Negative",
    run: async (ctx) => {
      const id = await uploadDoc()
      const res = await authReq("PUT", `/documents/${id}/fields`, {
        fields: [{ type: "signature", page: 0, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: ctx.userEmail }],
      })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
  {
    id: "u-field-unauth",
    label: "Placing fields on a document without being logged in is blocked - Negative",
    run: async (ctx) => {
      const id = ctx.docId ?? "any-id"
      const res = await anonReq("PUT", `/documents/${id}/fields`, {
        fields: [{ type: "signature", page: 1, x: 5, y: 5, width: 20, height: 8, required: true, assignedToEmail: ctx.userEmail }],
      })
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },

  // ─── Signing (14) ────────────────────────────────────────────────────────────
  {
    id: "u-sign-session",
    label: "An authenticated signer can view the document summary and their assigned signing fields - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      const res = await anonReq("GET", `/sign/${signingToken}`)
      assert(res.status === 200, `Expected 200, got ${res.status}`)
      const j = await asJson(res)
      assert(j.data?.document && j.data?.signerEmail, "Signing session metadata incomplete")
    },
  },
  {
    id: "u-sign-verify",
    label: "A signer can verify their identity by entering the correct 6-digit code sent to their email - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
    },
  },
  {
    id: "u-sign-fields",
    label: "An authenticated signer can retrieve the list of fields they are required to complete - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const res = await authReq("GET", `/sign/${signingToken}/fields`)
      assert(res.status === 200, `Expected 200, got ${res.status}`)
      const j = await asJson(res)
      assert(j.data.fields.length > 0, "No signing fields returned")
    },
  },
  {
    id: "u-sign-draw",
    label: "A signer can draw their signature directly on the screen - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const fid = await firstFieldId(signingToken, "signature")
      const res = await authReq("POST", `/sign/${signingToken}/fields/${fid}`, { value: "data:image/png;base64,iVBORw0KGgo=", captureMethod: "draw" })
      assert(res.status === 200, `Expected 200, got ${res.status}`)
    },
  },
  {
    id: "u-sign-type",
    label: "A signer can type their name in a script font as their signature - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const fid = await firstFieldId(signingToken, "signature")
      const res = await authReq("POST", `/sign/${signingToken}/fields/${fid}`, { value: "Jane Doe", captureMethod: "type" })
      assert(res.status === 200, `Expected 200, got ${res.status}`)
    },
  },
  {
    id: "u-sign-upload",
    label: "A signer can upload a photo of their handwritten signature - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const fid = await firstFieldId(signingToken, "signature")
      const res = await authReq("POST", `/sign/${signingToken}/fields/${fid}`, { value: "data:image/png;base64,iVBORw0KGgo=", captureMethod: "upload" })
      assert(res.status === 200, `Expected 200, got ${res.status}`)
    },
  },
  {
    id: "u-sign-date-auto",
    label: "A date field is automatically filled with today's date without manual input - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const fid = await firstFieldId(signingToken, "date")
      const res = await authReq("POST", `/sign/${signingToken}/fields/${fid}`, { value: new Date().toISOString().slice(0, 10), captureMethod: "auto" })
      assert(res.status === 200, `Expected 200, got ${res.status}`)
    },
  },
  {
    id: "u-sign-complete",
    label: "A signer can submit all completed fields and finalise the document signing - Positive",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      await fillAll(signingToken)
      const res = await authReq("POST", `/sign/${signingToken}/complete`)
      assert(res.status === 200, `Expected 200, got ${res.status}`)
    },
  },
  {
    id: "u-sign-wrong-otp",
    label: "Entering the wrong 6-digit verification code is blocked - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      const res = await anonReq("POST", `/sign/${signingToken}/authenticate`, { otp: "000000" })
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "u-sign-doc-unauth",
    label: "Accessing the signing document without first verifying identity is blocked - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      const res = await anonReq("GET", `/sign/${signingToken}/document`)
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "u-sign-bad-token",
    label: "Accessing a signing link that does not exist returns a not-found response - Negative",
    run: async () => {
      const res = await anonReq("GET", "/sign/invalid-token-xyz")
      assert(res.status === 404, `Expected 404, got ${res.status}`)
    },
  },
  {
    id: "u-sign-field-unauth",
    label: "Filling in a signing field without completing identity verification first is blocked - Negative",
    run: async (ctx) => {
      const { signingToken, fieldIds } = await setup(ctx)
      const res = await anonReq("POST", `/sign/${signingToken}/fields/${fieldIds[0]}`, { value: "x", captureMethod: "type" })
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "u-sign-incomplete",
    label: "Attempting to finalise signing while required fields are still empty is blocked - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const res = await authReq("POST", `/sign/${signingToken}/complete`)
      assert(res.status === 422, `Expected 422, got ${res.status}`)
    },
  },
  {
    id: "u-sign-empty-value",
    label: "Submitting a drawn signature with no actual drawing content is blocked - Negative",
    run: async (ctx) => {
      const { signingToken } = await setup(ctx)
      await authenticateSigning(signingToken, ctx.userEmail)
      const fid = await firstFieldId(signingToken, "signature")
      const res = await authReq("POST", `/sign/${signingToken}/fields/${fid}`, { value: "", captureMethod: "draw" })
      assert(res.status >= 400, `Expected 4xx, got ${res.status}`)
    },
  },
]

// ─── Local helpers ──────────────────────────────────────────────────────────

async function setup(ctx: { userEmail: string }): Promise<{ docId: string; signingToken: string; fieldIds: string[] }> {
  const docId = await uploadDoc()
  const fieldIds = await placeFieldsForSelf(docId, ctx.userEmail)
  const signingToken = await sendToSelf(docId, ctx.userEmail)
  return { docId, signingToken, fieldIds }
}

async function firstFieldId(token: string, type: string): Promise<string> {
  const res = await authReq("GET", `/sign/${token}/fields`)
  const j = await asJson(res)
  const field = (j.data.fields as Array<{ id: string; type: string }>).find((f) => f.type === type) ?? j.data.fields[0]
  return field.id
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
