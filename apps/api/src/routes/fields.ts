import type { FastifyInstance } from "fastify"
import { z } from "zod"
import { prisma } from "@sealio/db"
import type { TokenPayload } from "../services/auth.service.js"

const fieldSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["signature", "initials", "date", "full_name", "text", "checkbox", "dropdown"]),
  page: z.number().int().min(1),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(2).max(100),
  height: z.number().min(2).max(100),
  required: z.boolean().default(true),
  assignedToEmail: z.union([z.string().email(), z.literal("")]),
}).refine((f) => f.x + f.width <= 100, { message: "Field exceeds page width (x + width > 100)" })
  .refine((f) => f.y + f.height <= 100, { message: "Field exceeds page height (y + height > 100)" })

const saveFieldsSchema = z.object({
  fields: z.array(fieldSchema),
})

export async function fieldRoutes(fastify: FastifyInstance) {
  // PUT /documents/:id/fields — replace all fields for a document
  fastify.put(
    "/documents/:id/fields",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user as TokenPayload
      const { id } = request.params as { id: string }

      // Verify document belongs to org
      const doc = await prisma.document.findFirst({
        where: { id, orgId: user.orgId },
      })
      if (!doc) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Document not found" },
        })
      }
      if (doc.status !== "draft") {
        return reply.status(409).send({
          error: { code: "INVALID_STATUS", message: "Cannot edit fields after document is sent" },
        })
      }

      const result = saveFieldsSchema.safeParse(request.body)
      if (!result.success) {
        return reply.status(400).send({
          error: { code: "VALIDATION_ERROR", message: result.error.issues[0].message },
        })
      }

      const { fields } = result.data

      // Replace all fields atomically
      await prisma.$transaction([
        prisma.documentField.deleteMany({ where: { documentId: id } }),
        prisma.documentField.createMany({
          data: fields.map((f) => ({
            documentId: id,
            type: f.type,
            page: f.page,
            x: f.x,
            y: f.y,
            width: f.width,
            height: f.height,
            required: f.required,
            assignedToEmail: f.assignedToEmail,
          })),
        }),
      ])

      const saved = await prisma.documentField.findMany({
        where: { documentId: id },
        orderBy: { createdAt: "asc" },
      })

      return reply.send({ data: { fields: saved } })
    },
  )

  // GET /documents/:id/fields — fetch saved fields
  fastify.get(
    "/documents/:id/fields",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user as TokenPayload
      const { id } = request.params as { id: string }

      const doc = await prisma.document.findFirst({
        where: { id, orgId: user.orgId },
      })
      if (!doc) {
        return reply.status(404).send({
          error: { code: "NOT_FOUND", message: "Document not found" },
        })
      }

      const fields = await prisma.documentField.findMany({
        where: { documentId: id },
        orderBy: { createdAt: "asc" },
      })

      return reply.send({ data: { fields } })
    },
  )

  // POST /documents/:id/detect-fields — AI stub (wired, not implemented yet)
  fastify.post(
    "/documents/:id/detect-fields",
    { onRequest: [fastify.authenticate] },
    async (_request, reply) => {
      return reply.send({ data: { fields: [], message: "AI detection coming in a future release" } })
    },
  )
}
