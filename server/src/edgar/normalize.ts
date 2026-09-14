import type { Filing } from 'shared'
import { documentUrl } from './urls'

// Raw EDGAR shapes, limited to the fields this app reads. Observed shapes are in PLAN.md "Recon notes".

export interface RawFilingColumns {
  accessionNumber: string[]
  form: string[]
  filingDate: string[]
  reportDate: string[]
  primaryDocument: string[]
  primaryDocDescription: string[]
  size: number[]
  isXBRL: number[]
}

export interface RawSubmissions {
  cik: string
  name: string
  filings: {
    recent: RawFilingColumns
    files: { name: string; filingCount: number; filingFrom: string; filingTo: string }[]
  }
}

export type RawCompanyTickers = Record<string, { cik_str: number; ticker: string; title: string }>

// Response checks run before a body is cached. They assert only what the normalizer can't do
// without, so a column SEC adds or leaves empty doesn't break us.

export function isRawSubmissions(x: unknown): x is RawSubmissions {
  const filings = (x as { filings?: { recent?: { accessionNumber?: unknown }; files?: unknown } } | null)?.filings
  return Array.isArray(filings?.recent?.accessionNumber) && Array.isArray(filings?.files)
}

export function isRawCompanyTickers(x: unknown): x is RawCompanyTickers {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return false
  const entries = Object.values(x) as { cik_str?: unknown; ticker?: unknown }[]
  return entries.length > 0 && entries.every((e) => typeof e?.cik_str === 'number' && typeof e?.ticker === 'string')
}

// Zips EDGAR's parallel arrays into one object per filing. Iterates over accessionNumber and reads
// siblings defensively, so a shorter column yields nulls instead of shifting values between rows.
// Rows without a form or filing date are dropped: they can't be filtered, sorted or counted.
export function normalizeColumnar(cik: number, cols: Partial<RawFilingColumns>): Filing[] {
  const filings: Filing[] = []
  const accessionNumbers = cols.accessionNumber ?? []

  for (let i = 0; i < accessionNumbers.length; i++) {
    const accessionNumber = accessionNumbers[i]
    const form = emptyToNull(cols.form?.[i])
    const filingDate = emptyToNull(cols.filingDate?.[i])
    if (!accessionNumber || !form || !filingDate) continue

    const primaryDocument = emptyToNull(cols.primaryDocument?.[i])
    filings.push({
      accessionNumber,
      form,
      filingDate,
      reportDate: emptyToNull(cols.reportDate?.[i]),
      primaryDocument,
      primaryDocDescription: emptyToNull(cols.primaryDocDescription?.[i]),
      size: cols.size?.[i] ?? null,
      isXBRL: cols.isXBRL?.[i] === 1,
      documentUrl: documentUrl(cik, accessionNumber, primaryDocument),
    })
  }

  return filings
}

function emptyToNull(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value
}
