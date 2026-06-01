import { Client } from "minio"

export const minio = new Client({
  endPoint: process.env.MINIO_ENDPOINT ?? "localhost",
  port: Number(process.env.MINIO_PORT ?? 9000),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY ?? "minioadmin",
  secretKey: process.env.MINIO_SECRET_KEY ?? "minioadmin",
  // S3-compatible hosts (e.g. Cloudflare R2) expect a region — R2 uses "auto".
  // Left undefined for local MinIO, which keeps the client's default behaviour.
  region: process.env.MINIO_REGION || undefined,
})

export const BUCKET = process.env.MINIO_BUCKET ?? "sealio-documents"

export async function ensureBucket() {
  const exists = await minio.bucketExists(BUCKET)
  if (!exists) await minio.makeBucket(BUCKET)
}

export async function uploadFile(
  objectKey: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  await minio.putObject(BUCKET, objectKey, buffer, buffer.length, {
    "Content-Type": contentType,
  })
}

export async function getPresignedUrl(objectKey: string, expirySeconds = 3600): Promise<string> {
  return minio.presignedGetObject(BUCKET, objectKey, expirySeconds)
}

export async function deleteFile(objectKey: string): Promise<void> {
  await minio.removeObject(BUCKET, objectKey)
}

export function streamObject(objectKey: string) {
  return minio.getObject(BUCKET, objectKey)
}
