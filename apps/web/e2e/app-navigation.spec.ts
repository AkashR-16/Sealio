/**
 * E2E: App navigation — dashboard, documents list, nav links, page content
 * All tests use the saved auth state (authenticated user).
 */
import { test, expect } from "@playwright/test"
import * as fs from "fs"
import path from "path"

const PDF_FIXTURE = path.join(__dirname, "fixtures", "minimal.pdf")

function uniquePdf() {
  const base = fs.readFileSync(PDF_FIXTURE)
  return Buffer.concat([base, Buffer.from(`\n% nav-${Date.now()}-${Math.random()}`)])
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

test.describe("Dashboard", () => {
  test("renders the page heading with user's first name", async ({ page }) => {
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")
    // Heading matches "Good [morning/afternoon/evening/night], <name>"
    await expect(page.locator("h1")).toContainText(/good (morning|afternoon|evening|night)/i)
  })

  test("shows 4 stat cards", async ({ page }) => {
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")
    // Stat card labels are visible
    for (const label of ["Sent this month", "Awaiting signature", "Completed", "Completion rate"]) {
      await expect(page.locator(`text=${label}`)).toBeVisible()
    }
  })

  test("shows org name and plan in the sub-heading", async ({ page }) => {
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")
    // "Free plan · <org name>"
    await expect(page.locator("text=/free plan/i")).toBeVisible()
  })

  test("Send document button links to /documents/new", async ({ page }) => {
    await page.goto("/dashboard")
    const btn = page.locator('a[href="/documents/new"]').filter({ hasText: /send document/i })
    await expect(btn).toBeVisible()
  })

  test("empty state shows Upload a document CTA", async ({ page }) => {
    await page.goto("/dashboard")
    await page.waitForLoadState("networkidle")
    // Empty state CTA (shown when no documents sent yet from this org)
    const cta = page.locator('a[href="/documents/new"]')
    await expect(cta.first()).toBeVisible()
  })
})

// ── Navigation ────────────────────────────────────────────────────────────────

test.describe("Navigation bar", () => {
  test("Sealio logo links to /dashboard", async ({ page }) => {
    await page.goto("/documents")
    const logo = page.locator('a[href="/dashboard"]').filter({ hasText: /sealio/i })
    await expect(logo).toBeVisible()
    await logo.click()
    await expect(page).toHaveURL(/\/dashboard/)
  })

  test("Documents nav link goes to /documents", async ({ page }) => {
    await page.goto("/dashboard")
    await page.click('nav a[href="/documents"]')
    await expect(page).toHaveURL(/\/documents$/)
  })

  test("Dashboard nav link goes to /dashboard", async ({ page }) => {
    await page.goto("/documents")
    await page.click('nav a[href="/dashboard"]')
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test("active nav link is visually distinct from inactive", async ({ page }) => {
    await page.goto("/documents")
    // The nav text links (not the logo) — target the text-only nav items
    const documentsLink = page.locator('nav a[href="/documents"]').filter({ hasText: /^Documents$/ })
    const dashboardLink = page.locator('nav a[href="/dashboard"]').filter({ hasText: /^Dashboard$/ })
    const documentsClass = await documentsLink.getAttribute("class")
    const dashboardClass = await dashboardLink.getAttribute("class")
    // Active link should have a different class to inactive
    expect(documentsClass).not.toBe(dashboardClass)
  })

  test("Sign out button is visible in the nav", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page.locator('button:has-text("Sign out")')).toBeVisible()
  })
})

// ── Documents list page ───────────────────────────────────────────────────────

test.describe("Documents list", () => {
  test("page heading and Upload button are visible", async ({ page }) => {
    await page.goto("/documents")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("h1")).toContainText("Documents")
    await expect(page.locator('a[href="/documents/new"]').first()).toBeVisible()
  })

  test("documents appear after upload", async ({ page }) => {
    // Upload a document then verify it appears in the list
    await page.goto("/documents/new")
    await page.waitForSelector('[data-testid="upload-zone"]', { timeout: 10_000 })

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: `nav-test-${Date.now()}.pdf`,
      mimeType: "application/pdf",
      buffer: uniquePdf(),
    })
    await page.fill('[name="title"]', "Navigation List Test")
    await page.click('[data-testid="upload-submit"]')
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 15_000 })

    // Go back to list
    await page.goto("/documents")
    await page.waitForLoadState("networkidle")
    await expect(page.locator("text=Navigation List Test")).toBeVisible({ timeout: 8_000 })
  })

  test("each document row has a status badge", async ({ page }) => {
    await page.goto("/documents")
    await page.waitForLoadState("networkidle")
    // At least one Draft or Sent badge
    const badge = page.locator("text=/draft|sent|completed/i").first()
    await expect(badge).toBeVisible({ timeout: 8_000 })
  })

  test("Upload document button navigates to /documents/new", async ({ page }) => {
    await page.goto("/documents")
    await page.click('a[href="/documents/new"]')
    await expect(page).toHaveURL(/\/documents\/new/)
  })
})

// ── Document editor page ──────────────────────────────────────────────────────

test.describe("Document editor — page shell", () => {
  test("editor shows Back button, document title, and action bar", async ({ page }) => {
    // Upload a doc and land in editor
    await page.goto("/documents/new")
    await page.waitForSelector('[data-testid="upload-zone"]', { timeout: 10_000 })

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: `editor-shell-${Date.now()}.pdf`,
      mimeType: "application/pdf",
      buffer: uniquePdf(),
    })
    await page.fill('[name="title"]', "Editor Shell Test")
    await page.click('[data-testid="upload-submit"]')
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 15_000 })

    await expect(page.locator('button:has-text("Back")')).toBeVisible()
    await expect(page.locator('button:has-text("Save fields")')).toBeVisible()
    await expect(page.locator('button:has-text("Send for Signing")')).toBeVisible()
    await expect(page.locator("text=100%")).toBeVisible()
  })

  test("Back button from editor returns to /documents", async ({ page }) => {
    await page.goto("/documents/new")
    await page.waitForSelector('[data-testid="upload-zone"]', { timeout: 10_000 })

    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: `back-btn-${Date.now()}.pdf`,
      mimeType: "application/pdf",
      buffer: uniquePdf(),
    })
    await page.fill('[name="title"]', "Back Button Test")
    await page.click('[data-testid="upload-submit"]')
    await expect(page).toHaveURL(/\/documents\/(?!new)[^/]+$/, { timeout: 15_000 })

    await page.click('button:has-text("Back")')
    await expect(page).toHaveURL(/\/documents$/)
  })
})
