import type { Filing } from 'shared'
import { getCompanyTickers, getSubmissions, SUBMISSIONS_TTL_MS, TICKERS_TTL_MS } from './client'
import { normalizeColumnar } from './normalize'
import { buildTickerIndex, type TickerIndex } from './tickers'

// In-memory layer over the client. SQLite keeps raw bodies across restarts; this keeps the parsed
// and normalized results, so paging through JPMorgan doesn't re-parse 4.6 MB per request.
// Entries expire on the same TTLs as the raw bodies. Nothing is evicted (see NOTES.md).

export interface CompanyFilings {
  recent: Filing[]
  hasOlderChunks: boolean
}

const tickerIndex = new Map<'all', Entry<TickerIndex>>()
const filingsByCik = new Map<number, Entry<CompanyFilings>>()

export function getTickerIndex(): Promise<TickerIndex> {
  return remember(tickerIndex, 'all', TICKERS_TTL_MS, async () => buildTickerIndex(await getCompanyTickers()))
}

export function getCompanyFilings(cik: number): Promise<CompanyFilings> {
  return remember(filingsByCik, cik, SUBMISSIONS_TTL_MS, async () => {
    const raw = await getSubmissions(cik)
    return { recent: normalizeColumnar(cik, raw.filings.recent), hasOlderChunks: raw.filings.files.length > 0 }
  })
}

interface Entry<V> {
  expiresAt: number
  value: Promise<V>
}

// Stores the promise, so concurrent callers share one load. A failed load is removed at once.
function remember<K, V>(map: Map<K, Entry<V>>, key: K, ttlMs: number, load: () => Promise<V>): Promise<V> {
  const hit = map.get(key)
  if (hit && hit.expiresAt > Date.now()) return hit.value

  const value = load()
  map.set(key, { expiresAt: Date.now() + ttlMs, value })
  value.catch(() => {
    if (map.get(key)?.value === value) map.delete(key)
  })
  return value
}
