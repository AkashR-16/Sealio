/**
 * Auth setup — runs once before all Playwright tests.
 * Signs up (or logs in) a test user and saves the auth cookies so all
 * subsequent tests can start already logged in.
 */
import { test as setup, expect } from "@playwright/test"

const TEST_EMAIL = `e2e-test-${Date.now()}@sealio.test`
const TEST_PASSWORD = "testpassword123"
const AUTH_FILE = "e2e/.auth/user.json"

setup("authenticate", async ({ page }) => {
  // Always start fresh — clear any cookies from a previous run so we don't
  // land on /dashboard instead of the signup form.
  await page.context().clearCookies()

  await page.goto("/signup")

  // Middleware redirects authenticated users away from /signup → /login.
  // Use login form if that happens (e.g. re-using seeded creds via env vars).
  if (page.url().includes("/login")) {
    await page.fill('[name="email"]', process.env.E2E_EMAIL ?? TEST_EMAIL)
    await page.fill('[name="password"]', process.env.E2E_PASSWORD ?? TEST_PASSWORD)
    await page.click('[type="submit"]')
  } else {
    await page.fill('[name="name"]', "E2E Test User")
    await page.fill('[name="email"]', TEST_EMAIL)
    await page.fill('[name="password"]', TEST_PASSWORD)
    await page.fill('[name="orgName"]', "E2E Test Org")
    await page.click('[type="submit"]')
  }

  // Wait for redirect to dashboard
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 10_000 })

  // Save auth cookies for all subsequent tests
  await page.context().storageState({ path: AUTH_FILE })
})
