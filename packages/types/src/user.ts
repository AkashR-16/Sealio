export type UserRole = "owner" | "admin" | "member" | "viewer"

export type OrgPlan = "free" | "starter" | "pro" | "business" | "enterprise"

export interface User {
  id: string
  orgId: string
  email: string
  name: string
  role: UserRole
  avatarUrl?: string | null
  createdAt: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  plan: OrgPlan
  brandingConfig?: unknown | null
  createdAt: string
}

export interface Session {
  user: User
  org: Organization
}
