import type { FastifyInstance } from "fastify"
import { getRecentMail } from "../lib/mailer.js"

// Read access to the in-memory mailbox (see lib/mailer.ts). Intentionally unauthenticated:
// this mirrors Mailhog's already-public inbox and exists so OTP codes can be read on the
// deploy where Mailhog's SMTP isn't reachable.
export async function devMailRoutes(fastify: FastifyInstance) {
  // Latest verification code for a recipient. Shape matches the web OTP proxy's response.
  fastify.get("/dev/mail", async (request, reply) => {
    const email = (request.query as { email?: string })?.email ?? ""
    if (!email) return reply.send({ otp: null, hasMail: false })

    const mail = getRecentMail().filter((m) => m.to.includes(email))
    const hasMail = mail.length > 0
    // Newest verification-code email wins.
    const otpMail = [...mail].reverse().find((m) => m.subject.includes("verification code"))
    const otp =
      otpMail?.html.match(/\b(\d{6})\b/)?.[1] ??
      otpMail?.subject.match(/\b(\d{6})\b/)?.[1] ??
      null

    return reply.send({ otp, hasMail })
  })

  // Recent captured messages, newest first, for the inbox page.
  fastify.get("/dev/mail/list", async (_request, reply) => {
    const items = [...getRecentMail()].reverse().map((m) => ({
      to: m.to,
      subject: m.subject,
      html: m.html,
      date: m.date,
    }))
    return reply.send({ data: { items } })
  })
}
