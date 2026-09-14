import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import type { FilingsResponse } from 'shared'
import { fetchFilings, PAGE_SIZE, type Sort } from './api'
import type { UpdateParams } from './App'

const PRESET_TICKERS = ['AAPL', 'SPOT', 'JPM']
const PRESET_FORMS = ['10-K', '10-Q', '8-K']

interface Props {
  params: URLSearchParams
  update: UpdateParams
}

export default function FilingsView({ params, update }: Props) {
  const ticker = (params.get('ticker') ?? 'AAPL').toUpperCase()
  const form = params.get('form') ?? ''
  const includeAmendments = params.get('includeAmendments') === 'true'
  const sort: Sort = params.get('sort') === 'filingDate' ? 'filingDate' : '-filingDate'
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const query = useQuery({
    queryKey: ['filings', ticker, form, includeAmendments, sort, page],
    queryFn: () => fetchFilings({ ticker, form, includeAmendments, sort, page }),
    // Keep the current rows on screen while paging or re-filtering the same company, not across companies.
    placeholderData: (previous, previousQuery) => (previousQuery?.queryKey[1] === ticker ? previous : undefined),
  })

  // Any change other than paging starts again at page 1.
  const change = (patch: Record<string, string | null>) => update({ ...patch, page: null })

  function submitText(field: 'ticker' | 'form') {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const value = String(new FormData(event.currentTarget).get(field) ?? '').trim()
      if (field === 'ticker' && !value) return
      change({ [field]: field === 'ticker' ? value.toUpperCase() : value })
    }
  }

  return (
    <section>
      <div className="controls">
        <div className="control-row">
          <span className="label">Company</span>
          {PRESET_TICKERS.map((t) => (
            <button key={t} className={t === ticker ? 'active' : ''} onClick={() => change({ ticker: t })}>
              {t}
            </button>
          ))}
          <form onSubmit={submitText('ticker')} key={`ticker-${ticker}`}>
            <input name="ticker" defaultValue={PRESET_TICKERS.includes(ticker) ? '' : ticker} placeholder="Any ticker, e.g. BRK.B" aria-label="Ticker" />
            <button type="submit">Go</button>
          </form>
        </div>

        <div className="control-row">
          <span className="label">Form type</span>
          <button className={form === '' ? 'active' : ''} onClick={() => change({ form: null })}>
            All
          </button>
          {PRESET_FORMS.map((f) => (
            <button key={f} className={f === form ? 'active' : ''} onClick={() => change({ form: f })}>
              {f}
            </button>
          ))}
          <form onSubmit={submitText('form')} key={`form-${form}`}>
            <input name="form" defaultValue={PRESET_FORMS.includes(form) ? '' : form} placeholder="Other form, e.g. 20-F" aria-label="Form type" />
            <button type="submit">Filter</button>
          </form>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={includeAmendments}
              onChange={(e) => change({ includeAmendments: e.target.checked ? 'true' : null })}
            />
            Include amendments (/A)
          </label>
        </div>
      </div>

      <FilingsResult query={query} form={form} sort={sort} page={page} update={update} change={change} />
    </section>
  )
}

interface ResultProps {
  query: UseQueryResult<FilingsResponse, Error>
  form: string
  sort: Sort
  page: number
  update: UpdateParams
  change: UpdateParams
}

function FilingsResult({ query, form, sort, page, update, change }: ResultProps) {
  if (query.isPending) return <p className="status">Loading filings…</p>
  if (query.isError) return <p className="status error">{query.error.message}</p>

  const { company, items, total, offset } = query.data
  const first = total === 0 ? 0 : offset + 1
  const last = offset + items.length
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <h2>
        {company.name} <span className="muted">{company.ticker} · CIK {company.cik}</span>
        {query.isFetching && <span className="muted"> · updating…</span>}
      </h2>

      {items.length === 0 ? (
        <div className="status">
          {total > 0 ? (
            <>
              Page {page} is past the end of {total.toLocaleString('en-US')} filings.{' '}
              <button onClick={() => update({ page: null })}>Go to page 1</button>
            </>
          ) : form ? (
            <>No {form} filings in EDGAR's recent filings for {company.ticker}.</>
          ) : (
            <>No filings in EDGAR's recent filings for {company.ticker}.</>
          )}
        </div>
      ) : (
        <>
          <table>
            <thead>
              <tr>
                <th>Form</th>
                <th>
                  <button className="sort" onClick={() => change({ sort: sort === '-filingDate' ? 'filingDate' : null })}>
                    Filing date {sort === '-filingDate' ? '▼' : '▲'}
                  </button>
                </th>
                <th>Report date</th>
                <th>Description</th>
                <th className="number">Size</th>
              </tr>
            </thead>
            <tbody>
              {items.map((f) => (
                <tr key={f.accessionNumber}>
                  <td>{f.form}</td>
                  <td className="nowrap">{f.filingDate}</td>
                  <td className="nowrap">{f.reportDate ?? '—'}</td>
                  <td>
                    <a href={f.documentUrl} target="_blank" rel="noreferrer">
                      {f.primaryDocDescription ?? f.primaryDocument ?? 'Filing index'}
                    </a>
                  </td>
                  <td className="number nowrap">{formatSize(f.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="pagination">
            <button disabled={page <= 1} onClick={() => update({ page: page - 1 > 1 ? String(page - 1) : null })}>
              ← Prev
            </button>
            <span>
              Showing {first.toLocaleString('en-US')}–{last.toLocaleString('en-US')} of {total.toLocaleString('en-US')}
            </span>
            <button disabled={page >= lastPage} onClick={() => update({ page: String(page + 1) })}>
              Next →
            </button>
          </div>
        </>
      )}
    </>
  )
}

function formatSize(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
