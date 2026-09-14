// Every EDGAR URL is built here. data.sec.gov wants the CIK zero-padded to 10 digits;
// www.sec.gov/Archives wants it unpadded (padded redirects with a 301).

export const COMPANY_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json'

export function submissionsUrl(cik: number): string {
  return `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`
}

// Links to the primary document, or to the filing's index page when EDGAR names none.
export function documentUrl(cik: number, accessionNumber: string, primaryDocument: string | null): string {
  const folder = `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionNumber.replaceAll('-', '')}`
  return primaryDocument ? `${folder}/${primaryDocument}` : `${folder}/${accessionNumber}-index.htm`
}
