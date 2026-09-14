import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import type { CompanySummary } from 'shared'
import { fetchSummary } from './api'
import type { UpdateParams } from './App'

const DEFAULT_TICKERS = 'AAPL,SPOT,JPM'
const TOP_FORMS = 8

interface Props {
  params: URLSearchParams
  update: UpdateParams
}

export default function SummaryView({ params, update }: Props) {
  const tickers = params.get('tickers') ?? DEFAULT_TICKERS
  const query = useQuery({ queryKey: ['summary', tickers], queryFn: () => fetchSummary(tickers) })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = String(new FormData(event.currentTarget).get('tickers') ?? '')
      .split(/[\s,]+/)
      .filter(Boolean)
      .map((t) => t.toUpperCase())
      .join(',')
    if (value) update({ tickers: value === DEFAULT_TICKERS ? null : value })
  }

  return (
    <section>
      <form className="controls" onSubmit={submit} key={tickers}>
        <div className="control-row">
          <label className="label" htmlFor="tickers">
            Companies
          </label>
          <input id="tickers" name="tickers" defaultValue={tickers} className="wide" placeholder="AAPL,SPOT,JPM" />
          <button type="submit">Summarize</button>
          <span className="muted">Up to 10 tickers, comma-separated</span>
        </div>
      </form>

      {query.isPending ? (
        <p className="status">Loading summary…</p>
      ) : query.isError ? (
        <p className="status error">{query.error.message}</p>
      ) : (
        <>
          <p>
            Filings since <strong>{query.data.since}</strong> (the last 12 months, by EDGAR filing date)
            {query.isFetching && <span className="muted"> · updating…</span>}
          </p>

          {query.data.errors.length > 0 && (
            <ul className="status error">
              {query.data.errors.map((e, i) => (
                <li key={`${e.ticker}-${i}`}>
                  <strong>{e.ticker}</strong>: {e.reason}
                </li>
              ))}
            </ul>
          )}

          {query.data.results.length === 0 ? (
            <p className="status">No companies to summarize.</p>
          ) : (
            <SummaryTable results={query.data.results} update={update} />
          )}
        </>
      )}
    </section>
  )
}

function SummaryTable({ results, update }: { results: CompanySummary[]; update: UpdateParams }) {
  const anyMissing10K = results.some((r) => r.latest10K === null)
  const anyTruncated = results.some((r) => r.truncated)

  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th className="number">Filings, last 12 months</th>
            <th>Latest 10-K</th>
            <th>By form type</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.cik}>
              <td>
                <button className="link" onClick={() => update({ view: 'filings', ticker: r.ticker, form: null, page: null })}>
                  {r.name}
                </button>
                <div className="muted">{r.ticker}</div>
              </td>
              <td className="number">
                {r.totalLast12Months.toLocaleString('en-US')}
                {r.truncated && <sup>†</sup>}
              </td>
              <td className="nowrap">
                {r.latest10K ?? (
                  <>
                    —<sup>*</sup>
                  </>
                )}
              </td>
              <td>
                <FormBreakdown countsByForm={r.countsByForm} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {anyMissing10K && (
        <p className="footnote">
          * No 10-K on file. Foreign private issuers such as Spotify file their annual report on Form 20-F
          instead.
        </p>
      )}
      {anyTruncated && (
        <p className="footnote">
          † EDGAR's recent-filings list for this company doesn't reach back to the start of the window, so this
          count may be low.
        </p>
      )}
    </>
  )
}

function FormBreakdown({ countsByForm }: { countsByForm: Record<string, number> }) {
  const [expanded, setExpanded] = useState(false)
  const sorted = Object.entries(countsByForm).sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
  if (sorted.length === 0) return <span className="muted">No filings</span>

  const shown = expanded ? sorted : sorted.slice(0, TOP_FORMS)
  const hidden = sorted.length - shown.length

  return (
    <div className="chips">
      {shown.map(([form, count]) => (
        <span key={form} className="chip">
          {form} <strong>{count.toLocaleString('en-US')}</strong>
        </span>
      ))}
      {hidden > 0 && (
        <button className="link" onClick={() => setExpanded(true)}>
          +{hidden} more
        </button>
      )}
    </div>
  )
}
