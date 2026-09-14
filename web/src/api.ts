import type { FilingsResponse, SummaryResponse } from 'shared'

export const API_BASE = 'http://localhost:3000'
export const PAGE_SIZE = 50

export type Sort = 'filingDate' | '-filingDate'

// Carries the message from the API's { error: { code, message } } envelope.
export class ApiError extends Error {}

export interface FilingsParams {
  ticker: string
  form: string
  includeAmendments: boolean
  sort: Sort
  page: number
}

export function fetchFilings(params: FilingsParams): Promise<FilingsResponse> {
  const query = new URLSearchParams({
    sort: params.sort,
    limit: String(PAGE_SIZE),
    offset: String((params.page - 1) * PAGE_SIZE),
  })
  if (params.form) query.set('form', params.form)
  if (params.includeAmendments) query.set('includeAmendments', 'true')
  return getJson(`/companies/${encodeURIComponent(params.ticker)}/filings?${query}`)
}

export function fetchSummary(tickers: string): Promise<SummaryResponse> {
  return getJson(`/filings/summary?${new URLSearchParams({ tickers })}`)
}

async function getJson<T>(path: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`)
  } catch {
    throw new ApiError(`Could not reach the API at ${API_BASE}. Is the server running?`)
  }

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(body?.error?.message ?? `The API answered ${response.status}`)
  }
  return body as T
}
