/**
 * E2E: Document editor — field placement, signer assignment, save/reload
 *
 * Prerequisites (all run via `docker compose up`):
 *   - Next.js on :3000
 *   - Fastify API on :3001
 *   - Postgres, MinIO, Redis, Mailhog
 *
 * The auth.setup.ts project must run first (handled by Playwright's `dependencies`).
 */
import { test, expect } from "@playwright/test"
import path from "path"
import * as fs from "fs"

const PDF_FIXTURE = path.join(__dirname, "fixtures", "minimal.pdf")

// Make a unique PDF by appending a random comment after %%EOF.
// This changes the SHA-256 hash so the API doesn't reject with 409 duplicate.
// pdfjs-dist ignores trailing bytes after %%EOF and renders normally.
function uniquePdf() {
  const base = fs.readFileSync(PDF_FIXTURE)
  return Buffer.concat([base, Buffer.from(`\n% ${Date.now()}-${Math.random()}`)])
}

// ─── Upload helper ─────────────────────────────────────────────────────────────

async function uploadDocument(page: import("@playwright/test").Page, title = "E2E Test Contract") {
  await page.goto("/documents/new")
  await page.waitForSelector('[data-testid="upload-zone"]', { timeout: 10_000 })

  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles({
    name: `test-${Date.now()}.pdf`,
    mimeType: "application/pdf",
    buffer: uniquePdf(),
  })
  await page.fill('[name="title"]', title)
  await page.click('[data-testid="upload-submit"]')

  // Wait for redirect to the editor — explicitly exclude /documents/new
  await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 15_000 })
  return page.url().split("/").at(-1)! // document ID
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test.describe("Document editor", () => {
  test("upload PDF → editor loads with empty state overlay", async ({ page }) => {
    await page.goto("/documents/new")
    const zone = page.locator('[data-testid="upload-zone"]')
    await expect(zone).toBeVisible()

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: "empty-state-test.pdf",
      mimeType: "application/pdf",
      buffer: uniquePdf(),
    })
    await page.fill('[name="title"]', "Empty State Test")
    await page.click('[data-testid="upload-submit"]')

    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 15_000 })

    // Empty-state overlay visible before any field is placed
    await expect(page.locator("text=No fields placed")).toBeVisible()
  })

  test("place a signature field on the PDF", async ({ page }) => {
    await uploadDocument(page, "Field Placement Test")

    // Wait for PDF to render (canvas appears)
    await page.waitForSelector("canvas", { timeout: 15_000 })

    // Click the Signature button in left sidebar
    await page.click("button:has-text('Signature')")

    // Click center of the PDF page to place field
    const canvas = page.locator("canvas").first()
    const box = await canvas.boundingBox()!
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)

    // Field appears on canvas
    await expect(page.locator("text=Signature").first()).toBeVisible()

    // Empty-state overlay gone
    await expect(page.locator("text=No fields placed")).not.toBeVisible()
  })

  test("delete a field via the X button", async ({ page }) => {
    await uploadDocument(page, "Delete Field Test")
    await page.waitForSelector("canvas", { timeout: 15_000 })

    // Place a text field
    await page.click("button:has-text('Text')")
    const canvas = page.locator("canvas").first()
    const box = await canvas.boundingBox()!
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)

    // Hover over the placed field to reveal delete button
    const field = page.locator(".group").filter({ hasText: "Text" }).first()
    await field.hover()

    // Click the delete (X) button
    const deleteBtn = field.locator("button[type=button]").filter({ has: page.locator("svg") })
    await deleteBtn.click()

    // Empty state returns
    await expect(page.locator("text=No fields placed")).toBeVisible()
  })

  test("add a signer, assign a field, save — fields persist on reload", async ({ page }) => {
    await uploadDocument(page, "Persist Test")
    await page.waitForSelector("canvas", { timeout: 15_000 })

    // Add signer in right panel — open form first
    await page.click('button:has-text("Add signer")')
    await page.fill('[placeholder*="name" i]', "Test Signer")
    await page.fill('[placeholder*="email" i]', "signer@example.com")
    await page.click('button:has-text("Add")')

    // Place a signature field
    await page.click("button:has-text('Signature')")
    const canvas = page.locator("canvas").first()
    const box = await canvas.boundingBox()!
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)

    // Select the field and assign to signer
    const field = page.locator(".group").filter({ hasText: "Signature" }).first()
    await field.click()
    await page.click('button:has-text("Test Signer")')

    // Save fields
    await page.click('button:has-text("Save fields")')

    // Toast appears
    await expect(page.locator("text=Fields saved")).toBeVisible({ timeout: 5_000 })

    // Reload and verify field persists
    await page.reload()
    await page.waitForSelector("canvas", { timeout: 15_000 })
    // The placed field (not the palette button) persists after reload
    await expect(page.locator(".group").filter({ hasText: "Signature" })).toBeVisible()
  })

  test("Send for Signing button disabled with no fields", async ({ page }) => {
    await uploadDocument(page, "Send Disabled Test")
    await page.waitForSelector('button:has-text("Send for Signing")', { timeout: 15_000 })

    const sendBtn = page.locator("button:has-text('Send for Signing')")
    await expect(sendBtn).toBeDisabled()
  })

  test("Send for Signing button disabled when field has no signer assigned", async ({ page }) => {
    await uploadDocument(page, "Send Unassigned Test")
    await page.waitForSelector("canvas", { timeout: 15_000 })

    // Place field without assigning signer
    await page.click("button:has-text('Signature')")
    const canvas = page.locator("canvas").first()
    const box = await canvas.boundingBox()!
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)

    const sendBtn = page.locator("button:has-text('Send for Signing')")
    await expect(sendBtn).toBeDisabled()
  })

  test("resize handles appear on selected field", async ({ page }) => {
    await uploadDocument(page, "Resize Test")
    await page.waitForSelector("canvas", { timeout: 15_000 })

    // Place a signature field
    await page.click("button:has-text('Signature')")
    const canvas = page.locator("canvas").first()
    const box = await canvas.boundingBox()!
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2)

    // Click the field to select it
    const field = page.locator(".group").filter({ hasText: "Signature" }).first()
    await field.click()

    // 8 resize handle squares should appear (z-20 class)
    const handles = page.locator(".z-20")
    await expect(handles).toHaveCount(8)
  })

  test("zoom controls update scale display", async ({ page }) => {
    await uploadDocument(page, "Zoom Test")
    await page.waitForSelector('[title="zoom-in"]', { timeout: 15_000 })

    // Default is 100%
    await expect(page.locator("text=100%")).toBeVisible()

    // Zoom in
    await page.click('[title="zoom-in"], button:has(svg.lucide-zoom-in)')
    await expect(page.locator("text=125%")).toBeVisible()

    // Zoom out twice
    await page.click('[title="zoom-out"], button:has(svg.lucide-zoom-out)')
    await page.click('[title="zoom-out"], button:has(svg.lucide-zoom-out)')
    await expect(page.locator("text=75%")).toBeVisible()
  })
})

// ─── Upload validation ─────────────────────────────────────────────────────────

test.describe("Upload validation", () => {
  test("uploading a non-PDF shows an error", async ({ page }) => {
    await page.goto("/documents/new")
    await page.waitForSelector('[data-testid="upload-zone"]', { timeout: 10_000 })

    // Create a fake JPEG file in memory
    const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46])

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: "photo.pdf",
      mimeType: "application/pdf",
      buffer: jpegBytes,
    })

    await page.fill('[name="title"]', "Bad File")
    await page.click('[data-testid="upload-submit"]')

    // Error toast or inline error — API returns "Only PDF files are supported"
    await expect(page.locator('[class*="error"]').filter({ hasText: /PDF|invalid|unsupported/i })).toBeVisible({ timeout: 8_000 })
  })
})
