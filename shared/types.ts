// Response shapes shared by the server and the web client.
// Missing EDGAR values are null, never "". Dates are EDGAR's YYYY-MM-DD strings.

export interface Filing {
  accessionNumber: string
  form: string
  filingDate: string
  reportDate: string | null
  primaryDocument: string | null
  primaryDocDescription: string | null
  size: number | null
  isXBRL: boolean
  documentUrl: string
}

export interface Company {
  ticker: string
  cik: number
  name: string
}

export interface CompanySummary extends Company {
  countsByForm: Record<string, number>
  totalLast12Months: number
  latest10K: string | null
  truncated: boolean
}

// GET /companies/:ticker/filings
export interface FilingsResponse {
  company: Company
  items: Filing[]
  total: number
  limit: number
  offset: number
}

// GET /filings/summary
export interface SummaryResponse {
  since: string
  results: CompanySummary[]
  errors: { ticker: string; reason: string }[]
}
