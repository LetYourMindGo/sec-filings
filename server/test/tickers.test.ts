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

test('unknown ticker returns null', () => {
  expect(lookupTicker(index, 'NOPE')).toBeNull()
})
