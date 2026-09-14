
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

## 2026-09-14 21:42 UTC

Approved, with three adjustments.

1. Hand-written checks — but not because of the dependency (Elysia already
   carries TypeBox transitively). The reason is scope: assert only what the
   normalizer reads. Submissions needs
   Array.isArray(x?.filings?.recent?.accessionNumber) and
   Array.isArray(x?.filings?.files). Tickers needs a non-empty object whose
   values have a numeric cik_str and a string ticker. Do not validate the
   other columns — SEC adding one must not break us.

2. Put the predicates next to the Raw types in normalize.ts and pass them in
   as fetchJson(url, ttl, isValid). client.ts stays about transport.

3. On a failed check: delete the cached row, then throw an error carrying the
   URL and the first ~100 chars of the body. Phase 3 routes map it to 502 with
   a generic message — don't return upstream bytes to the client.

Skip the stale-on-expiry fallback and the synchronous-write concern. Add one
NOTES.md line recording that expired entries are not used as a fallback, and
that this is a deliberate choice.

Sequence: move the EDGAR_USER_AGENT assertion to index.ts first, then this,
then the rest of Phase 3.

Two tests, both stubbing fetch: the 200-with-HTML case and the
valid-JSON-wrong-shape case. Each should assert the error carries the URL and
that no row survives in SQLite afterwards.

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

## 2026-09-14 22:19 UTC

1. Remove the fixed-port CORS coupling.

Vite picks another port when 5173 is taken (I saw it land on 5174), and then
every API call is blocked because cors() is pinned to 5173. A reviewer with
anything on 5173 gets a blank app with no useful error.

- Add a dev proxy in web/vite.config.ts for /companies and /filings pointing at
  http://localhost:3000, so the frontend's requests are same-origin whatever
  port Vite chooses.
- API_BASE in api.ts becomes '' — leave the fetch paths as they are.
- Then delete the cors() plugin and drop @elysiajs/cors from
  server/package.json. With the proxy it's dead configuration: browser requests
  are same-origin, Swagger is served from :3000 to itself, and curl doesn't
  enforce CORS. Per CLAUDE.md, config that isn't load-bearing goes.
- Verify by starting Vite while 5173 is already occupied: both views must work
  on the fallback port.

2. Write README.md.

Audience is a reviewer who has just cloned the repo and wants it running in two
minutes, then wants to understand what they're looking at. Keep to the prose
rules in CLAUDE.md.

Cover, in this order:
- One paragraph: what it is, and that data comes from SEC EDGAR at request time
  with no database.
- Requirements: Bun (state the version you're on), nothing else.
- Setup: bun install, then copy .env.example to .env and set
  EDGAR_USER_AGENT to the reader's own name and email. Say plainly that SEC
  returns 403 without it and that the repo can't ship a working value.
- Run: bun dev (both), and note the API port and that Vite may choose a
  different port.
- Test: bun test, and that tests use saved fixtures and never hit the network.
- The two endpoints, each with a curl example that actually works — use
  ?form=10-K&limit=3 for AAPL and ?tickers=AAPL,SPOT,JPM for the summary — plus
  a one-line description of every query parameter and its default.
- Swagger URL.
- Project layout: a short tree with one line per directory saying what lives
  there.
- Pointers to PLAN.md for the plan and recon findings, and NOTES.md for
  decisions and limitations. Don't duplicate their content.

Then verify it: clone the repo into a temp directory outside this one, follow
your own README from the top, and confirm bun install, bun test and bun dev all
work. The clone won't have .env, so the README's setup step is the thing under
test. Report what you had to do that the README didn't tell you, then fix it.
Delete the temp clone afterwards.

## 2026-09-14 22:25 UTC

yes, fix the hook path

## 2026-09-14 22:37 UTC

Phase 6. Review the whole tree as a reviewer would: git diff 3da10ac..HEAD.

Constraints: no new features, no refactoring for taste, tests must still pass.
Only remove, clarify, or correct.

Look for:
- Single-caller abstractions and config with one value. Candidates I noticed,
  each to evaluate rather than delete on sight: API_BASE is now the empty
  string; RawSubmissions.filings.files declares four fields when only .length
  is read; company.ts uses a Map with a single 'all' key to reuse remember();
  filingIndexUrl and primaryDocUrl may only have test callers outside
  documentUrl.
- Comments describing code that has since changed. The isTruncated comment
  still points at "PLAN.md Phase 2e" — check that reference still makes sense.
- PLAN.md's Phase 1 file tree predates edgar/company.ts and web/src/styles.css
  and still implies chunkUrl. Update it to match the repo.
- Two wording fixes in SummaryView: the † footnote says "this company" but
  renders once under a multi-row table, and the * footnote explains any missing
  10-K as a foreign private issuer, which wouldn't hold for a domestic filer.
- Tick the PLAN.md checkboxes that are actually done, including the README and
  the fresh-clone verification.

Then run /simplify, then /code-review. Report what each found and what you
applied before committing.

## 2026-09-14 22:56 UTC

Finish NOTES.md. Prose rules from CLAUDE.md apply. Don't duplicate README.md or
PLAN.md; link to them.

Keep the five entries already under "Known limitations" as they are — the
truncated false-alarm reasoning, the 20-F case, the 424B2 noise, the no-stale-
fallback decision and the eviction/two-TTL note. Replace the opening line that
says the file is completed in Phase 7.

## 2026-09-14 22:59 UTC

yes, commit both
