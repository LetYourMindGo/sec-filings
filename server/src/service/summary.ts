import type { Filing } from 'shared'

// EDGAR assigns filingDate on the Eastern-time business calendar, so "today" is taken in New York,
// not UTC. Otherwise the window starts a day late for several hours every evening.
// en-CA with 2-digit parts formats as YYYY-MM-DD.
const newYorkDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

export function todayInNewYork(now: Date): string {
  return newYorkDate.format(now)
}

// Start of the "last 12 months" window: the same calendar day one year earlier, inclusive.
// Feb 29 maps to Feb 28. Dates are YYYY-MM-DD, so string comparison orders them correctly.
export function twelveMonthsBefore(today: string): string {
  const [year, month, day] = today.split('-')
  const start = `${Number(year) - 1}-${month}-${day}`
  return month === '02' && day === '29' ? start.replace(/-29$/, '-28') : start
}

// filings.recent always holds at least a year of filings (PLAN.md Phase 2e). If older filings exist in
// filings.files and recent doesn't reach before the window start, the counts may be short. Equal
// counts as truncated because a single day's filings can be split between recent and a chunk.
// A company whose whole history is younger than the window has no older chunks and isn't truncated.
export function isTruncated(recent: Filing[], hasOlderChunks: boolean, since: string): boolean {
  if (!hasOlderChunks || recent.length === 0) return false
  const oldest = recent.reduce((min, f) => (f.filingDate < min ? f.filingDate : min), recent[0]!.filingDate)
  return oldest >= since
}
