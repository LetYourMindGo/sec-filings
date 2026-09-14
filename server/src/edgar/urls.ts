// Every EDGAR URL is built here. data.sec.gov wants the CIK zero-padded to 10 digits;
// www.sec.gov/Archives wants it unpadded (padded redirects with a 301).

export const COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json'

export function submissionsUrl(cik: number): string {
  return `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`
}

export function filingIndexUrl(cik: number, accessionNumber: string): string {
  return `${archiveFolder(cik, accessionNumber)}/${accessionNumber}-index.htm`
}

export function primaryDocUrl(cik: number, accessionNumber: string, primaryDocument: string): string {
  return `${archiveFolder(cik, accessionNumber)}/${primaryDocument}`
}

export function documentUrl(cik: number, accessionNumber: string, primaryDocument: string | null): string {
  return primaryDocument
    ? primaryDocUrl(cik, accessionNumber, primaryDocument)
    : filingIndexUrl(cik, accessionNumber)
}

function archiveFolder(cik: number, accessionNumber: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replaceAll('-', '')}`
}
