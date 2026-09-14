// Response shapes shared by the server and the web client.
// Missing EDGAR values are null, never "". Dates are EDGAR's YYYY-MM-DD strings.

export interface Filing {
  accessionNumber: string
  form: string
  filingDate: string
  reportDate: string | null
  primaryDocument: string | null
  primaryDocDescription: string | null
  size: number
  isXBRL: boolean
  documentUrl: string
}

export interface Company {
  ticker: string
  cik: string
  name: string
}

export interface CompanySummary extends Company {
  countsByForm: Record<string, number>
  totalLast12Months: number
  latest10K: string | null
  truncated: boolean
}
