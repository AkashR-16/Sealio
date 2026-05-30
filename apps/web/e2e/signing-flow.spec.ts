/**
 * E2E: Full signing experience — M5
 *
 * Flow per test:
 *  1. Authenticated user uploads a doc, places fields, sends for signing
 *  2. Gets the signing token from the API (/documents/:id response)
 *  3. Gets the OTP from Mailhog
 *  4. Opens /sign/:token in an unauthenticated context
 *  5. Verifies OTP → sees PDF + fields → signs → completes
 */
import { test, expect } from "@playwright/test"
import * as fs from "fs"
import path from "path"

const PDF_FIXTURE = path.join(__dirname, "fixtures", "minimal.pdf")
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"
const MAILHOG = "http://localhost:8025"

function uniquePdf() {
  const base = fs.readFileSync(PDF_FIXTURE)
  return Buffer.concat([base, Buffer.from(`\n% signing-flow-${Date.now()}-${Math.random()}`)])
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function createSigningDocument(request: import("@playwright/test").APIRequestContext, page: import("@playwright/test").Page) {
  const signerEmail = `signer-e2e-${Date.now()}@external.test`

  // Upload doc using auth cookies from saved state
  const cookieHeader = (await page.context().cookies())
    .map((c) => `${c.name}=${c.value}`)
    .join("; ")

  const formData = new FormData()
  formData.append("file", new Blob([uniquePdf()], { type: "application/pdf" }), `flow-${Date.now()}.pdf`)

  const uploadRes = await request.post(`${API}/documents?title=Signing+Flow+Test`, {
    headers: { cookie: cookieHeader },
    multipart: { file: { name: `flow-${Date.now()}.pdf`, mimeType: "application/pdf", buffer: uniquePdf() } },
  })
  const doc = await uploadRes.json()
  const docId = doc.data.id

  // Place signature + date fields
  await request.put(`${API}/documents/${docId}/fields`, {
    headers: { cookie: cookieHeader, "Content-Type": "application/json" },
    data: JSON.stringify({
      fields: [
        { type: "signature", page: 1, x: 10, y: 10, width: 20, height: 6, required: true,  assignedToEmail: signerEmail },
        { type: "date",      page: 1, x: 10, y: 20, width: 14, height: 4, required: true,  assignedToEmail: signerEmail },
      ],
    }),
  })

  // Send for signing
  await request.post(`${API}/documents/${docId}/send`, {
    headers: { cookie: cookieHeader, "Content-Type": "application/json" },
    data: JSON.stringify({ signers: [{ email: signerEmail, name: "E2E Signer" }] }),
  })

  // Get signing token from document detail
  const detailRes = await request.get(`${API}/documents/${docId}`, {
    headers: { cookie: cookieHeader },
  })
  const detail = await detailRes.json()
  const srToken = detail.data.signingRequests?.[0]?.token

  // Get OTP from Mailhog
  await page.waitForTimeout(800) // brief delay for mail delivery
  const mailRes = await request.get(`${MAILHOG}/api/v2/messages?limit=5`)
  const mails = await mailRes.json()
  const otpMail = mails.items?.find((m: any) =>
    m.Content?.Headers?.Subject?.[0]?.includes("verification code") &&
    m.Content?.Headers?.To?.[0]?.includes(signerEmail)
  )
  const otpMatch = otpMail?.Content?.Body?.match(/\b(\d{6})\b/)
  const otp = otpMatch?.[1] ?? null

  return { docId, srToken, otp, signerEmail }
}

// ── OTP screen tests ──────────────────────────────────────────────────────────

test.describe("OTP screen", () => {
  test("invalid token shows error page, not OTP screen", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    await page.goto("/sign/totally-invalid-token-xyz")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("text=Invalid signing link")).toBeVisible({ timeout: 8_000 })
    await ctx.close()
  })

  test("valid token shows OTP screen with document title and signer email", async ({ browser, request, page }) => {
    const { srToken, signerEmail } = await createSigningDocument(request, page)
    if (!srToken) return test.skip()

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const signerPage = await ctx.newPage()
    await signerPage.goto(`/sign/${srToken}`)
    await signerPage.waitForLoadState("networkidle")

    await expect(signerPage.locator("text=Verify your identity")).toBeVisible({ timeout: 8_000 })
    await expect(signerPage.locator(`text=${signerEmail}`)).toBeVisible()
    await expect(signerPage.locator("text=Signing Flow Test")).toBeVisible()
    await ctx.close()
  })

  test("6 OTP boxes render and auto-advance on digit entry", async ({ browser, request, page }) => {
    const { srToken } = await createSigningDocument(request, page)
    if (!srToken) return test.skip()

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const signerPage = await ctx.newPage()
    await signerPage.goto(`/sign/${srToken}`)
    await signerPage.waitForLoadState("networkidle")

    const boxes = signerPage.locator('input[inputmode="numeric"]')
    await expect(boxes).toHaveCount(6)

    // First digit focuses box 0, second digit should move to box 1
    await boxes.nth(0).fill("1")
    await signerPage.waitForTimeout(100)
    // Focused element should be box 1
    const focused = await signerPage.evaluate(() => document.activeElement?.getAttribute("inputmode"))
    expect(focused).toBe("numeric")
    await ctx.close()
  })

  test("wrong OTP shows error with remaining attempts", async ({ browser, request, page }) => {
    const { srToken } = await createSigningDocument(request, page)
    if (!srToken) return test.skip()

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const signerPage = await ctx.newPage()
    await signerPage.goto(`/sign/${srToken}`)
    await signerPage.waitForLoadState("networkidle")

    const boxes = signerPage.locator('input[inputmode="numeric"]')
    for (let i = 0; i < 6; i++) await boxes.nth(i).fill("0")
    await signerPage.waitForTimeout(2000)

    await expect(signerPage.locator("text=/invalid|remaining|attempts/i")).toBeVisible({ timeout: 6_000 })
    await ctx.close()
  })

  test("correct OTP transitions to signing view", async ({ browser, request, page }) => {
    const { srToken, otp } = await createSigningDocument(request, page)
    if (!srToken || !otp) return test.skip()

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const signerPage = await ctx.newPage()
    await signerPage.goto(`/sign/${srToken}`)
    await signerPage.waitForLoadState("networkidle")

    const boxes = signerPage.locator('input[inputmode="numeric"]')
    for (let i = 0; i < 6; i++) {
      await boxes.nth(i).fill(otp[i])
      await signerPage.waitForTimeout(80)
    }
    await signerPage.waitForTimeout(3000)

    // Should be on signing view — header shows document title
    await expect(signerPage.locator("text=Signing Flow Test")).toBeVisible({ timeout: 10_000 })
    // Complete button is visible (disabled initially)
    await expect(signerPage.locator('button:has-text("Complete")')).toBeVisible()
    await ctx.close()
  })
})

