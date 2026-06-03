"use server"

import { cookies } from "next/headers"
import { SERVER_API_URL as API_URL } from "./api-base"

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
}

export interface AuthOrg {
  id: string
  name: string
  slug: string
  plan: string
}

export interface AuthSession {
  user: AuthUser
  org: AuthOrg
}

export async function getSession(): Promise<AuthSession | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get("access_token")?.value
  if (!token) return null

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { Cookie: `access_token=${token}` },
      cache: "no-store",
    })
    if (!res.ok) return null
    const json = await res.json()
    return json.data as AuthSession
  } catch {
    return null
  }
}

export async function requireSession(): Promise<AuthSession> {
  const session = await getSession()
  if (!session) {
    const { redirect } = await import("next/navigation")
    redirect("/login")
    // redirect() throws internally — this line is unreachable
  }
  return session as AuthSession
}
