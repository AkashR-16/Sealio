"use client"

import { useQuery, useMutation } from "@tanstack/react-query"

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, credentials: "include" })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }))
    const e = new Error(err?.error?.message ?? `HTTP ${res.status}`) as Error & { statusCode: number }
    e.statusCode = res.status
    throw e
  }
  return res.json()
}

export interface SigningRequestInfo {
  signerName: string
  signerEmail: string
  document: { id: string; title: string; status: string }
  status: string
  alreadyVerified: boolean
}

export interface SigningField {
  id: string
  type: string
  page: number
  x: number
  y: number
  width: number
  height: number
  required: boolean
  signed: boolean
  value: string | null
  captureMethod: string | null
}

export function useSigningRequest(token: string) {
  return useQuery({
    queryKey: ["signing-request", token],
    queryFn: () => apiFetch<{ data: SigningRequestInfo }>(`/sign/${token}`),
    retry: false,
  })
}

export function useVerifyOtp(token: string) {
  return useMutation({
    mutationFn: (otp: string) =>
      apiFetch<{ data: { authenticated: boolean } }>(`/sign/${token}/authenticate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      }),
  })
}

export function useSigningFields(token: string, enabled: boolean) {
  return useQuery({
    queryKey: ["signing-fields", token],
    queryFn: () => apiFetch<{ data: { fields: SigningField[]; documentTitle: string } }>(`/sign/${token}/fields`),
    enabled,
    staleTime: 0,
  })
}

export function useSigningDocumentUrl(token: string, enabled: boolean) {
  return useQuery({
    queryKey: ["signing-doc-url", token],
    queryFn: async () => {
      const res = await fetch(`${API}/sign/${token}/document`, { credentials: "include" })
      if (!res.ok) throw new Error("Failed to load document")
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    },
    enabled,
    staleTime: 55 * 60 * 1000,
  })
}

export function useSubmitField(token: string) {
  return useMutation({
    mutationFn: ({ fieldId, value, captureMethod }: { fieldId: string; value: string; captureMethod: string }) =>
      apiFetch(`/sign/${token}/fields/${fieldId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, captureMethod }),
      }),
  })
}

export interface PageTime { page: number; seconds: number }

export function useCompleteSign(token: string) {
  return useMutation({
    mutationFn: (pageTimes?: PageTime[]) =>
      apiFetch<{ data: { ok: boolean } }>(`/sign/${token}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageTimes }),
      }),
  })
}
