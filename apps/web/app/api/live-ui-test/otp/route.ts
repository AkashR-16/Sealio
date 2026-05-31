import { NextRequest, NextResponse } from "next/server"

// Dev-only proxy: Mailhog (localhost:8025) does not send CORS headers, so the
// browser cannot read it directly. This same-origin route reads it server-side
// and returns the latest verification code for a given recipient.

const MAILHOG = process.env.MAILHOG_URL ?? "http://localhost:8025"

interface MailItem {
  Content: { Headers: Record<string, string[]>; Body: string }
}

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email") ?? ""
  if (!email) return NextResponse.json({ otp: null, hasMail: false })

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
