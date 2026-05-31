import type { TestStep } from "../types"
import {
  API, assert, authReq, anonReq, asJson,
  uploadDoc, placeFieldsForSelf, sendToSelf, authenticateSigning,
} from "../lib"

export const smokeSteps: TestStep[] = [
  {
    id: "health-ok",
    label: "The API health check returns an 'ok' status confirming the server is up and running - Positive",
    run: async () => {
      const res = await anonReq("GET", "/health")
      assert(res.status === 200, `Expected 200, got ${res.status}`)
      const j = await asJson(res)
      assert(j.status === "ok", `Expected status "ok", got "${j.status}"`)
    },
  },
  {
    id: "health-fast",
    label: "The server responds to the health check within 500 milliseconds - Positive",
    run: async () => {
      const start = performance.now()
      await anonReq("GET", "/health")
      const ms = performance.now() - start
      assert(ms < 500, `Health check took ${Math.round(ms)}ms (>500ms)`)
    },
  },
  {
    id: "unknown-route-404",
    label: "Requesting a page that does not exist returns a clear not-found response (server handles errors gracefully) - Positive",
    run: async () => {
      const res = await anonReq("GET", "/this-route-does-not-exist")
      assert(res.status === 404, `Expected 404, got ${res.status}`)
    },
  },
  {
    id: "cors-headers",
    label: "Cross-origin access headers are present in API responses, confirming the web app can communicate with the API - Positive",
    run: async () => {
      // If this fetch resolves at all from localhost:3000 → :3001, CORS is correctly configured.
      const res = await anonReq("GET", "/health")
      assert(res.status === 200 && res.type !== "opaque", "Cross-origin request was blocked")
    },
  },
  {
    id: "create-document",
    label: "A logged-in user can upload a PDF document to the platform - Positive",
    run: async (ctx) => {
      ctx.docId = await uploadDoc()
    },
  },
  {
    id: "place-fields",
    label: "A user can place a signature field on the uploaded document - Positive",
    run: async (ctx) => {
      assert(ctx.docId, "No document from previous step")
      ctx.fieldIds = await placeFieldsForSelf(ctx.docId, ctx.userEmail)
      assert(ctx.fieldIds.length > 0, "No fields were saved")
    },
  },
  {
    id: "send-document",
    label: "A user can send the document to a recipient for signing - Positive",
    run: async (ctx) => {
      assert(ctx.docId, "No document from previous step")
      ctx.signingToken = await sendToSelf(ctx.docId, ctx.userEmail)
    },
  },
  {
    id: "signing-session",
    label: "The signing session can be opened from the emailed link - Positive",
    run: async (ctx) => {
      assert(ctx.signingToken, "No signing token from previous step")
      const res = await anonReq("GET", `/sign/${ctx.signingToken}`)
      assert(res.status === 200, `Expected 200, got ${res.status}`)
    },
  },
  {
    id: "verify-otp",
    label: "The recipient can verify their identity using the emailed verification code - Positive",
    run: async (ctx) => {
      assert(ctx.signingToken, "No signing token from previous step")
      await authenticateSigning(ctx.signingToken, ctx.userEmail)
    },
  },
  {
    id: "load-signing-fields",
    label: "The recipient can load the fields they need to complete - Positive",
    run: async (ctx) => {
      assert(ctx.signingToken, "No signing token from previous step")
      const res = await authReq("GET", `/sign/${ctx.signingToken}/fields`)
      assert(res.status === 200, `Expected 200, got ${res.status}`)
      const j = await asJson(res)
      ctx.fieldIds = (j.data.fields as Array<{ id: string }>).map((f) => f.id)
      assert(ctx.fieldIds.length > 0, "No signing fields returned")
    },
  },
  {
    id: "submit-signature",
    label: "The recipient can apply their signature to a field - Positive",
    run: async (ctx) => {
      assert(ctx.signingToken && ctx.fieldIds?.length, "Missing signing context")
      const res = await authReq("POST", `/sign/${ctx.signingToken}/fields/${ctx.fieldIds[0]}`, {
        value: "data:image/png;base64,iVBORw0KGgo=",
        captureMethod: "draw",
      })
      assert(res.status === 200, `Expected 200, got ${res.status}`)
    },
  },
  {
    id: "complete-signing",
    label: "The recipient can sign the document and mark it as complete - Positive",
    run: async (ctx) => {
      assert(ctx.signingToken, "No signing token")
      // Fill any remaining required fields, then complete
      const fieldsRes = await authReq("GET", `/sign/${ctx.signingToken}/fields`)
      const fj = await asJson(fieldsRes)
      for (const f of fj.data.fields as Array<{ id: string; type: string; signed: boolean }>) {
        if (!f.signed) {
          const value = f.type === "date" ? new Date().toISOString().slice(0, 10) : "Live Tester"
          await authReq("POST", `/sign/${ctx.signingToken}/fields/${f.id}`, { value, captureMethod: "auto" })
        }
      }
      const res = await authReq("POST", `/sign/${ctx.signingToken}/complete`)
      assert(res.status === 200, `Expected 200, got ${res.status}`)
      const j = await asJson(res)
      assert(j.data?.ok === true, "Complete did not return ok")
    },
  },
  {
    id: "unauth-protected",
    label: "Accessing a protected endpoint without being logged in returns an unauthorised response — the server does not crash - Negative",
    run: async () => {
      const res = await anonReq("GET", "/auth/me")
      assert(res.status === 401, `Expected 401, got ${res.status}`)
    },
  },
  {
    id: "malformed-body",
    label: "Sending a malformed request body returns a validation error — the server does not crash - Negative",
    run: async () => {
      const res = await anonReq("POST", "/auth/login", undefined, "{ this is not valid json")
      assert(res.status >= 400 && res.status < 500, `Expected 4xx, got ${res.status}`)
    },
  },
]
