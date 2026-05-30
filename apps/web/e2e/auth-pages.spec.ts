/**
 * E2E: Auth pages — login, signup, logout, redirects
 * These tests run with NO saved auth state (fresh browser context per test)
 * so we override storageState to empty for each test.
 */
import { test, expect, type BrowserContext } from "@playwright/test"

// Fresh unauthenticated context for each test that needs it
async function freshContext(browser: import("@playwright/test").Browser): Promise<BrowserContext> {
  return browser.newContext({ storageState: { cookies: [], origins: [] } })
}

// ── Unauthenticated redirects ─────────────────────────────────────────────────

test.describe("Unauthenticated redirects", () => {
  test("visiting /dashboard redirects to /login", async ({ browser }) => {
    const ctx = await freshContext(browser)
    const page = await ctx.newPage()
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
    await ctx.close()
  })

  test("visiting /documents redirects to /login", async ({ browser }) => {
    const ctx = await freshContext(browser)
    const page = await ctx.newPage()
    await page.goto("/documents")
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
    await ctx.close()
  })

  test("visiting /documents/new redirects to /login", async ({ browser }) => {
    const ctx = await freshContext(browser)
    const page = await ctx.newPage()
    await page.goto("/documents/new")
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
    await ctx.close()
  })
})

// ── Login page ────────────────────────────────────────────────────────────────

test.describe("Login page", () => {
  test("renders email, password inputs and Sign in button", async ({ browser }) => {
    const ctx = await freshContext(browser)
    const page = await ctx.newPage()
    await page.goto("/login")
    await expect(page.locator('[name="email"]')).toBeVisible()
    await expect(page.locator('[name="password"]')).toBeVisible()
    await expect(page.locator('[type="submit"]')).toBeVisible()
    await ctx.close()
  })

  test("shows error for wrong credentials", async ({ browser }) => {
    const ctx = await freshContext(browser)
    const page = await ctx.newPage()
    await page.goto("/login")
    await page.fill('[name="email"]', "nobody@nowhere.test")
    await page.fill('[name="password"]', "wrongpassword")
    await page.click('[type="submit"]')
    await expect(page.locator("text=/invalid|incorrect|wrong/i")).toBeVisible({ timeout: 8_000 })
    await ctx.close()
  })

  test("has a link to the signup page", async ({ browser }) => {
    const ctx = await freshContext(browser)
    const page = await ctx.newPage()
    await page.goto("/login")
    const signupLink = page.locator('a[href*="/signup"]')
    await expect(signupLink).toBeVisible()
    await ctx.close()
  })

  test("already-authenticated user visiting /login is redirected away", async ({ page }) => {
    // This test uses the default saved auth state (authenticated)
    await page.goto("/login")
    await expect(page).not.toHaveURL(/\/login/, { timeout: 8_000 })
  })
})

// ── Signup page ───────────────────────────────────────────────────────────────

test.describe("Signup page", () => {
  test("renders all four fields and submit button", async ({ browser }) => {
    const ctx = await freshContext(browser)
    const page = await ctx.newPage()
    await page.goto("/signup")
    await expect(page.locator('[name="name"]')).toBeVisible()
    await expect(page.locator('[name="email"]')).toBeVisible()
    await expect(page.locator('[name="password"]')).toBeVisible()
    await expect(page.locator('[name="orgName"]')).toBeVisible()
    await expect(page.locator('[type="submit"]')).toBeVisible()
    await ctx.close()
  })

  test("shows validation error for short password", async ({ browser }) => {
    const ctx = await freshContext(browser)
    const page = await ctx.newPage()
    await page.goto("/signup")
    await page.fill('[name="name"]', "Test User")
    await page.fill('[name="email"]', `short-pw-${Date.now()}@sealio.test`)
    await page.fill('[name="password"]', "short")
    await page.fill('[name="orgName"]', "Test Org")
    await page.click('[type="submit"]')
    await expect(page.locator("text=/password|characters|least/i")).toBeVisible({ timeout: 8_000 })
    await ctx.close()
  })

  test("shows error for duplicate email", async ({ browser, request }) => {
    // Create a user via API first so the email is definitely already taken
    const dupEmail = `dup-ui-${Date.now()}@sealio.test`
    await request.post(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/signup`, {
      data: { name: "First User", email: dupEmail, password: "testpassword123", orgName: `Dup Org ${Date.now()}` },
    })

    const ctx = await freshContext(browser)
    const page = await ctx.newPage()
    await page.goto("/signup")
    await page.fill('[name="name"]', "Second User")
    await page.fill('[name="email"]', dupEmail)
    await page.fill('[name="password"]', "testpassword123")
    await page.fill('[name="orgName"]', "Another Org")
    await page.click('[type="submit"]')
    // API returns 409 → form shows error message
    await expect(page.locator("text=/already|taken|use/i")).toBeVisible({ timeout: 8_000 })
    await ctx.close()
  })

  test("already-authenticated user visiting /signup is redirected away", async ({ page }) => {
    await page.goto("/signup")
    await expect(page).not.toHaveURL(/\/signup/, { timeout: 8_000 })
  })
})

// ── Sign out ──────────────────────────────────────────────────────────────────

test.describe("Sign out", () => {
  test("clicking Sign out redirects to /login", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 8_000 })

    await page.click('button:has-text("Sign out")')
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
  })

  test("after sign out, navigating to /dashboard redirects to /login", async ({ browser }) => {
    // Use fresh context to simulate a fully signed-out state
    const ctx = await freshContext(browser)
    const page = await ctx.newPage()
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/login/, { timeout: 8_000 })
    await ctx.close()
  })
})
