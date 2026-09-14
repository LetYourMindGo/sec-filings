# Implementation plan

SEC EDGAR filings explorer: an API over EDGAR's submissions data plus a small UI on top of it.

**Time budget:** ~4 hours including setup. Where a step runs long, cut scope rather than extending
the budget, and record the cut in `NOTES.md`.

**Stack:** Bun + Elysia backend, React + Vite frontend, TypeScript throughout.

**Guiding rule:** for every file, answer *"why does this exist, and what breaks if I delete it?"*
Delete the ones without an answer.

---

## Phase 0 — Recon (40 min)

EDGAR's submissions format is the awkward part of this build: columnar arrays instead of objects,
ticker-to-CIK indirection, and a `recent` list that silently caps. Inspect the live responses before
designing against them. The shapes described in this file come from documentation and memory, so
treat them as claims to check.

- [x] Export `EDGAR_USER_AGENT` in the shell before any request. EDGAR returns **403** without a
      `User-Agent` carrying contact info. Format: `"Name email@example.com"`.
      Keep the real value out of tracked files; it's a personal contact address and this repo
      will be public.
- [x] `curl -H "User-Agent: $EDGAR_USER_AGENT" https://www.sec.gov/files/company_tickers.json`
      → confirm the shape (object keyed by index, `{ cik_str, ticker, title }`) and the payload size.
- [x] `curl -H "User-Agent: $EDGAR_USER_AGENT" https://data.sec.gov/submissions/CIK0000320193.json`
      (Apple) → inspect the `filings.recent` keys and the `filings.files` list.
- [x] Same for **JPMorgan** (CIK 0000019617), a high-volume filer. Check whether `filings.recent`
      still spans the last 12 months. The answer determines whether Phase 2e is required.
- [x] Same for **Spotify** (find `SPOT` in `company_tickers.json`). As a foreign private issuer it
      files 20-F and 6-K and has no 10-K, so the summary must handle a null `latest10K`.
- [x] Fetch one `filings.files` chunk directly, e.g.
      `https://data.sec.gov/submissions/CIK0000019617-submissions-001.json`
      → confirm whether the columnar arrays sit at the top level or nested under `filings`.
      The normalizer depends on this.
- [x] Check whether `filings.files[]` entries carry `filingFrom` / `filingTo`. If they do, chunks
      overlapping the 12-month window can be selected without fetching all of them.
- [x] Save trimmed fixtures (a few hundred rows each) to `server/test/fixtures/`:
      `company_tickers`, `aapl-submissions`, `jpm-submissions`, `jpm-chunk-001`, `spot-submissions`.
- [x] Record findings in the *Recon notes* section at the bottom of this file.

---

## Phase 1 — Scaffold (20 min)

```
├─ package.json          # bun workspaces: ["server", "web", "shared"]
├─ README.md
├─ NOTES.md
├─ PLAN.md
├─ prompts/              # prompt log
├─ shared/
│  └─ types.ts           # Filing, Company, CompanySummary
├─ server/
│  ├─ src/
│  │  ├─ index.ts        # Elysia app + routes
│  │  ├─ edgar/
│  │  │  ├─ client.ts    # fetch + UA + rate limit + cache + single-flight
│  │  │  ├─ normalize.ts # columnar → Filing[]   (pure)
│  │  │  ├─ tickers.ts   # ticker → CIK
│  │  │  └─ urls.ts      # all URL construction
│  │  ├─ service/
│  │  │  ├─ filings.ts   # filter / sort / paginate  (pure)
│  │  │  └─ summary.ts   # 12-month rollup           (pure)
│  │  └─ cache.ts        # bun:sqlite TTL store
│  └─ test/
└─ web/
   └─ src/
      ├─ App.tsx
      ├─ api.ts          # Eden client (or plain fetch)
      ├─ FilingsView.tsx
      └─ SummaryView.tsx
```

