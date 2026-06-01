import nodemailer from "nodemailer"
import { env } from "./env.js"

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE === "true",
})

export interface CapturedMail {
  to: string
  subject: string
  html: string
  date: string
}

// In-memory mailbox. On the public (single-origin) deploy the API can't reach Mailhog's
// SMTP port over Render's private network, so every outgoing message is also captured here
// and read back via /dev/mail (the OTP proxy + inbox page). Capped to the most recent
// messages; resets on restart — fine, since OTPs are read within seconds and expire in 10m.
const MAX_MAIL = 100
const recentMail: CapturedMail[] = []

export function getRecentMail(): CapturedMail[] {
  return recentMail
}

export async function sendMail(opts: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  recentMail.push({ to: opts.to, subject: opts.subject, html: opts.html, date: new Date().toISOString() })
  if (recentMail.length > MAX_MAIL) recentMail.shift()

  try {
    await transporter.sendMail({ from: env.SMTP_FROM, ...opts })
  } catch (err) {
    // Non-fatal: SMTP (Mailhog) may be unreachable on the deploy. The message is still
    // captured in `recentMail` above and remains readable via /dev/mail.
    console.warn(`sendMail: SMTP delivery failed, captured in-memory only — ${(err as Error).message}`)
  }
}
