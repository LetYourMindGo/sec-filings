import type { FilingsResponse, Sort, SummaryResponse } from 'shared'

export const PAGE_SIZE = 50

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
    // Same-origin: the Vite dev server proxies /companies and /filings to the API (web/vite.config.ts).
    response = await fetch(path)
  } catch {
    throw new Error('Could not reach the dev server. Is bun dev running?')
  }

  const body = await response.json().catch(() => null)
  // Errors carry the message from the API's { error: { code, message } } envelope.
  if (!response.ok) {
    // No envelope means the answer came from the Vite proxy, which sends an empty 502 when the API is down.
    throw new Error(body?.error?.message ?? `No response from the API (${response.status}). Is it running on port 3000?`)
  }
  return body as T
}