- [x] `bun init`; root `package.json` with `"workspaces": ["server", "web", "shared"]`
- [x] `cd server && bun add elysia @elysiajs/cors`
- [x] `cd web && bun create vite . --template react-ts && bun add @tanstack/react-query`
- [x] Root scripts: `dev`, `dev:server`, `dev:web`, `test`
- [x] `.gitignore`: `.env`, `node_modules`, and the SQLite cache file
- [x] `.env.example` with a placeholder: `EDGAR_USER_AGENT="Your Name your@email.com"`.
      The real value lives in `.env`, which stays untracked.
- [x] Commit at each phase boundary

---

## Phase 2 — EDGAR client (60 min)

The normalizer, both endpoints and the summary all read through this layer, so it gets the most time.

### 2a. URL construction — `edgar/urls.ts`

CIK padding differs between the two EDGAR hosts, so all URL building lives in one module and
nowhere else.

- [ ] `submissionsUrl(cik)` → `https://data.sec.gov/submissions/CIK{cik padded to 10}.json`
- [ ] `filingIndexUrl(cik, accession)` →
      `https://www.sec.gov/Archives/edgar/data/{cik unpadded}/{accession without dashes}/{accession with dashes}-index.htm`
- [ ] `primaryDocUrl(cik, accession, primaryDocument)` →
      `https://www.sec.gov/Archives/edgar/data/{cik unpadded}/{accession without dashes}/{primaryDocument}`
- [ ] Prefer `primaryDocUrl`; fall back to the index URL when `primaryDocument` is empty
- [ ] Unit test both against URLs verified by hand in Phase 0

### 2b. Rate limiting, caching, request dedupe — `edgar/client.ts`, `cache.ts`

- [ ] **Token bucket at ~8 req/s** for all outbound EDGAR traffic. SEC's published ceiling is 10
      req/s and clients that exceed it get throttled or blocked.
- [ ] Set the `User-Agent` in one place. Fail at boot if `EDGAR_USER_AGENT` is unset, rather than
      surfacing it later as an opaque 403.
- [ ] **SQLite TTL cache** (`bun:sqlite`): `cache(key TEXT PRIMARY KEY, body TEXT, fetched_at INTEGER)`.
      Persists across restarts, so development doesn't re-fetch the same submissions.
      TTLs: submissions ~1h, `company_tickers.json` ~24h.
- [ ] **Single-flight**: a `Map<string, Promise<T>>` of in-flight requests, so a multi-ticker summary
      doesn't issue duplicate fetches for the same CIK.
- [ ] Retry once on 429/5xx with a short backoff. No general retry framework.

### 2c. Ticker → CIK — `edgar/tickers.ts`

- [ ] Fetch `company_tickers.json` once and parse into a `Map` keyed by uppercase ticker
- [ ] Case-insensitive lookup; unknown ticker returns a typed not-found, surfaced as 404
- [ ] Pad the CIK to 10 digits at the submissions boundary; keep it unpadded for Archives URLs

### 2d. Normalizer — `edgar/normalize.ts` (pure, no I/O)

- [ ] `normalizeColumnar(cols) → Filing[]`, zipping the parallel arrays by index
- [ ] Iterate over `accessionNumber.length` and tolerate shorter sibling arrays rather than assuming
      every column has equal length
- [ ] Produce `{ accessionNumber, form, filingDate, reportDate, primaryDocument,
      primaryDocDescription, size, isXBRL, documentUrl }`
- [ ] Convert EDGAR's empty strings to `null` at this boundary so downstream code has one
      representation of "missing"

### 2e. 12-month window from `filings.recent` (10 min)

Phase 0 showed that `filings.recent` holds at least one year of filings or 1000 filings, whichever
is more. JPMorgan's has 26,143 rows covering exactly 12 months. Both endpoints read `recent` only,
and nothing fetches the `filings.files` chunks.

