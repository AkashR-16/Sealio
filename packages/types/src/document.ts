export type DocumentStatus =
  | "draft"
  | "sent"
  | "partially_signed"
  | "completed"
  | "expired"
  | "voided"

export type DocumentFieldType =
  | "signature"
  | "initials"
  | "date"
  | "full_name"
  | "text"
  | "checkbox"
  | "dropdown"

export type SignatureMethod = "draw" | "type" | "upload"

export interface DocumentField {
  id: string
  documentId: string
  type: DocumentFieldType
  page: number
  x: number
  y: number
  width: number
  height: number
  required: boolean
  assignedToEmail: string
  createdAt: string
}

export interface Document {
  id: string
  orgId: string
  creatorId: string
  title: string
  status: DocumentStatus
  filePath: string
  signedFilePath?: string | null
  hashSha256?: string | null
  signedHashSha256?: string | null
  expiresAt?: string | null
  createdAt: string
  updatedAt: string
  fields?: DocumentField[]
  signingRequests?: SigningRequest[]
}

export interface Template {
  id: string
  orgId: string
  name: string
  description?: string | null
  filePath: string
  fieldConfig: unknown
  createdAt: string
}

// Imported here to avoid circular reference — signing types are in signing.ts
import type { SigningRequest } from "./signing"
