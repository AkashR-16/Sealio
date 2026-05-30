import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "@sealio/db"
import {
  getSigningRequest,
  authenticateOtp,
  streamSignedDocument,
} from "../services/signing.service.js"

function verifySigningCookie(
  fastify: FastifyInstance,
  rawCookie: string | undefined,
  token: string,
): { sub: string } | null {
  if (!rawCookie) return null
  try {
    const payload = fastify.jwt.verify<{ sub: string; signingToken: string; type: string }>(rawCookie)
    if (payload.type !== "signing" || payload.signingToken !== token) return null
    return payload
  } catch {
    return null
  }
}

export async function signingRoutes(fastify: FastifyInstance) {
  // GET /sign/:token — return document + signer metadata (no auth required)
  fastify.get("/sign/:token", async (request, reply) => {
    const { token } = request.params as { token: string }

    try {
      const sr = await getSigningRequest(token)
      return reply.send({
        data: {
          signerName: sr.signerName,
          signerEmail: sr.signerEmail,
          document: {
            id: sr.document.id,
            title: sr.document.title,
            status: sr.document.status,
          },
          status: sr.status,
          alreadyVerified: sr.otpVerifiedAt !== null,
        },
      })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({
        error: { code: "SIGNING_ERROR", message: err.message },
      })
    }
  })

  // POST /sign/:token/authenticate — verify OTP, issue signing JWT cookie
  fastify.post("/sign/:token/authenticate", async (request, reply) => {
    const { token } = request.params as { token: string }

    const result = z.object({ otp: z.string().length(6) }).safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        error: { code: "VALIDATION_ERROR", message: "OTP must be 6 digits" },
      })
    }

    try {
      const signingJwt = await authenticateOtp({ token, otp: result.data.otp, fastify })

      reply.setCookie("signing_token", signingJwt, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/sign",
        maxAge: 60 * 60 * 2, // 2h
      })

      return reply.send({ data: { authenticated: true } })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({
        error: { code: "AUTH_FAILED", message: err.message },
      })
    }
  })

  // GET /sign/:token/document — stream PDF (signing_token cookie required)
  fastify.get("/sign/:token/document", async (request, reply) => {
    const { token } = request.params as { token: string }

    // Verify the signing_token cookie
    const rawCookie = request.cookies?.signing_token
    if (!rawCookie) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "OTP verification required" },
      })
    }

    let payload: { sub: string; signingToken: string; type: string }
    try {
      payload = fastify.jwt.verify(rawCookie)
    } catch {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Invalid or expired signing session" },
      })
    }

    if (payload.type !== "signing" || payload.signingToken !== token) {
      return reply.status(401).send({
        error: { code: "UNAUTHORIZED", message: "Signing session mismatch" },
      })
    }

    try {
      const stream = await streamSignedDocument(token, payload.sub)
      return reply
        .header("Content-Type", "application/pdf")
        .header("Content-Disposition", "inline")
        .send(stream)
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({
        error: { code: "STREAM_ERROR", message: err.message },
      })
    }
  })

  // GET /sign/:token/fields — return document fields + existing signatures
  fastify.get("/sign/:token/fields", async (request, reply) => {
    const { token } = request.params as { token: string }
    const signerPayload = verifySigningCookie(fastify, request.cookies?.signing_token, token)
    if (!signerPayload) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "OTP verification required" } })
    }

    try {
      const sr = await prisma.signingRequest.findUnique({
        where: { id: signerPayload.sub, token },
        include: {
          document: { include: { fields: true } },
          signatures: true,
        },
      })
      if (!sr) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Signing request not found" } })

      const sigMap = new Map(sr.signatures.map((s) => [s.fieldId, s]))

      // Return only fields assigned to this signer
      const fields = sr.document.fields
        .filter((f) => f.assignedToEmail === sr.signerEmail)
        .map((f) => ({
          id: f.id,
          type: f.type,
          page: f.page,
          x: f.x,
          y: f.y,
          width: f.width,
          height: f.height,
          required: f.required,
          signed: sigMap.has(f.id),
          value: sigMap.get(f.id)?.value ?? null,
          captureMethod: sigMap.get(f.id)?.captureMethod ?? null,
        }))

      return reply.send({ data: { fields, documentTitle: sr.document.title } })
    } catch (err: any) {
      return reply.status(500).send({ error: { code: "ERROR", message: err.message } })
    }
  })

  // POST /sign/:token/fields/:fieldId — submit a field value
  fastify.post("/sign/:token/fields/:fieldId", async (request, reply) => {
    const { token, fieldId } = request.params as { token: string; fieldId: string }
    const signerPayload = verifySigningCookie(fastify, request.cookies?.signing_token, token)
    if (!signerPayload) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "OTP verification required" } })
    }

    const result = z.object({
      value: z.string().min(1),
      captureMethod: z.enum(["draw", "type", "upload", "auto"]),
    }).safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ error: { code: "VALIDATION_ERROR", message: result.error.issues[0].message } })
    }

    try {
      const sr = await prisma.signingRequest.findUnique({
        where: { id: signerPayload.sub, token },
        include: { document: { include: { fields: true } } },
      })
      if (!sr) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Signing request not found" } })
      if (sr.status === "signed" || sr.status === "declined") {
        return reply.status(409).send({ error: { code: "CONFLICT", message: "This signing request is already complete" } })
      }

      const field = sr.document.fields.find((f) => f.id === fieldId && f.assignedToEmail === sr.signerEmail)
      if (!field) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Field not found" } })

      // Upsert signature (allow re-signing a field)
      const signature = await prisma.signature.upsert({
        where: { fieldId },
        create: { signingRequestId: sr.id, fieldId, value: result.data.value, captureMethod: result.data.captureMethod },
        update: { value: result.data.value, captureMethod: result.data.captureMethod, signedAt: new Date() },
      })

      return reply.send({ data: { signature: { id: signature.id, fieldId, captureMethod: result.data.captureMethod } } })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: { code: "ERROR", message: err.message } })
    }
  })

  // POST /sign/:token/complete — mark signing request as signed
  fastify.post("/sign/:token/complete", async (request, reply) => {
    const { token } = request.params as { token: string }
    const signerPayload = verifySigningCookie(fastify, request.cookies?.signing_token, token)
    if (!signerPayload) {
      return reply.status(401).send({ error: { code: "UNAUTHORIZED", message: "OTP verification required" } })
    }

    // Optional page time tracking data: [{ page: number, seconds: number }]
    const pageTimesResult = z.object({
      pageTimes: z.array(z.object({ page: z.number().int().positive(), seconds: z.number().nonnegative() })).optional(),
    }).safeParse(request.body)
    const pageTimes = pageTimesResult.success ? pageTimesResult.data.pageTimes : undefined

    try {
      const sr = await prisma.signingRequest.findUnique({
        where: { id: signerPayload.sub, token },
        include: {
          document: { include: { fields: true } },
          signatures: true,
        },
      })
      if (!sr) return reply.status(404).send({ error: { code: "NOT_FOUND", message: "Signing request not found" } })
      if (sr.status === "signed") return reply.send({ data: { ok: true } })

      const myFields = sr.document.fields.filter((f) => f.assignedToEmail === sr.signerEmail)
      const requiredFields = myFields.filter((f) => f.required)
      const signedFieldIds = new Set(sr.signatures.map((s) => s.fieldId))
      const unsignedRequired = requiredFields.filter((f) => !signedFieldIds.has(f.id))

      if (unsignedRequired.length > 0) {
        return reply.status(422).send({
          error: { code: "INCOMPLETE", message: `${unsignedRequired.length} required field${unsignedRequired.length !== 1 ? "s" : ""} still need to be filled` },
        })
      }

      await prisma.signingRequest.update({
        where: { id: sr.id },
        data: {
          status: "signed",
          signedAt: new Date(),
          ...(pageTimes ? { pageViewData: pageTimes } : {}),
        },
      })

      return reply.send({ data: { ok: true } })
    } catch (err: any) {
      return reply.status(err.statusCode ?? 500).send({ error: { code: "ERROR", message: err.message } })
    }
  })
}