- [ ] `truncated = oldest recent filingDate > sinceDate`. That flag is the only guard in case a
      filer ever breaks the one-year rule. If it's set, the counts are an under-count.
- [ ] Expose `truncated: boolean` on the summary response so a partial result is visible rather than
      silently wrong
- [ ] `sinceDate` is a parameter of the pure summary function, not read from the clock, so tests
      pin it to the fixture date (2026-09-14)

---

## Phase 3 — Endpoints (40 min)

One TypeBox schema per route. It validates the request at runtime and types the handler from the
same declaration, including coercing numeric query strings.

### `GET /companies/:ticker/filings`

- [ ] Query: `form?`, `limit?` (default 50, max 200), `offset?` (default 0),
      `sort?` (`filingDate` | `-filingDate`, default `-filingDate`)
- [ ] Response: `{ company: { ticker, cik, name }, items: Filing[], total, limit, offset }`
- [ ] Filtering, sorting and pagination are pure functions in `service/filings.ts`
- [ ] Every item carries a `documentUrl` on sec.gov

### `GET /filings/summary?tickers=AAPL,SPOT,JPM`

- [ ] Parse comma-separated tickers; cap at 10 and reject more, since each one costs upstream requests
- [ ] Per ticker: `{ ticker, cik, name, countsByForm, totalLast12Months, latest10K, truncated }`
- [ ] Fetch concurrently with `Promise.allSettled` and isolate failures:
      `{ results: [...], errors: [{ ticker, reason }] }`. One unresolvable ticker shouldn't fail the
      whole response.
- [ ] `latest10K` is the newest exact `10-K` in `recent`, not limited to the 12-month window; `null` when there is none

### Plumbing

- [ ] CORS for the Vite dev origin
- [ ] Error envelope: `{ error: { code, message } }`
- [ ] `@elysiajs/swagger` for a browsable API surface
- [ ] Verify both endpoints with `curl` before starting the frontend

---

## Phase 4 — Frontend (50 min)

No component library. Plain elements keep the dependency count and the styling surface small.

- [ ] TanStack Query provider; Eden typed client in `api.ts`, falling back to `fetch` if the type
      inference proves awkward
- [ ] **URL search params hold the view state**: `?ticker=AAPL&form=10-K&sort=-filingDate&page=2`.
      Less code than local state, and filtering, sorting and pagination stay server-side, which is
      where the endpoints already implement them.
- [ ] **Filings view**: company selector (presets + free-text ticker), form-type filter, sortable
      filing date, pagination, each row linking to the document on sec.gov
      (`target="_blank" rel="noreferrer"`)
- [ ] **Summary view**: company × form-type counts, plus a latest-10-K column rendering `null` as an
      explicit "—". A small bar chart if time allows; the table is the requirement.
- [ ] Loading, error and empty states on both views. An unknown ticker shows the API's message.
- [ ] Show a footnote when `truncated` is true

---

## Phase 5 — Tests (30 min)

Pure functions against saved fixtures. No network access in tests. `bun test`.

- [ ] `normalizeColumnar` — happy path
- [ ] `normalizeColumnar` — ragged arrays don't throw or misalign columns
- [ ] `normalizeColumnar` — `""` becomes `null`
- [ ] Ticker resolution — lowercase input resolves
- [ ] Ticker resolution — unknown ticker returns not-found
- [ ] `documentUrl` — CIK padding correct per host; index-URL fallback when `primaryDocument` is empty
- [ ] 12-month boundary — a filing dated exactly at the cutoff lands on the documented side
- [ ] `latest10K` — Spotify fixture returns `null`
- [ ] `latest10K` — ignores `10-K/A`
- [ ] `countsByForm` — correct for the Apple fixture
- [ ] `truncated` — false for the JPMorgan fixture at 2026-09-14; true when `sinceDate` is older than its oldest row
- [ ] `filter` + `sort` + `paginate` compose correctly on page 2 of a filtered set

---

## Phase 6 — Review the diff (20 min)

