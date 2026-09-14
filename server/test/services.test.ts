import { expect, test } from 'bun:test'
import type { Filing } from 'shared'
import { normalizeColumnar } from '../src/edgar/normalize'
import { listFilings } from '../src/service/filings'
import { summarizeCompany } from '../src/service/summary'
import aapl from './fixtures/aapl-submissions.json'
import spot from './fixtures/spot-submissions.json'

const SINCE = '2025-09-14' // twelveMonthsBefore('2026-09-14'), the fixture date
const apple = normalizeColumnar(320193, aapl.filings.recent)
const appleCompany = { ticker: 'AAPL', cik: 320193, name: 'Apple Inc.' }

function filing(form: string, filingDate: string): Filing {
  return {
    accessionNumber: `${form}-${filingDate}`,
    form,
    filingDate,
    reportDate: null,
    primaryDocument: null,
    primaryDocDescription: null,
    size: null,
    isXBRL: false,
    documentUrl: '',
  }
}

test('filter, sort and paginate compose on page 2 of a filtered set', () => {
  const eightKs = apple.filter((f) => f.form === '8-K')
  const page = listFilings(apple, { form: '8-k', includeAmendments: false, sort: '-filingDate', limit: 2, offset: 2 })

  expect(page.total).toBe(30)
  expect(page.items.map((f) => f.accessionNumber)).toEqual([eightKs[2]!.accessionNumber, eightKs[3]!.accessionNumber])

  const oldestFirst = listFilings(apple, { form: '8-K', includeAmendments: false, sort: 'filingDate', limit: 200, offset: 0 })
  expect(oldestFirst.items.map((f) => f.filingDate)).toEqual(eightKs.map((f) => f.filingDate).toReversed())
})

test('includeAmendments adds <form>/A and nothing else', () => {
  const filings = [filing('10-K', '2026-01-01'), filing('10-K/A', '2026-02-01'), filing('10-KT', '2026-03-01')]
  const base = { sort: '-filingDate', limit: 50, offset: 0 } as const

  expect(listFilings(filings, { ...base, form: '10-K', includeAmendments: false }).total).toBe(1)
  expect(listFilings(filings, { ...base, form: '10-K', includeAmendments: true }).items.map((f) => f.form)).toEqual([
    '10-K/A',
    '10-K',
  ])
})

test('countsByForm is correct for the Apple fixture', () => {
  const summary = summarizeCompany(appleCompany, apple, true, SINCE)

  // Expected values computed from the fixture with jq, independently of this code.
  expect(summary.totalLast12Months).toBe(83)
  expect(summary.countsByForm).toEqual({
    '10-K': 1, '10-Q': 3, '144': 12, '144/A': 1, '25-NSE': 1, '3': 3, '4': 45, '8-K': 8, '8-K/A': 1,
    'DEF 14A': 1, DEFA14A: 1, PX14A6G: 1, 'S-8': 2, 'SCHEDULE 13G': 1, 'SCHEDULE 13G/A': 1, SD: 1,
  })
  expect(summary.latest10K).toBe('2025-10-31')
  expect(summary.truncated).toBe(false)
})

test('latest10K is null for Spotify, which files 20-F', () => {
  const spotify = normalizeColumnar(1639920, spot.filings.recent)
  const summary = summarizeCompany({ ticker: 'SPOT', cik: 1639920, name: 'Spotify' }, spotify, false, SINCE)

  expect(summary.latest10K).toBeNull()
  expect(summary.countsByForm['20-F']).toBe(1)
})

test('latest10K ignores 10-K/A and looks beyond the 12-month window', () => {
  const filings = [filing('10-K/A', '2026-03-01'), filing('10-K', '2024-11-01')]
  expect(summarizeCompany(appleCompany, filings, false, SINCE).latest10K).toBe('2024-11-01')
})

test('a filing dated exactly on the window start is counted; the day before is not', () => {
  const filings = [filing('8-K', SINCE), filing('8-K', '2025-09-13')]
  expect(summarizeCompany(appleCompany, filings, false, SINCE).countsByForm).toEqual({ '8-K': 1 })
})
