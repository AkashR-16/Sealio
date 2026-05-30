import type { FastifyInstance } from "fastify"
import multipart from "@fastify/multipart"
import { createDocument, listDocuments, getDocument, getDocumentFileUrl, streamDocumentFile } from "../services/document.service.js"
import type { TokenPayload } from "../services/auth.service.js"

const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

export async function documentRoutes(fastify: FastifyInstance) {
  await fastify.register(multipart, {
    limits: { fileSize: MAX_FILE_SIZE, files: 1 },
  })

  // POST /documents — upload a PDF
  fastify.post(
    "/documents",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user as TokenPayload

      const data = await request.file()
      if (!data) {
        return reply.status(400).send({
          error: { code: "NO_FILE", message: "No file provided" },
        })
      }

      const buffer = await data.toBuffer()
      const title = (request.query as any)?.title ?? ""
      const filename = data.filename || "document.pdf"

      try {
        const doc = await createDocument({
          orgId: user.orgId,
          creatorId: user.sub,
          title,
          buffer,
          filename,
        })

        return reply.status(201).send({
          data: {
            id: doc.id,
            title: doc.title,
            status: doc.status,
            hashSha256: doc.hashSha256,
            createdAt: doc.createdAt,
          },
        })
      } catch (err: any) {
        if (err.statusCode === 409) {
          return reply.status(409).send({
            error: {
              code: "DUPLICATE_DOCUMENT",
              message: err.message,
              documentId: err.documentId,
            },
          })
        }
        return reply.status(err.statusCode ?? 500).send({
          error: { code: "UPLOAD_FAILED", message: err.message },
        })
      }
    },
  )

  // GET /documents — list org documents
  fastify.get(
    "/documents",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user as TokenPayload
      const { page = "1", limit = "20" } = request.query as Record<string, string>

      const result = await listDocuments(user.orgId, Number(page), Number(limit))
      return reply.send({ data: result })
    },
  )

  // GET /documents/:id — get document metadata
  fastify.get(
    "/documents/:id",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user as TokenPayload
      const { id } = request.params as { id: string }

      try {
        const doc = await getDocument(id, user.orgId)
        return reply.send({ data: doc })
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({
          error: { code: "NOT_FOUND", message: err.message },
        })
      }
    },
  )

  // GET /documents/:id/file — stream PDF from MinIO (avoids CORS on presigned URL redirect)
  fastify.get(
    "/documents/:id/file",
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const user = request.user as TokenPayload
      const { id } = request.params as { id: string }

      try {
        const stream = await streamDocumentFile(id, user.orgId)
        return reply
          .header("Content-Type", "application/pdf")
          .header("Cache-Control", "private, max-age=3600")
          .send(stream)
      } catch (err: any) {
        return reply.status(err.statusCode ?? 500).send({
          error: { code: "FILE_NOT_FOUND", message: err.message },
        })
      }
    },
  )
}
