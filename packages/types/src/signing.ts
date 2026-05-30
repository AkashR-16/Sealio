export type SigningRequestStatus =
  | "pending"
  | "sent"
  | "viewed"
  | "signed"
  | "declined"
  | "expired"

export type AuthMethod = "email_otp" | "sms_otp"

export interface SigningRequest {
  id: string
  documentId: string
  signerEmail: string
  signerName: string
  order: number
  status: SigningRequestStatus
  authMethod: AuthMethod
  token: string
  signedAt?: string | null
  declinedAt?: string | null
  declineReason?: string | null
  createdAt: string
  signatures?: Signature[]
}

export interface Signature {
  id: string
  signingRequestId: string
  fieldId: string
  value: string
  captureMethod: "draw" | "type" | "upload"
  signedAt: string
}

export interface AuditEvent {
  id: string
  documentId: string
  signingRequestId?: string | null
  eventType: string
  actorEmail?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  geoCountry?: string | null
  geoCity?: string | null
  metadata?: unknown | null
  prevHash?: string | null
  eventHash: string
  createdAt: string
}
