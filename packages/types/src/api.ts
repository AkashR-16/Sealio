export interface ApiResponse<T> {
  data: T
  error?: never
}

export interface ApiError {
  error: {
    code: string
    message: string
    details?: unknown
  }
  data?: never
}

export type ApiResult<T> = ApiResponse<T> | ApiError

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

// Auth
export interface LoginRequest {
  email: string
  password: string
}

export interface SignupRequest {
  name: string
  email: string
  password: string
  orgName: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
}

// Document send
export interface SendDocumentRequest {
  signers: Array<{
    email: string
    name: string
    order?: number
    authMethod?: "email_otp" | "sms_otp"
  }>
  message?: string
  expiresInDays?: number
}
