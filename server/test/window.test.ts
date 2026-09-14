import { expect, test } from 'bun:test'
import { normalizeColumnar } from '../src/edgar/normalize'
import { isTruncated, twelveMonthsBefore } from '../src/service/summary'
import jpm from './fixtures/jpm-submissions.json'
import spot from './fixtures/spot-submissions.json'

test('window starts on the same day one year earlier', () => {
  expect(twelveMonthsBefore('2026-09-14')).toBe('2025-09-14')
  expect(twelveMonthsBefore('2028-02-29')).toBe('2027-02-28')
})

const jpmRecent = normalizeColumnar(19617, jpm.filings.recent)
const hasChunks = jpm.filings.files.length > 0

test('JPMorgan recent covers the window on the fixture date', () => {
  // Oldest recent filing is 2025-09-12, two days before the window start.
  expect(isTruncated(jpmRecent, hasChunks, twelveMonthsBefore('2026-09-14'))).toBe(false)
})

test('truncated once the window reaches the oldest recent day, since that day may continue in a chunk', () => {
  expect(isTruncated(jpmRecent, hasChunks, '2025-09-13')).toBe(false)
  expect(isTruncated(jpmRecent, hasChunks, '2025-09-12')).toBe(true)
  expect(isTruncated(jpmRecent, hasChunks, '2025-09-11')).toBe(true)
})

test('never truncated without older chunks', () => {
  const spotRecent = normalizeColumnar(1639920, spot.filings.recent)
  expect(isTruncated(spotRecent, spot.filings.files.length > 0, '2000-01-01')).toBe(false)
})
