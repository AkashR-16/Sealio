"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: "Request failed" } }))
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export interface DocumentSummary {
  id: string
  title: string
  status: string
  hashSha256: string | null
  createdAt: string
  creator: { id: string; name: string; email: string }
  _count: { signingRequests: number }
}

export interface DocumentsResponse {
  data: {
    documents: DocumentSummary[]
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export function useDocuments(page = 1) {
  return useQuery({
    queryKey: ["documents", page],
    queryFn: () => apiFetch<DocumentsResponse>(`/documents?page=${page}&limit=20`),
  })
}

export interface DocumentDetail {
  data: DocumentSummary & {
    filePath: string
    signedFilePath: string | null
    expiresAt: string | null
    updatedAt: string
  }
}

export function useDocument(id: string) {
  return useQuery({
    queryKey: ["document", id],
    queryFn: () => apiFetch<DocumentDetail>(`/documents/${id}`),
    enabled: !!id,
  })
}

export function useDocumentPdfUrl(id: string) {
  return useQuery({
    queryKey: ["document-pdf-url", id],
    queryFn: async () => {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/documents/${id}/file`,
        { credentials: "include", redirect: "follow" },
      )
      if (!res.ok) throw new Error("Failed to load PDF")
      const blob = await res.blob()
      return URL.createObjectURL(blob)
    },
    enabled: !!id,
    staleTime: 55 * 60 * 1000, // presigned URL valid 1hr; refetch at 55min
  })
}

export interface DocumentField {
  id: string
  type: string
  page: number
  x: number
  y: number
  width: number
  height: number
  required: boolean
  assignedToEmail: string
}

export function useDocumentFields(id: string) {
  return useQuery({
    queryKey: ["document-fields", id],
    queryFn: () => apiFetch<{ data: { fields: DocumentField[] } }>(`/documents/${id}/fields`),
    enabled: !!id,
  })
}

export function useDetectFields(id: string) {
  return useMutation({
    mutationFn: () =>
      apiFetch<{ data: { fields: unknown[]; message: string } }>(`/documents/${id}/detect-fields`, {
        method: "POST",
      }),
  })
}

export function useSaveFields(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (fields: Omit<DocumentField, "id">[]) =>
      apiFetch<{ data: { fields: DocumentField[] } }>(`/documents/${id}/fields`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document-fields", id] })
    },
  })
}

export function useSendDocument(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (signers: { email: string; name: string }[]) =>
      apiFetch<{ data: { ok: boolean } }>(`/documents/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signers }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["document", id] })
      queryClient.invalidateQueries({ queryKey: ["documents"] })
    },
  })
}

export function useUploadDocument() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ file, title }: { file: File; title: string }) => {
      const formData = new FormData()
      formData.append("file", file)

      const res = await fetch(
        `${API}/documents?title=${encodeURIComponent(title || file.name.replace(/\.pdf$/i, ""))}`,
        {
          method: "POST",
          body: formData,
          credentials: "include",
        },
      )

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: "Upload failed" } }))
        throw new Error(err?.error?.message ?? "Upload failed")
      }

      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] })
    },
  })
}
