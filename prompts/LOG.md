
## 2026-09-14 20:11 UTC

Read ASSIGNMENT.pdf and PLAN.md.

Then do Phase 0 only — recon. Write no application code yet.

For each of Apple, JPMorgan, and Spotify: curl the EDGAR endpoints listed in
Phase 0 and report the actual JSON shapes you find. I need answers to the
questions in PLAN.md's "Recon notes" section specifically — I wrote those
shapes from documentation and some may be wrong. Fill that section in with
what you observe.

Save trimmed fixtures to server/test/fixtures/.

If anything in PLAN.md contradicts what EDGAR actually returns, stop and tell
me before adjusting.

## 2026-09-14 20:24 UTC

it's set in .env, go ahead

## 2026-09-14 20:33 UTC

yes, drop the chunk walk and update the plan

## 2026-09-14 20:43 UTC

go ahead with Phase 1

## 2026-09-14 20:54 UTC

go ahead with Phase 2

## 2026-09-14 21:25 UTC

Report findings, change nothing yet.
Cross-check the Recon notes section of PLAN.md against the code in
   server/src/. For each observed finding, say whether the implementation
   handles it, ignores it, or contradicts it. I want the ones we recorded
   during recon and then didn't act on.

## 2026-09-14 21:34 UTC

Good. Decisions:

1. Form names: leave them split. EDGAR's form string is the form type, and a
   hand-rolled alias table would silently merge distinct forms. Add it to the
   decisions table in PLAN.md with that reason.
2. Fix now.
8. Fix now: compute "today" in America/New_York, not UTC. Keep
   twelveMonthsBefore(today) parameterised; only the caller changes. Print the
   value once to confirm the YYYY-MM-DD format before relying on it.

Fold into Phase 3 rather than doing now:
4. Second cache layer: keep SQLite for raw bodies, add an in-memory
   Map<cik, Filing[]> for normalized results under the same TTL. No eviction —
   note the unbounded-map limitation in NOTES.md instead.
3. Dedupe the summary by CIK, not by ticker.
6. Move the EDGAR_USER_AGENT assertion into index.ts as a startup check;
   client.ts just reads it. Pure modules must keep not importing client.ts so
   bun test works on a fresh clone with no .env.

Leave alone: isTruncated's >= rule (false alarm is the right direction — add a
NOTES.md line that it has never fired against live data), and #9.

Record 5 and 7 as Phase 4 and NOTES.md items so they don't get lost.

Do 1, 2 and 8 now with a test each, then commit. Don't start Phase 3 yet.

## 2026-09-14 21:39 UTC

Review the fetch and cache path in edgar/client.ts and cache.ts for what
   gets written to the cache versus what gets validated. Consider what happens
   if EDGAR returns a 200 with a body that isn't JSON.

## 2026-09-14 22:04 UTC

Phase 4 — the frontend. Backend is done; don't change server/ unless something
is actually broken.

Setup
- Add the two response envelope types to shared/types.ts (FilingsResponse,
  SummaryResponse) and use them in web/src/api.ts. Plain fetch, not Eden — I
  don't want cross-workspace type inference on the clock.
- API base http://localhost:3000 as one constant in api.ts. CORS is already
  configured for :5173.
- TanStack Query provider in main.tsx. No component library, no CSS framework;
  minimal hand-written CSS is fine.

State
- URL search params are the state: ?view=filings|summary&ticker=AAPL&form=10-K
  &includeAmendments=true&sort=-filingDate&page=2 and &tickers=AAPL,SPOT,JPM
  for the summary. Read and write them with useSearchParams-style logic; no
  router library needed if it's simpler without one.
- All filtering, sorting and paging go to the server as query params. Nothing
  is filtered or sorted client-side.

Filings view
- Company switcher: quick buttons for AAPL, SPOT, JPM plus a free-text ticker
  input. BRK.B should work.
- Form filter: quick picks for 10-K, 10-Q, 8-K plus free text, and a checkbox
  for includeAmendments. 87% of JPMorgan's filings are 424B2, so the unfiltered
  JPM list is pages of prospectuses — make the filter obvious.
- Table: form, filing date, report date, description, size. Filing Date header
  toggles sort. Each row links to documentUrl with target="_blank"
  rel="noreferrer".
- Pagination: prev/next plus "showing X–Y of N".

Summary view
- Ticker set input, defaulting to AAPL,SPOT,JPM.
- One row per company: name, total filings in the last 12 months, latest 10-K.
  Render a null latest 10-K as "—" with a short note that foreign private
  issuers such as Spotify file 20-F instead.
- Per-company form breakdown sorted by count descending, top 8 with "+N more".
  A 20-column matrix is unreadable with JPMorgan in the set.
- Show the `since` date the API returns, so the window is visible.
- Footnote when truncated is true.
- Render the errors[] array — an unknown ticker in the set must be visible, not
  silently dropped.

Every view needs loading, error and empty states. On an API error show the
message from the error envelope, not a blank screen.

No chart. Verify both views in the browser yourself, then commit. Stop there
and tell me what's left — don't start Phase 5 or 6.
