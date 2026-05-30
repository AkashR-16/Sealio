import nodemailer from "nodemailer"
import { env } from "./env.js"

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE === "true",
})

export async function sendMail(opts: {
  to: string
  subject: string
  html: string
}): Promise<void> {
  await transporter.sendMail({ from: env.SMTP_FROM, ...opts })
}
