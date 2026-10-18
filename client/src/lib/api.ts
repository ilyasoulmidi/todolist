export class ApiError extends Error {
  status: number
  details?: { field: string; message: string }[]

  constructor(status: number, message: string, details?: { field: string; message: string }[]) {
    super(message)
    this.status = status
    this.details = details
  }
}

type Query = Record<string, string | number | boolean | string[] | undefined | null>

function toSearch(query?: Query) {
  if (!query) return ""
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue
    if (Array.isArray(value)) {
      if (value.length) params.set(key, value.join(","))
    } else params.set(key, String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ""
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  const res = await fetch(`/api${path}${toSearch(query)}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })

  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? "Une erreur est survenue", data.details)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>("GET", path, undefined, query),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T = void>(path: string, query?: Query) => request<T>("DELETE", path, undefined, query),
}
