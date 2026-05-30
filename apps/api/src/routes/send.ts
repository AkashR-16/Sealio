import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "@sealio/db"
import { sendDocumentForSigning } from "../services/signing.service.js"

const sendSchema = z.object({
  signers: z
    .array(
      z.object({
        email: z.string().email(),
        name: z.string().min(1).max(100),
      }),
    )
    .min(1),
})

export async function sendRoutes(fastify: FastifyInstance) {
  // POST /documents/:id/send
  fastify.post(
    "/documents/:id/send",
    { preHandler: [fastify.authenticate] },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const user = request.user as { sub: string; orgId: string; name?: string }

      const result = sendSchema.safeParse(request.body)
      if (!result.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: result.error.issues[0].message },
        })
      }

      // Deduplicate signers by email (last name wins)
      const signerMap = new Map<string, string>()
      for (const s of result.data.signers) {
        signerMap.set(s.email, s.name)
      }
      const signers = Array.from(signerMap.entries()).map(([email, name]) => ({ email, name }))

      try {
        const sender = await prisma.user.findUnique({ where: { id: user.sub }, select: { name: true } })
        await sendDocumentForSigning({
          documentId: id,
          orgId: user.orgId,
          senderName: sender?.name ?? "Sealio User",
          signers,
        })
        return reply.status(200).send({ data: { ok: true } })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({
          error: { code: "SEND_FAILED", message: err.message },
        })
      }
    },
  )
}
