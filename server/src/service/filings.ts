import type { Filing, Sort } from 'shared'

export interface FilingsQuery {
  form?: string
  includeAmendments: boolean
  sort: Sort
  limit: number
  offset: number
}

// Filter, then sort, then page. Form matching is exact and case-insensitive; includeAmendments also
// matches "<form>/A". total counts the filtered set, before paging.
export function listFilings(filings: Filing[], query: FilingsQuery): { items: Filing[]; total: number } {
  const form = query.form?.toUpperCase()
  const matching = form
    ? filings.filter((f) => {
        const candidate = f.form.toUpperCase()
        return candidate === form || (query.includeAmendments && candidate === `${form}/A`)
      })
    : filings

  const direction = query.sort === 'filingDate' ? 1 : -1
  const sorted = matching.toSorted((a, b) => direction * a.filingDate.localeCompare(b.filingDate))

  return { items: sorted.slice(query.offset, query.offset + query.limit), total: matching.length }
}
