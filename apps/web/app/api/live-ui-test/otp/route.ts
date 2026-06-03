import { NextRequest, NextResponse } from "next/server"
import { SERVER_API_URL } from "@/lib/api-base"

// Returns the latest 6-digit verification code for a recipient.
//
// Primary source is the API's in-memory mailbox (/dev/mail): on the single-origin deploy the
// API can't reach Mailhog's SMTP, so it captures outgoing mail itself. Falls back to Mailhog's
// HTTP API for local dev, where real SMTP delivery works.
const API = SERVER_API_URL
const MAILHOG = process.env.MAILHOG_URL ?? "http://localhost:8025"

interface MailItem {
  Content: { Headers: Record<string, string[]>; Body: string }
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email") ?? ""
  if (!email) return NextResponse.json({ otp: null, hasMail: false })

  // Primary: API in-memory mailbox.
  try {
    const res = await fetch(`${API}/dev/mail?email=${encodeURIComponent(email)}`, { cache: "no-store" })
    if (res.ok) {
      const data = (await res.json()) as { otp: string | null; hasMail: boolean }
      if (data.otp || data.hasMail) return NextResponse.json(data)
    }
  } catch {
    // fall through to Mailhog
  }

  // Fallback: Mailhog (local dev with real SMTP).
  try {
    const res = await fetch(`${MAILHOG}/api/v2/messages?limit=200`, { cache: "no-store" })
    const data = (await res.json()) as { items?: MailItem[] }
    const items = data.items ?? []
    const toEmail = (m: MailItem) => m.Content?.Headers?.To?.[0]?.includes(email) ?? false

    const hasMail = items.some(toEmail)
    const otpMail = items.find(
      (m) => (m.Content?.Headers?.Subject?.[0]?.includes("verification code") ?? false) && toEmail(m),
    )
    const otp = otpMail?.Content?.Body?.match(/\b(\d{6})\b/)?.[1] ?? null

    return NextResponse.json({ otp, hasMail })
  } catch {
    return NextResponse.json({ otp: null, hasMail: false })
  }
}
