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

- [ ] Export `EDGAR_USER_AGENT` in the shell before any request. EDGAR returns **403** without a
      `User-Agent` carrying contact info. Format: `"Name email@example.com"`.
      Keep the real value out of tracked files; it's a personal contact address and this repo
      will be public.
- [ ] `curl -H "User-Agent: $EDGAR_USER_AGENT" https://www.sec.gov/files/company_tickers.json`
      → confirm the shape (object keyed by index, `{ cik_str, ticker, title }`) and the payload size.
- [ ] `curl -H "User-Agent: $EDGAR_USER_AGENT" https://data.sec.gov/submissions/CIK0000320193.json`
      (Apple) → inspect the `filings.recent` keys and the `filings.files` list.
- [ ] Same for **JPMorgan** (CIK 0000019617), a high-volume filer. Check whether `filings.recent`
      still spans the last 12 months. The answer determines whether Phase 2e is required.
- [ ] Same for **Spotify** (find `SPOT` in `company_tickers.json`). As a foreign private issuer it
      files 20-F and 6-K and has no 10-K, so the summary must handle a null `latest10K`.
- [ ] Fetch one `filings.files` chunk directly, e.g.
      `https://data.sec.gov/submissions/CIK0000019617-submissions-001.json`
      → confirm whether the columnar arrays sit at the top level or nested under `filings`.
      The normalizer depends on this.
- [ ] Check whether `filings.files[]` entries carry `filingFrom` / `filingTo`. If they do, chunks
      overlapping the 12-month window can be selected without fetching all of them.
- [ ] Save trimmed fixtures (a few hundred rows each) to `server/test/fixtures/`:
      `company_tickers`, `aapl-submissions`, `jpm-submissions`, `jpm-chunk-001`, `spot-submissions`.
- [ ] Record findings in the *Recon notes* section at the bottom of this file.

---

## Phase 1 — Scaffold (20 min)

```
├─ package.json          # bun workspaces: ["server", "web", "shared"]
├─ README.md
├─ NOTES.md
├─ PLAN.md
├─ prompts/              # prompt log
├─ shared/
│  └─ types.ts           # Filing, CompanySummary, FormType
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

- [ ] `bun init`; root `package.json` with `"workspaces": ["server", "web", "shared"]`
- [ ] `cd server && bun add elysia @elysiajs/cors`
- [ ] `cd web && bun create vite . --template react-ts && bun add @tanstack/react-query`
- [ ] Root scripts: `dev`, `dev:server`, `dev:web`, `test`
- [ ] `.gitignore`: `.env`, `node_modules`, and the SQLite cache file
- [ ] `.env.example` with a placeholder: `EDGAR_USER_AGENT="Your Name your@email.com"`.
      The real value lives in `.env`, which stays untracked.
- [ ] Commit at each phase boundary

---

## Phase 2 — EDGAR client (60 min)

The normalizer, both endpoints and the summary all read through this layer, so it gets the most time.

### 2a. URL construction — `edgar/urls.ts`

CIK padding differs between the two EDGAR hosts, so all URL building lives in one module and
nowhere else.

- [ ] `submissionsUrl(cik)` → `https://data.sec.gov/submissions/CIK{cik padded to 10}.json`
- [ ] `chunkUrl(name)` → `https://data.sec.gov/submissions/{name}`
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

### 2e. 12-month window across `filings.files` (60 min if needed)

`filings.recent` holds only the most recent ~1000 filings. For a high-volume filer that may span
less than 12 months, and a summary built from `recent` alone then under-reports without raising
an error.

- [ ] `getFilingsSince(cik, sinceDate)`:
      1. Normalize `filings.recent`
      2. If its oldest `filingDate` still falls inside the window, the window is truncated
      3. Fetch only the `filings.files` chunks whose `filingFrom`/`filingTo` overlap the window
      4. Concatenate, normalize, sort descending, cut at `sinceDate`
- [ ] Expose `truncated: boolean` on the summary response so a partial result is visible rather than
      silently wrong. If the chunk walk is cut for time, still detect and report the truncation.
- [ ] Test against the JPMorgan fixture

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
- [ ] `latest10K` searches all available history, not just the 12-month window; `null` when there is none

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
- [ ] Window walk — JPMorgan fixture reads from chunks and sets `truncated` correctly
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
| `latest10K` time bound | All available history | The requirement is the date of the latest 10-K, with no time bound |
| One ticker fails in a multi-ticker summary | Partial results plus an `errors[]` array | A summary over several companies should degrade per company rather than fail entirely |
| Unknown ticker | 404 with a message | An empty list is indistinguishable from a company that has filed nothing |
| Cache backing | SQLite via `bun:sqlite` | Small, dependency-free, and survives restarts |
| Full history backfill | No — 12-month window fetched on demand | An ingestion pipeline is out of scope for the time budget |

## Out of scope

Auth, Docker, CI, end-to-end tests, XBRL financial facts, full-text search, component libraries,
and logging frameworks. Each adds setup and configuration without serving the requirements. Spend
the time on Phase 2e and test coverage instead.

---

## Recon notes

Fill in during Phase 0.

- `filings.recent` array keys observed:
- Does `recent` cover 12 months for JPMorgan?
- Shape of a `filings.files` chunk (top-level columnar, or nested):
- Do `filings.files` entries carry `filingFrom` / `filingTo`?
- Spotify's form types:
- Other findings:
