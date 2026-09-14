import { expect, test } from 'bun:test'
import { buildTickerIndex, lookupTicker } from '../src/edgar/tickers'
import tickers from './fixtures/company_tickers.json'

const index = buildTickerIndex(tickers)

test('lowercase input resolves', () => {
  expect(lookupTicker(index, 'aapl')).toEqual({ ticker: 'AAPL', cik: 320193, name: 'Apple Inc.' })
})

test('share-class tickers resolve to the parent CIK', () => {
  expect(lookupTicker(index, 'jpm-pc')?.cik).toBe(19617)
})

test('dotted share-class tickers resolve to EDGAR dashed form', () => {
  expect(lookupTicker(index, 'brk.b')).toEqual({ ticker: 'BRK-B', cik: 1067983, name: 'BERKSHIRE HATHAWAY INC' })
})

test('a ticker that really contains a dot still matches exactly', () => {
  const dotted = buildTickerIndex({ '0': { cik_str: 1347123, ticker: 'NONE.', title: 'EBR Systems, Inc.' } })
  expect(lookupTicker(dotted, 'none.')?.cik).toBe(1347123)
})

test('unknown ticker returns null', () => {
  expect(lookupTicker(index, 'NOPE')).toBeNull()
})
