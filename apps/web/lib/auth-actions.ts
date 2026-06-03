"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { SERVER_API_URL as API_URL } from "./api-base"

// Seeded tester account used by the one-click "Tester" button. Kept server-side (never shipped
// to the client) so the shared demo credentials aren't exposed. Override via env if reseeded.
const TESTER_EMAIL = process.env.TESTER_EMAIL ?? "testuser@sealio.local"
const TESTER_PASSWORD = process.env.TESTER_PASSWORD ?? "password123"

function parseSetCookie(header: string): { name: string; value: string; options: Record<string, string> } {
  const parts = header.split(";").map((p) => p.trim())
  const [nameValue, ...attrs] = parts
  const [name, value] = nameValue.split("=")
  const options: Record<string, string> = {}
  for (const attr of attrs) {
    const [k, v] = attr.split("=")
    options[k.toLowerCase()] = v ?? "true"
  }
  return { name, value, options }
}

async function forwardCookies(response: Response) {
  const cookieStore = await cookies()
  const setCookieHeaders = response.headers.getSetCookie()
  for (const header of setCookieHeaders) {
    const { name, value, options } = parseSetCookie(header)
    cookieStore.set(name, value, {
      httpOnly: true,
      secure: options["secure"] === "true",
      sameSite: (options["samesite"] as "lax" | "strict" | "none") ?? "lax",
      path: options["path"] ?? "/",
      maxAge: options["max-age"] ? Number(options["max-age"]) : undefined,
    })
  }
}

export async function signupAction(_prev: unknown, formData: FormData) {
  const name = formData.get("name") as string
  const email = formData.get("email") as string
  const password = formData.get("password") as string
  const orgName = formData.get("orgName") as string

  if (!name || !email || !password || !orgName) {
    return { error: "All fields are required" }
  }
  if (password.length < 8) {
    return { error: "Password must be at least 8 characters" }
  }

  try {
    const res = await fetch(`${API_URL}/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, orgName }),
    })

    const json = await res.json()
    if (!res.ok) return { error: json.error?.message ?? "Signup failed" }

    await forwardCookies(res)
  } catch {
    return { error: "Could not connect to server. Is the API running?" }
  }

  redirect("/dashboard")
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = formData.get("email") as string
  const password = formData.get("password") as string

  if (!email || !password) {
    return { error: "Email and password are required" }
  }

  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })

    const json = await res.json()
    if (!res.ok) return { error: json.error?.message ?? "Login failed" }

    await forwardCookies(res)
  } catch {
    return { error: "Could not connect to server. Is the API running?" }
  }

  redirect("/dashboard")
}

// One-click tester sign-in: authenticates as the seeded tester account and lands on the
// dashboard, so demo testers don't need to be handed the shared credentials.
export async function loginAsTesterAction() {
  let ok = false
  try {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: TESTER_EMAIL, password: TESTER_PASSWORD }),
    })
    if (res.ok) {
      await forwardCookies(res)
      ok = true
    }
  } catch {
    ok = false
  }

  // redirect() throws, so call it outside the try/catch.
  if (!ok) redirect("/login?error=tester-unavailable")
  redirect("/dashboard")
}

export async function logoutAction() {
  const cookieStore = await cookies()
  const token = cookieStore.get("access_token")?.value

  if (token) {
    await fetch(`${API_URL}/auth/logout`, {
      method: "POST",
      headers: { Cookie: `access_token=${token}` },
    }).catch(() => {})
  }

  cookieStore.delete("access_token")
  cookieStore.delete("refresh_token")
  redirect("/login")
}
