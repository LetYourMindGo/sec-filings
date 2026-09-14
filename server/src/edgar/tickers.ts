import type { Company } from 'shared'
import type { RawCompanyTickers } from './normalize'

export type TickerIndex = Map<string, Company>

export function buildTickerIndex(raw: RawCompanyTickers): TickerIndex {
  const index: TickerIndex = new Map()
  for (const { cik_str, ticker, title } of Object.values(raw)) {
    index.set(ticker.toUpperCase(), { ticker: ticker.toUpperCase(), cik: cik_str, name: title })
  }
  return index
}

// Returns null for an unknown ticker; the route turns that into a 404.
// EDGAR writes share classes with a dash (BRK-B) where most sources use a dot (BRK.B). The exact
// match is tried first because one EDGAR ticker contains a literal dot ("NONE.").
export function lookupTicker(index: TickerIndex, ticker: string): Company | null {
  const key = ticker.trim().toUpperCase()
  return index.get(key) ?? index.get(key.replaceAll('.', '-')) ?? null
}