- [ ] Read the full diff as a reviewer would
- [ ] Remove unused helpers, single-caller abstractions, and comments describing code that has changed
- [ ] Rewrite anything that can't be explained simply
- [ ] Re-apply the "why does this file exist?" check across the tree

---

## Phase 7 — Ship (20 min)

- [ ] **README**: overview, `bun install`, `bun dev`, `bun test`, and runnable curl examples for
      both endpoints. State that `EDGAR_USER_AGENT` must be set to the reader's own name and email.
      SEC requires each client to identify itself, so the repo can't ship a working value.
- [ ] Verify the README from a fresh `git clone` in an empty directory
- [ ] **NOTES.md**: the decisions below with their reasons, known limitations, and next steps
      (shared cache for multi-instance deploys, full-history backfill, XBRL company facts,
      bulk `submissions.zip` ingestion)
- [ ] Confirm `prompts/LOG.md` is complete
- [ ] Push to GitHub and check the README renders correctly

---

## Decisions

| Question | Decision | Reason |
|---|---|---|
| Does `form=10-K` match `10-K/A`? | Exact match; `?includeAmendments=true` widens it | Amendments are separate filings; merging them distorts per-form counts |
| Pagination style | `limit` / `offset` with `total` | Cursors add complexity without benefit over a bounded, already-materialized list |
| "Last 12 months" from when? | `filingDate >= today − 12 months`, UTC, inclusive | EDGAR dates are `YYYY-MM-DD`, so lexicographic comparison is correct and needs no date library |
| Company with no 10-K | `latest10K: null` | Foreign private issuers file 20-F instead; Spotify is one of the suggested test companies |
| `latest10K` time bound | Everything in `filings.recent` | `recent` covers at least a year, and an active 10-K filer files one a year, so the latest 10-K is in `recent` unless the company stopped filing 10-Ks more than a year and 1000 filings ago |
| One ticker fails in a multi-ticker summary | Partial results plus an `errors[]` array | A summary over several companies should degrade per company rather than fail entirely |
| Unknown ticker | 404 with a message | An empty list is indistinguishable from a company that has filed nothing |
| Cache backing | SQLite via `bun:sqlite` | Small, dependency-free, and survives restarts |
| Full history backfill | No — 12-month window fetched on demand | An ingestion pipeline is out of scope for the time budget |
| Read `filings.files` chunks? | No — `recent` only, with a `truncated` flag | Phase 0 showed `recent` always covers 12 months (JPMorgan: 26,143 rows); the chunk walk would add ~60 min and a second fetch path for no observed benefit |

## Out of scope

Auth, Docker, CI, end-to-end tests, XBRL financial facts, full-text search, component libraries,
and logging frameworks. Each adds setup and configuration without serving the requirements. Spend
the time on test coverage instead.

---

## Recon notes

Observed 2026-09-14 against live EDGAR.

- **`filings.recent` array keys observed:** `accessionNumber`, `filingDate`, `reportDate`,
  `acceptanceDateTime`, `act`, `form`, `fileNumber`, `filmNumber`, `items`, `core_type`, `size`,
  `isXBRL`, `isInlineXBRL`, `isXBRLNumeric`, `primaryDocument`, `primaryDocDescription`. All arrays
  had equal length in all three companies. `size`, `isXBRL` and `isInlineXBRL` are numbers (the
  flags are `0`/`1`); `isXBRLNumeric` is a number or `null`; everything else is a string. Dates are
  `YYYY-MM-DD`; `acceptanceDateTime` is ISO 8601 UTC (`2026-09-10T22:30:31.000Z`). Empty strings
  appear in `reportDate`, `act`, `fileNumber`, `filmNumber`, `items` and `primaryDocDescription`.
  `primaryDocument` was never empty for these three filers. Rows are sorted by `filingDate`
  descending.
