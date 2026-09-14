import { useCallback, useEffect, useMemo, useState } from 'react'
import FilingsView from './FilingsView'
import SummaryView from './SummaryView'

// The URL's search params are the app state. Updates push a history entry, so back and forward work.
export type UpdateParams = (patch: Record<string, string | null>) => void

function useSearchParams(): [URLSearchParams, UpdateParams] {
  const [search, setSearch] = useState(window.location.search)

  useEffect(() => {
    const onPopState = () => setSearch(window.location.search)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const update = useCallback<UpdateParams>((patch) => {
    const next = new URLSearchParams(window.location.search)
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') next.delete(key)
      else next.set(key, value)
    }
    const query = next.toString()
    window.history.pushState(null, '', query ? `?${query}` : window.location.pathname)
    setSearch(window.location.search)
  }, [])

  return [useMemo(() => new URLSearchParams(search), [search]), update]
}

export default function App() {
  const [params, update] = useSearchParams()
  const view = params.get('view') === 'summary' ? 'summary' : 'filings'

  return (
    <main>
      <header>
        <h1>SEC EDGAR Filings</h1>
        <nav>
          <button className={view === 'filings' ? 'active' : ''} onClick={() => update({ view: 'filings' })}>
            Filings
          </button>
          <button className={view === 'summary' ? 'active' : ''} onClick={() => update({ view: 'summary' })}>
            Summary
          </button>
        </nav>
      </header>
      {view === 'filings' ? <FilingsView params={params} update={update} /> : <SummaryView params={params} update={update} />}
    </main>
  )
}
