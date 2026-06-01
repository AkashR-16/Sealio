import { hash, compare } from "bcryptjs"
import { prisma } from "@sealio/db"
import type { FastifyInstance } from "fastify"
import { env } from "../lib/env.js"

export interface SignupInput {
  name: string
  email: string
  password: string
  orgName: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface TokenPayload {
  sub: string
  orgId: string
  role: string
  type: "access" | "refresh"
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base)
  let attempt = 0
  while (true) {
    const candidate = attempt === 0 ? slug : `${slug}-${attempt}`
    const existing = await prisma.organization.findUnique({ where: { slug: candidate } })
    if (!existing) return candidate
    attempt++
  }
}

export async function signupUser(input: SignupInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } })
  if (existing) {
    const err = new Error("Email already in use") as Error & { statusCode: number }
    err.statusCode = 409
    throw err
  }

  const passwordHash = await hash(input.password, 12)
  const slug = await uniqueSlug(input.orgName)

  const org = await prisma.organization.create({
    data: { name: input.orgName, slug },
  })

  const user = await prisma.user.create({
    data: {
      orgId: org.id,
      email: input.email,
      name: input.name,
      passwordHash,
      role: "owner",
    },
  })

  return { user, org }
}

export async function loginUser(input: LoginInput) {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    include: { org: true },
  })

  if (!user) {
    const err = new Error("Invalid email or password") as Error & { statusCode: number }
    err.statusCode = 401
    throw err
  }

  const valid = await compare(input.password, user.passwordHash)
  if (!valid) {
    const err = new Error("Invalid email or password") as Error & { statusCode: number }
    err.statusCode = 401
    throw err
  }

  return { user, org: user.org }
}

export function issueTokens(
  fastify: FastifyInstance,
  payload: Omit<TokenPayload, "type">,
) {
  const access = fastify.jwt.sign(
    { ...payload, type: "access" },
    { expiresIn: env.JWT_ACCESS_EXPIRY },
  )
  const refresh = fastify.jwt.sign(
    { ...payload, type: "refresh" },
    { expiresIn: env.JWT_REFRESH_EXPIRY },
  )
  return { access, refresh }
}
