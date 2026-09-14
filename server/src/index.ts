import { swagger } from '@elysiajs/swagger'
import { Elysia, t } from 'elysia'
import type { Company, CompanySummary, FilingsResponse, SummaryResponse } from 'shared'
import { EdgarError } from './edgar/client'
import { getCompanyFilings, getTickerIndex } from './edgar/company'
import { lookupTicker } from './edgar/tickers'
import { listFilings } from './service/filings'
import { summarizeCompany, todayInNewYork, twelveMonthsBefore } from './service/summary'

if (!process.env.EDGAR_USER_AGENT) {
  console.error('EDGAR_USER_AGENT is not set. SEC rejects requests without it; copy .env.example to .env.')
  process.exit(1)
}

const MAX_SUMMARY_TICKERS = 10

function errorBody(code: string, message: string) {
  return { error: { code, message } }
}

const app = new Elysia()
  .use(swagger())
  .onError(({ code, error, set }) => {
    if (error instanceof EdgarError) {
      console.error(error.message)
      set.status = 502
      return errorBody('UPSTREAM_ERROR', 'EDGAR request failed')
    }
    if (code === 'VALIDATION') {
      set.status = 400
      return errorBody('INVALID_REQUEST', error.message)
    }
    if (code === 'NOT_FOUND') {
      set.status = 404
      return errorBody('NOT_FOUND', 'Route not found')
    }
    console.error(error)
    set.status = 500
    return errorBody('INTERNAL_ERROR', 'Internal server error')
  })
  .get(
    '/companies/:ticker/filings',
    async ({ params, query, status }) => {
      const company = lookupTicker(await getTickerIndex(), params.ticker)
      if (!company) return status(404, errorBody('TICKER_NOT_FOUND', `Unknown ticker: ${params.ticker}`))

      const { recent } = await getCompanyFilings(company.cik)
      const { items, total } = listFilings(recent, query)
      return { company, items, total, limit: query.limit, offset: query.offset } satisfies FilingsResponse
    },
    {
      // Each field names its own error; Elysia's defaults read "should be one of: 'integer', 'integer'".
      params: t.Object({ ticker: t.String() }),
      query: t.Object({
        form: t.Optional(t.String({ minLength: 1, error: 'form must not be empty' })),
        includeAmendments: t.Boolean({ default: false, error: 'includeAmendments must be true or false' }),
        sort: t.UnionEnum(['filingDate', '-filingDate'], {
          default: '-filingDate',
          error: "sort must be 'filingDate' or '-filingDate'",
        }),
        limit: t.Integer({ minimum: 1, maximum: 200, default: 50, error: 'limit must be an integer from 1 to 200' }),
        offset: t.Integer({ minimum: 0, default: 0, error: 'offset must be a non-negative integer' }),
      }),
    },
  )
  .get(
    '/filings/summary',
    async ({ query, status }) => {
      const tickers = query.tickers.split(',').map((s) => s.trim()).filter(Boolean)
      if (tickers.length === 0) return status(400, errorBody('INVALID_REQUEST', 'tickers must list at least one ticker'))
      if (tickers.length > MAX_SUMMARY_TICKERS) {
        return status(400, errorBody('TOO_MANY_TICKERS', `At most ${MAX_SUMMARY_TICKERS} tickers per request`))
      }

      const index = await getTickerIndex()
      const errors: SummaryResponse['errors'] = []
      // One row per CIK: JPM and JPM-PC are the same company. The first requested ticker names it.
      const companies = new Map<number, Company>()
      for (const ticker of tickers) {
        const company = lookupTicker(index, ticker)
        if (!company) errors.push({ ticker, reason: 'Unknown ticker' })
        else if (!companies.has(company.cik)) companies.set(company.cik, company)
      }

      const since = twelveMonthsBefore(todayInNewYork(new Date()))
      const requested = [...companies.values()]
      const settled = await Promise.allSettled(
        requested.map(async (company) => {
          const { recent, hasOlderChunks } = await getCompanyFilings(company.cik)
          return summarizeCompany(company, recent, hasOlderChunks, since)
        }),
      )

      const results: CompanySummary[] = []
      for (const [i, outcome] of settled.entries()) {
        if (outcome.status === 'fulfilled') {
          results.push(outcome.value)
        } else {
          console.error(outcome.reason)
          const reason = outcome.reason instanceof EdgarError ? 'EDGAR request failed' : 'Internal server error'
          errors.push({ ticker: requested[i]!.ticker, reason })
        }
      }
      return { since, results, errors } satisfies SummaryResponse
    },
    { query: t.Object({ tickers: t.String({ minLength: 1, error: 'tickers is required, e.g. tickers=AAPL,JPM' }) }) },
  )
  .listen(3000)

console.log(`API listening on http://localhost:${app.server?.port}`)
