import { getCached, setCached } from '../cache'
import type { RawCompanyTickers, RawSubmissions } from './normalize'
import { COMPANY_TICKERS_URL, submissionsUrl } from './urls'

// The only module that talks to EDGAR. Everything outbound goes through fetchJson, which applies
// the User-Agent, the rate limit, the cache, single-flight and one retry.

const HOUR = 60 * 60 * 1000
// 125 ms between request starts caps traffic at 8 req/s in any one-second window.
const MIN_REQUEST_GAP_MS = 125

export class EdgarError extends Error {
  constructor(readonly status: number, url: string) {
    super(`EDGAR returned ${status} for ${url}`)
  }
}

export async function getSubmissions(cik: number): Promise<RawSubmissions> {
  return fetchJson(submissionsUrl(cik), HOUR)
}

export async function getCompanyTickers(): Promise<RawCompanyTickers> {
  return fetchJson(COMPANY_TICKERS_URL, 24 * HOUR)
}

const inFlight = new Map<string, Promise<unknown>>()

function fetchJson<T>(url: string, maxAgeMs: number): Promise<T> {
  const existing = inFlight.get(url)
  if (existing) return existing as Promise<T>

  const request = (async () => {
    const cached = getCached(url, maxAgeMs)
    const body = cached ?? (await fetchText(url))
    if (cached === null) setCached(url, body)
    return JSON.parse(body) as T
  })().finally(() => inFlight.delete(url))

  inFlight.set(url, request)
  return request
}

async function fetchText(url: string): Promise<string> {
  let response = await rateLimitedFetch(url)
  if (response.status === 429 || response.status >= 500) {
    await Bun.sleep(1000)
    response = await rateLimitedFetch(url)
  }
  if (!response.ok) throw new EdgarError(response.status, url)
  return response.text()
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
