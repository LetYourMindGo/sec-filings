import { expect, test } from 'bun:test'
import { normalizeColumnar } from '../src/edgar/normalize'
import aapl from './fixtures/aapl-submissions.json'
import spot from './fixtures/spot-submissions.json'

test('zips every column into one filing per row', () => {
  const filings = normalizeColumnar(320193, aapl.filings.recent)

  expect(filings).toHaveLength(300)
  expect(filings[62]).toEqual({
    accessionNumber: '0000320193-25-000079',
    form: '10-K',
    filingDate: '2025-10-31',
    reportDate: '2025-09-27',
    primaryDocument: 'aapl-20250927.htm',
    primaryDocDescription: '10-K',
    size: 9392337,
    isXBRL: true,
    documentUrl: 'https://www.sec.gov/Archives/edgar/data/320193/000032019325000079/aapl-20250927.htm',
  })
})

test('keeps form strings verbatim, so SC 13G and SCHEDULE 13G stay distinct', () => {
  const forms = new Set(normalizeColumnar(1639920, spot.filings.recent).map((f) => f.form))

  expect([...forms].filter((f) => f.includes('13G')).sort()).toEqual([
    'SC 13G',
    'SC 13G/A',
    'SCHEDULE 13G',
    'SCHEDULE 13G/A',
  ])
})

test('converts empty strings to null', () => {
  const [filing] = normalizeColumnar(1, {
    accessionNumber: ['0000000001-26-000001'],
    form: ['144'],
    filingDate: ['2026-01-02'],
    reportDate: [''],
    primaryDocument: [''],
    primaryDocDescription: [''],
  })

  expect(filing?.reportDate).toBeNull()
  expect(filing?.primaryDocument).toBeNull()
  expect(filing?.primaryDocDescription).toBeNull()
  expect(filing?.documentUrl).toEndWith('/0000000001-26-000001-index.htm')
})

test('ragged columns give nulls without shifting values between rows', () => {
  const filings = normalizeColumnar(1, {
    accessionNumber: ['a-1', 'b-2', 'c-3'],
    form: ['8-K', '10-Q', '4'],
    filingDate: ['2026-03-01', '2026-02-01', '2026-01-01'],
    reportDate: ['2026-02-28'],
    size: [100, 200],
  })

  expect(filings.map((f) => [f.accessionNumber, f.form, f.reportDate, f.size])).toEqual([
    ['a-1', '8-K', '2026-02-28', 100],
    ['b-2', '10-Q', null, 200],
    ['c-3', '4', null, null],
  ])
})

test('drops rows missing a form or filing date', () => {
  const filings = normalizeColumnar(1, {
    accessionNumber: ['a-1', 'b-2', 'c-3'],
    form: ['8-K', ''],
    filingDate: ['2026-03-01', '2026-02-01', '2026-01-01'],
  })

  expect(filings.map((f) => f.accessionNumber)).toEqual(['a-1'])
})