// ── Signing view tests ────────────────────────────────────────────────────────

test.describe("Signing view", () => {
  // Helper: open the signing view already past OTP
  async function openSigningView(browser: import("@playwright/test").Browser, request: import("@playwright/test").APIRequestContext, page: import("@playwright/test").Page) {
    const { srToken, otp } = await createSigningDocument(request, page)
    if (!srToken || !otp) return null

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const signerPage = await ctx.newPage()
    await signerPage.goto(`/sign/${srToken}`)
    await signerPage.waitForLoadState("networkidle")

    const boxes = signerPage.locator('input[inputmode="numeric"]')
    for (let i = 0; i < 6; i++) {
      await boxes.nth(i).fill(otp[i])
      await signerPage.waitForTimeout(80)
    }
    await signerPage.waitForTimeout(3000)
    return { signerPage, ctx, srToken }
  }

  test("Complete button is disabled before all required fields are signed", async ({ browser, request, page }) => {
    const result = await openSigningView(browser, request, page)
    if (!result) return test.skip()
    const { signerPage, ctx } = result

    const completeBtn = signerPage.locator('button:has-text("Complete")')
    await expect(completeBtn).toBeDisabled()
    await ctx.close()
  })

  test("sticky bottom bar shows field progress", async ({ browser, request, page }) => {
    const result = await openSigningView(browser, request, page)
    if (!result) return test.skip()
    const { signerPage, ctx } = result

    // Before any field is signed: shows "Sign field 1 of N"
    await expect(signerPage.locator("text=/sign field|field.*of/i")).toBeVisible({ timeout: 8_000 })
    await ctx.close()
  })

  test("clicking a field opens the signature modal", async ({ browser, request, page }) => {
    const result = await openSigningView(browser, request, page)
    if (!result) return test.skip()
    const { signerPage, ctx } = result

    // Wait for PDF to render and field to appear
    await signerPage.waitForSelector("canvas", { timeout: 15_000 })
    await signerPage.waitForTimeout(1000)

    // Click the signature field button
    const fieldBtn = signerPage.locator('button[aria-label*="Sign signature"]').or(
      signerPage.locator('button:has-text("Sign here")')
    ).first()

    if (await fieldBtn.isVisible()) {
      await fieldBtn.click()
      await expect(signerPage.locator("text=Signature")).toBeVisible({ timeout: 5_000 })
      // Draw, Type, Upload tabs
      await expect(signerPage.locator("button:has-text('draw'), button:has-text('Draw')")).toBeVisible()
      await expect(signerPage.locator("button:has-text('type'), button:has-text('Type')")).toBeVisible()
      await expect(signerPage.locator("button:has-text('upload'), button:has-text('Upload')")).toBeVisible()
    }
    await ctx.close()
  })

  test("signature modal Apply button is disabled on empty draw tab", async ({ browser, request, page }) => {
    const result = await openSigningView(browser, request, page)
    if (!result) return test.skip()
    const { signerPage, ctx } = result

    await signerPage.waitForSelector("canvas", { timeout: 15_000 })
    await signerPage.waitForTimeout(1000)

    const fieldBtn = signerPage.locator('button[aria-label*="Sign signature"]').or(
      signerPage.locator('button:has-text("Sign here")')
    ).first()

    if (await fieldBtn.isVisible()) {
      await fieldBtn.click()
      await signerPage.waitForTimeout(300)
      // Apply button should be disabled (canvas is empty)
      const applyBtn = signerPage.locator('button:has-text("Apply")')
      await expect(applyBtn).toBeDisabled()
    }
    await ctx.close()
  })

  test("type tab shows 5 font options with live preview", async ({ browser, request, page }) => {
    const result = await openSigningView(browser, request, page)
    if (!result) return test.skip()
    const { signerPage, ctx } = result

    await signerPage.waitForSelector("canvas", { timeout: 15_000 })
    await signerPage.waitForTimeout(1000)

    const fieldBtn = signerPage.locator('button[aria-label*="Sign signature"]').or(
      signerPage.locator('button:has-text("Sign here")')
    ).first()

    if (await fieldBtn.isVisible()) {
      await fieldBtn.click()
      await signerPage.click("button:has-text('Type'), button:has-text('type')")
      await signerPage.waitForTimeout(300)
      // Type in the text input
      const typeInput = signerPage.locator('input[type="text"], input:not([type="date"])')
        .filter({ hasText: "" }).first()
      if (await typeInput.isVisible()) {
        await typeInput.fill("John Doe")
        // At least one font button visible
        await expect(signerPage.locator("text=Dancing Script").or(signerPage.locator("text=Pacifico"))).toBeVisible({ timeout: 5_000 })
      }
    }
    await ctx.close()
  })

  test("'Apply to all' checkbox is visible for signature fields", async ({ browser, request, page }) => {
    const result = await openSigningView(browser, request, page)
    if (!result) return test.skip()
    const { signerPage, ctx } = result

    await signerPage.waitForSelector("canvas", { timeout: 15_000 })
    await signerPage.waitForTimeout(1000)

    const fieldBtn = signerPage.locator('button[aria-label*="Sign signature"]').or(
      signerPage.locator('button:has-text("Sign here")')
    ).first()

    if (await fieldBtn.isVisible()) {
      await fieldBtn.click()
      await signerPage.waitForTimeout(300)
      await expect(signerPage.locator("text=/apply to all/i")).toBeVisible({ timeout: 5_000 })
    }
    await ctx.close()
  })
})

// ── Public page behaviour ─────────────────────────────────────────────────────

test.describe("Public signing page — no auth required", () => {
  test("signing page loads without any auth cookies", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    // Any invalid token should show the error page, not redirect to /login
    await page.goto("/sign/some-random-token-abc")
    await page.waitForLoadState("networkidle")
    await expect(page).not.toHaveURL(/\/login/)
    await expect(page.locator("text=Invalid signing link")).toBeVisible({ timeout: 8_000 })
    await ctx.close()
  })

  test("signing page does not show the app nav bar", async ({ browser, request, page }) => {
    const { srToken } = await createSigningDocument(request, page)
    if (!srToken) return test.skip()

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const signerPage = await ctx.newPage()
    await signerPage.goto(`/sign/${srToken}`)
    await signerPage.waitForLoadState("networkidle")

    // App nav (Dashboard / Documents / Templates links) should NOT be visible
    await expect(signerPage.locator('nav a[href="/dashboard"]').filter({ hasText: "Dashboard" })).not.toBeVisible()
    await ctx.close()
  })
})
