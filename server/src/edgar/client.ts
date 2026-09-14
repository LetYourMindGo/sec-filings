import { deleteCached, getCached, setCached } from '../cache'
import { isRawCompanyTickers, isRawSubmissions, type RawCompanyTickers, type RawSubmissions } from './normalize'
import { COMPANY_TICKERS_URL, submissionsUrl } from './urls'

// The only module that talks to EDGAR. Everything outbound goes through fetchJson, which applies
// the User-Agent, the rate limit, the cache and one retry. Concurrent callers share one load in
// edgar/company.ts, the only caller.

export const SUBMISSIONS_TTL_MS = 60 * 60 * 1000
export const TICKERS_TTL_MS = 24 * 60 * 60 * 1000
// 125 ms between request starts caps traffic at 8 req/s in any one-second window.
const MIN_REQUEST_GAP_MS = 125

// Carries the URL and, for unusable bodies, the first 100 characters. Routes log it and answer 502
// with a generic message; upstream bytes never reach the client.
export class EdgarError extends Error {
  constructor(readonly url: string, detail: string) {
    super(`EDGAR ${url}: ${detail}`)
  }
}

export function getSubmissions(cik: number): Promise<RawSubmissions> {
  return fetchJson(submissionsUrl(cik), SUBMISSIONS_TTL_MS, isRawSubmissions)
}

export function getCompanyTickers(): Promise<RawCompanyTickers> {
  return fetchJson(COMPANY_TICKERS_URL, TICKERS_TTL_MS, isRawCompanyTickers)
}

// A body is cached only after it parses and passes isValid. A cached body that fails the check
// (written by older code, or a changed shape) is deleted, so the next request fetches again.
async function fetchJson<T>(url: string, maxAgeMs: number, isValid: (x: unknown) => x is T): Promise<T> {
  const cached = getCached(url, maxAgeMs)
  const body = cached ?? (await fetchText(url))
  const data = parseJson(body)
  if (!isValid(data)) {
    deleteCached(url)
    throw new EdgarError(url, `unexpected response body: ${body.slice(0, 100)}`)
  }
  if (cached === null) setCached(url, body)
  return data
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}

async function fetchText(url: string): Promise<string> {
  try {
    let response = await rateLimitedFetch(url)
    if (response.status === 429 || response.status >= 500) {
      await Bun.sleep(1000)
      response = await rateLimitedFetch(url)
    }
    if (!response.ok) throw new EdgarError(url, `returned ${response.status}`)
    return await response.text()
  } catch (error) {
    // A rejected fetch (DNS, refused or reset connection) is an upstream failure too, not a server bug.
    if (error instanceof EdgarError) throw error
    throw new EdgarError(url, `request failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}

let nextSlot = 0

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now()
  const slot = Math.max(now, nextSlot)
  nextSlot = slot + MIN_REQUEST_GAP_MS
  if (slot > now) await Bun.sleep(slot - now)
  // index.ts refuses to start without it.
  return fetch(url, { headers: { 'User-Agent': process.env.EDGAR_USER_AGENT ?? '' } })
}
