import { randomInt } from "crypto"
import { hash, compare } from "bcryptjs"
import { prisma } from "@sealio/db"
import type { FastifyInstance } from "fastify"
import { sendMail } from "../lib/mailer.js"
import { env } from "../lib/env.js"
import { streamObject } from "../lib/minio.js"

export const OTP_TTL_MS = 10 * 60 * 1000   // 10 minutes
export const OTP_MAX_ATTEMPTS = 3

// ── OTP ───────────────────────────────────────────────────────────────────────

export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

export async function hashOtp(otp: string): Promise<string> {
  return hash(otp, 10)
}

export async function verifyOtpHash(otp: string, storedHash: string): Promise<boolean> {
  return compare(otp, storedHash)
}

// ── Emails ────────────────────────────────────────────────────────────────────

export async function sendInvitationEmail(opts: {
  to: string
  signerName: string
  senderName: string
  docTitle: string
  signingUrl: string
}): Promise<void> {
  const { to, signerName, senderName, docTitle, signingUrl } = opts
  await sendMail({
    to,
    subject: `${senderName} has requested your signature on "${docTitle}"`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="font-size:22px;font-weight:700;color:#111">You have a document to sign</h1>
        <p style="color:#555;margin-top:8px">
          Hi ${signerName}, <strong>${senderName}</strong> has requested your signature on
          <strong>${docTitle}</strong>.
        </p>
        <a href="${signingUrl}"
           style="display:inline-block;margin-top:24px;padding:12px 28px;background:#6ee7b7;color:#111;font-weight:700;border-radius:8px;text-decoration:none">
          Review &amp; Sign
        </a>
        <p style="margin-top:32px;font-size:12px;color:#999">
          If you didn't expect this, you can safely ignore this email.<br/>
          Link: ${signingUrl}
        </p>
      </div>`,
  })
}

export async function sendOtpEmail(opts: {
  to: string
  signerName: string
  docTitle: string
  otp: string
}): Promise<void> {
  const { to, signerName, docTitle, otp } = opts
  await sendMail({
    to,
    subject: `Your Sealio verification code: ${otp}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px 24px">
        <h1 style="font-size:22px;font-weight:700;color:#111">Verification code</h1>
        <p style="color:#555;margin-top:8px">
          Hi ${signerName}, use the code below to verify your identity and sign
          <strong>${docTitle}</strong>.
        </p>
        <div style="margin:28px 0;padding:20px;background:#f4f4f5;border-radius:10px;text-align:center">
          <span style="font-size:36px;font-weight:700;letter-spacing:8px;color:#111">${otp}</span>
        </div>
        <p style="font-size:13px;color:#999">This code expires in 10 minutes. Do not share it with anyone.</p>
      </div>`,
  })
}

// ── Send for signing ──────────────────────────────────────────────────────────

export async function sendDocumentForSigning(params: {
  documentId: string
  orgId: string
  senderName: string
  signers: { email: string; name: string }[]
}): Promise<void> {
  const { documentId, orgId, senderName, signers } = params

  const doc = await prisma.document.findFirst({
    where: { id: documentId, orgId },
    include: { fields: true },
  })
  if (!doc) {
    const err = new Error("Document not found") as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  if (doc.status !== "draft") {
    const err = new Error("Document has already been sent") as Error & { statusCode: number }
    err.statusCode = 409
    throw err
  }

  const fieldEmails = new Set(doc.fields.map((f) => f.assignedToEmail).filter(Boolean))
  if (fieldEmails.size === 0) {
    const err = new Error("No fields with assigned signers found") as Error & { statusCode: number }
    err.statusCode = 422
    throw err
  }

  // Validate all provided signers have fields assigned
  for (const s of signers) {
    if (!fieldEmails.has(s.email)) {
      const err = new Error(`Signer ${s.email} has no fields assigned`) as Error & { statusCode: number }
      err.statusCode = 422
      throw err
    }
  }

  // Create signing requests + send emails
  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < signers.length; i++) {
      const signer = signers[i]
      const otp = generateOtp()
      const otpHash = await hashOtp(otp)
      const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS)

      const sr = await tx.signingRequest.create({
        data: {
          documentId,
          signerEmail: signer.email,
          signerName: signer.name,
          order: i,
          status: "pending",
          otpHash,
          otpExpiresAt,
        },
      })

      const signingUrl = `${env.APP_URL}/sign/${sr.token}`

      // Fire emails — outside transaction so DB isn't held open during SMTP
      await Promise.all([
        sendInvitationEmail({ to: signer.email, signerName: signer.name, senderName, docTitle: doc.title, signingUrl }),
        sendOtpEmail({ to: signer.email, signerName: signer.name, docTitle: doc.title, otp }),
      ])
    }

    await tx.document.update({
      where: { id: documentId },
      data: { status: "sent" },
    })
  })
}

// ── OTP Resend ────────────────────────────────────────────────────────────────

export async function resendOtp(token: string): Promise<void> {
  const sr = await prisma.signingRequest.findUnique({
    where: { token },
    include: { document: { select: { title: true } } },
  })
  if (!sr) {
    const err = new Error("Invalid signing link") as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  if (sr.status === "signed" || sr.status === "declined") {
    const err = new Error("This signing request is already complete") as Error & { statusCode: number }
    err.statusCode = 409
    throw err
  }

  const otp = generateOtp()
  const otpHash = await hashOtp(otp)
  const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS)

  await prisma.signingRequest.update({
    where: { token },
    data: { otpHash, otpExpiresAt, otpAttempts: 0 },
  })

  await sendOtpEmail({ to: sr.signerEmail, signerName: sr.signerName, docTitle: sr.document.title, otp })
}

// ── Token validation ──────────────────────────────────────────────────────────

export async function getSigningRequest(token: string) {
  const sr = await prisma.signingRequest.findUnique({
    where: { token },
    include: { document: { select: { id: true, title: true, status: true } } },
  })
  if (!sr) {
    const err = new Error("Invalid signing link") as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  return sr
}

// ── OTP verification ──────────────────────────────────────────────────────────

export async function authenticateOtp(params: {
  token: string
  otp: string
  fastify: FastifyInstance
}): Promise<string> {
  const { token, otp, fastify } = params

  const sr = await prisma.signingRequest.findUnique({ where: { token } })
  if (!sr) {
    const err = new Error("Invalid signing link") as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }

  if (sr.status === "signed" || sr.status === "declined") {
    const err = new Error("This signing request is no longer active") as Error & { statusCode: number }
    err.statusCode = 409
    throw err
  }

  // Rate limit: invalidate after max attempts
  if (sr.otpAttempts >= OTP_MAX_ATTEMPTS) {
    const err = new Error("Too many failed attempts. Request a new code.") as Error & { statusCode: number }
    err.statusCode = 429
    throw err
  }

  // Check expiry
  if (!sr.otpHash || !sr.otpExpiresAt || sr.otpExpiresAt < new Date()) {
    const err = new Error("Verification code has expired") as Error & { statusCode: number }
    err.statusCode = 410
    throw err
  }

  const valid = await verifyOtpHash(otp, sr.otpHash)

  if (!valid) {
    await prisma.signingRequest.update({
      where: { id: sr.id },
      data: { otpAttempts: { increment: 1 } },
    })
    const remaining = OTP_MAX_ATTEMPTS - (sr.otpAttempts + 1)
    const err = new Error(
      remaining > 0
        ? `Invalid code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`
        : "Invalid code. No attempts remaining — request a new code.",
    ) as Error & { statusCode: number }
    err.statusCode = 401
    throw err
  }

  // Mark OTP as verified
  await prisma.signingRequest.update({
    where: { id: sr.id },
    data: { otpAttempts: 0, otpVerifiedAt: new Date() },
  })

  // Issue a short-lived signing JWT
  const signingJwt = fastify.jwt.sign(
    { sub: sr.id, signingToken: token, type: "signing" },
    { expiresIn: "2h" },
  )
  return signingJwt
}

// ── Document stream (post-auth) ───────────────────────────────────────────────

export async function streamSignedDocument(token: string, signingRequestId: string) {
  const sr = await prisma.signingRequest.findUnique({
    where: { id: signingRequestId, token },
    include: { document: true },
  })
  if (!sr || !sr.otpVerifiedAt) {
    const err = new Error("Not authenticated") as Error & { statusCode: number }
    err.statusCode = 401
    throw err
  }
  return streamObject(sr.document.filePath)
}