- **Does `recent` cover 12 months for JPMorgan?** Yes. `recent` is not capped at ~1000 rows.
  JPMorgan's has **26,143** rows spanning 2025-09-12 to 2026-09-14, exactly one year. Apple's has
  1000 rows spanning 2015-07-24 to 2026-09-10. This matches "at least one year of filings or 1000
  filings, whichever is more". The JPMorgan response is 4.6 MB uncompressed (475 KB gzipped); 87%
  of its rows are `424B2`.
- **Shape of a `filings.files` chunk:** top-level columnar. The chunk is the same 16 arrays with no
  `filings` or `recent` wrapper and no company metadata. `filings.files` chunks do not overlap
  `recent` (0 shared accession numbers for JPMorgan chunk 001).
- **Do `filings.files` entries carry `filingFrom` / `filingTo`?** Yes: `{ name, filingCount,
  filingFrom, filingTo }`. The bounds aren't exact: JPMorgan chunk 001 says `filingTo: 2025-09-10`
  but contains 51 filings dated 2025-09-11. Apple has one chunk (1994-01-26 to 2015-07-22).
  JPMorgan has 70 chunks of ~2000 filings each. Spotify has none (`files: []`).
- **Spotify's form types:** `20-F` (8, latest 2026-02-10), `6-K` (95), plus `144`, `4`, `3`, `S-8`,
  `SC 13G`, `SC 13G/A`, `SCHEDULE 13G`, `SCHEDULE 13G/A`, `F-1`, `F-1/A`, `DRS`, `424B3/4` and a few
  others. There's no `10-K`. `entityType` is `"other"` (Apple and JPMorgan: `"operating"`).
- **Other findings:**
  - `company_tickers.json` is 798 KB, 10,426 entries, an object keyed `"0"`, `"1"`, … with
    `{ cik_str, ticker, title }`. `cik_str` is a **number**, despite its name. Submissions `cik` is a
    zero-padded string.
  - One CIK can have many tickers: JPMorgan has 9 (`JPM`, `JPM-PC`, `VYLD`, …). Share classes use a
    dash (`BRK-B`), so a user typing `BRK.B` won't match. Ticker values are unique across the file.
  - Accession number prefixes belong to the filing agent, not the company (Apple Form 4:
    `0001140361-26-036226`). The Archives path still uses the company CIK and returns 200.
  - URL checks: unpadded CIK on Archives → 200 (primary doc and `-index.htm`); padded CIK on
    Archives → 301; unpadded CIK on `data.sec.gov/submissions` → 404. No `User-Agent` → 403.
  - Form 4 `primaryDocument` is an XSL-rendered path (`xslF345X06/form4.xml`); the resulting URL
    returns 200.
  - After-hours acceptances get the next day's `filingDate` (`2025-09-11T21:59Z` → `2025-09-12`).
    Windowing should use `filingDate`.
  - Form names drift over time: `SC 13G` and `SCHEDULE 13G` both appear for the same filer, so
    per-form counts split across the two names.
  - Apple's 1000-row `recent` includes 10-Ks back to 2015, so `latest10K` resolves from `recent`
    for all three companies.

**Fixtures** (`server/test/fixtures/`), trimmed from the responses above:
- `company_tickers.json`: 8 entries (AAPL, JPM, JPM-PC, VYLD, SPOT, BRK-A, BRK-B, NVDA), original
  object shape and keys.
- `aapl-submissions.json`: first 300 `recent` rows (2023-02-07 to 2026-09-10).
- `jpm-submissions.json`: 542 `recent` rows. That's every row not `424B2`/`FWP`/`424B3`, plus the
  newest and oldest 50 of all rows, so both window ends and the 10-K survive. Form counts don't
  match the live data. `filings.files` is complete (70 entries).
- `jpm-chunk-001.json` was saved during recon and deleted when the chunk walk was dropped.
- `spot-submissions.json`: untrimmed (372 rows).

All fixtures are dated relative to 2026-09-14, so window tests must inject "today" rather than
read the clock.
