const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    })

    if (!res.ok) {
      const error = await res.json().catch(() => ({ error: { message: "Request failed" } }))
      throw new Error(error?.error?.message ?? `HTTP ${res.status}`)
    }

    return res.json() as Promise<T>
  }

  get<T>(path: string) {
    return this.request<T>(path, { method: "GET" })
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>(path, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  delete<T>(path: string) {
    return this.request<T>(path, { method: "DELETE" })
  }
}

export const api = new ApiClient(API_URL)
