import { createHash } from "crypto"
import { prisma } from "@sealio/db"
import { uploadFile, getPresignedUrl, streamObject } from "../lib/minio.js"

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]) // %PDF

export function isPdf(buffer: Buffer): boolean {
  return buffer.slice(0, 4).equals(PDF_MAGIC)
}

export function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex")
}

export async function createDocument(params: {
  orgId: string
  creatorId: string
  title: string
  buffer: Buffer
  filename: string
}) {
  const { orgId, creatorId, title, buffer, filename } = params

  if (!isPdf(buffer)) {
    const err = new Error("Only PDF files are supported") as Error & { statusCode: number }
    err.statusCode = 422
    throw err
  }

  const hash = sha256(buffer)

  // Check for duplicate: same org + same hash = same document
  const existing = await prisma.document.findFirst({
    where: { orgId, hashSha256: hash, status: { not: "voided" } },
  })
  if (existing) {
    const err = new Error("This document has already been uploaded") as Error & { statusCode: number; documentId: string }
    err.statusCode = 409
    err.documentId = existing.id
    throw err
  }

  // Store in MinIO at originals/{orgId}/{docId}/{filename}
  // We create the DB record first to get the ID for the path
  const doc = await prisma.document.create({
    data: {
      orgId,
      creatorId,
      title: title || filename.replace(/\.pdf$/i, ""),
      status: "draft",
      filePath: "pending", // updated below
      hashSha256: hash,
    },
  })

  const objectKey = `originals/${orgId}/${doc.id}/${filename}`

  await uploadFile(objectKey, buffer, "application/pdf")

  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: { filePath: objectKey },
  })

  return updated
}

const MAX_PAGE_SIZE = 100

export async function listDocuments(orgId: string, page = 1, limit = 20) {
  // Cap page size so a caller can't request an unbounded number of rows.
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE)
  const skip = (page - 1) * safeLimit
  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      skip,
      take: safeLimit,
      include: {
        creator: { select: { id: true, name: true, email: true } },
        _count: { select: { signingRequests: true } },
      },
    }),
    prisma.document.count({ where: { orgId } }),
  ])
  return { documents, total, page, limit: safeLimit, totalPages: Math.ceil(total / safeLimit) }
}

export async function getDocument(id: string, orgId: string) {
  const doc = await prisma.document.findFirst({
    where: { id, orgId },
    include: {
      creator: { select: { id: true, name: true, email: true } },
      signingRequests: {
        orderBy: { order: "asc" },
      },
      fields: true,
    },
  })
  if (!doc) {
    const err = new Error("Document not found") as Error & { statusCode: number }
    err.statusCode = 404
    throw err
  }
  return doc
}

export async function getDocumentFileUrl(id: string, orgId: string): Promise<string> {
  const doc = await getDocument(id, orgId)
  return getPresignedUrl(doc.filePath)
}

export async function streamDocumentFile(id: string, orgId: string) {
  const doc = await getDocument(id, orgId)
  return streamObject(doc.filePath)
}
