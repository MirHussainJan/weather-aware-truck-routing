import type { PlanRequest, PlanResponse, Place } from '../types/api'

export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, unknown> | undefined

  constructor(status: number, message: string, fieldErrors?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }

  get retryable(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500
  }
}

function describeFieldErrors(errors: Record<string, unknown>): string {
  return Object.entries(errors)
    .map(([field, value]) => {
      const msg = Array.isArray(value) ? value.join(' ') : typeof value === 'object' ? describeFieldErrors(value as Record<string, unknown>) : String(value)
      return field === 'non_field_errors' ? msg : `${field}: ${msg}`
    })
    .join(' ')
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError(0, 'Network error. Check your connection and try again.')
  }
  const data = (await response.json().catch(() => null)) as { detail?: string; errors?: Record<string, unknown> } | null
  if (!response.ok) {
    const detail = data?.errors ? describeFieldErrors(data.errors) : data?.detail
    const fallback = response.status === 429 ? 'Too many requests. Please wait a moment.' : `Request failed (${response.status}).`
    throw new ApiError(response.status, detail || fallback, data?.errors)
  }
  return data as T
}

export const api = {
  plan: (body: PlanRequest, signal?: AbortSignal) =>
    request<PlanResponse>('/api/plan', { method: 'POST', body: JSON.stringify(body), signal }),

  geocode: (q: string, near: { lat: number; lon: number } | null, signal?: AbortSignal) => {
    const bias = near ? `&lat=${near.lat.toFixed(1)}&lon=${near.lon.toFixed(1)}` : ''
    return request<{ results: Place[] }>(`/api/geocode?q=${encodeURIComponent(q)}${bias}`, { method: 'GET', signal }).then((r) => r.results)
  },

  reverse: (lat: number, lon: number) =>
    request<{ label: string }>(`/api/reverse?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}`, { method: 'GET' }).then((r) => r.label),
}
