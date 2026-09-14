# Notes

What was decided while building this, what it doesn't handle, and what would come next. For running
the app and the API reference, see [README.md](README.md). For the plan, the observed EDGAR response
shapes and the full decisions table, see [PLAN.md](PLAN.md).

## Decisions

The [decisions table in PLAN.md](PLAN.md#decisions) records each API behaviour choice and its reason.
The decisions below aren't in that table. They were made during the build and changed the code's
structure compared with the plan.

- **Outbound requests are spaced 125 ms apart instead of going through a token bucket.** A bucket that
  holds 8 tokens can start 16 requests inside one second, which breaks SEC's 10 req/s ceiling. Fixed
  spacing can't exceed 8.
- **EDGAR bodies are checked before they are cached.** The first version cached whatever came back
  with a 200. An HTML error page or a wrongly shaped JSON body would then fail every request for that
  company until the entry expired: an hour for filings, a day for the ticker list. The checks assert
  only the fields the normalizer needs, so a column SEC adds doesn't break parsing.
- **Parsed and normalized results are also kept in memory, on top of the SQLite cache.** JPMorgan's
  submissions file is 4.6 MB and 26k filings, and without this layer every page request would read
  and parse it again. The in-memory layer also shares one load between concurrent requests. The
  client had its own in-flight map for that, which could never match once this layer existed, so it
  was removed.
- **A summary returns one row per CIK, not per ticker.** `JPM` and `JPM-PC` are the same company. The
  first requested ticker names the row.
- **The web client uses plain `fetch` typed with `shared/types.ts`, not Eden.** Cross-workspace type
  inference was a risk to the time budget. The server checks its responses against the same types with
  `satisfies`.

## Known limitations

- `truncated` is set when `filings.recent` doesn't reach before the window start and older filing
  chunks exist. It also fires when `recent` starts exactly on the window start, because one day's
  filings can be split between `recent` and a chunk. That errs toward a false alarm. It has never
  fired against live data: on 2026-09-14 it was false for AAPL, JPM and SPOT. JPMorgan's margin was
  two days.
- The latest-10-K column is empty for foreign private issuers such as Spotify. They file annual
  reports as `20-F`, which this summary doesn't count as a 10-K.
- An unfiltered filings list for a heavy filer is mostly noise: 87% of JPMorgan's filings in the last
  year are `424B2` prospectuses.
- Expired cache entries are not used as a fallback. If EDGAR is unreachable after an entry's TTL,
  the request fails even though the old body is still in SQLite. This is deliberate: serving stale
  data would need a staleness indicator in every response, which isn't worth it at this scope.
- The in-memory layer (`server/src/edgar/company.ts`) keeps normalized filings per CIK and never
  evicts, so memory grows with the number of distinct companies requested. JPMorgan alone is 26k
  filing objects. Its entries expire on the same TTL as the SQLite rows but count from when they were
  loaded, so data can be up to two TTLs old (2 h for filings) if it was loaded from a nearly expired row.
- `GET /companies/:ticker/filings` lists only `filings.recent`. That is at least a year of filings, or
  the latest 1000 if that reaches further back. Apple's list goes back to 2015. JPMorgan's stops at
  one year, and its older filings can't be listed.
- The cache and the rate limiter live in one process. Two server instances would keep separate caches
  and could together send up to 16 requests per second to EDGAR.
- The UI runs only under the Vite dev server, because the API proxy is a dev-server feature. Nothing
  serves a production build.
- A request that fails at the network level (DNS, refused or reset connection) is reported as a 502
  but not retried. Only 429 and 5xx responses get the single retry.
- Once during review, `GET /companies/%20/filings` returned a 500 immediately after the server
  started, with nothing in the log. Replaying the same requests on fresh servers returned 404 every
  time, so the cause is unknown.

## Next steps

- Expire in-memory entries from when EDGAR served the body rather than from when it was loaded. The
  client would return the SQLite `fetched_at` with the data. That removes the two-TTL staleness above.
- Read the `filings.files` chunks when a filings request pages past the end of `recent`. Their
  `filingFrom`/`filingTo` bounds are off by about a day (see the Recon notes in PLAN.md), so chunk
  selection needs a margin.
- Show the latest annual report of any type (`10-K`, `20-F`, `40-F`) next to the latest 10-K, so
  foreign private issuers don't show a blank.
- For more than one instance, move the cache to a shared store and enforce the 8 req/s limit across
  instances, not per process.
- For full history across many companies, ingest SEC's bulk `submissions.zip` once instead of
  fetching company by company.
- XBRL company facts (`data.sec.gov/api/xbrl/companyfacts/`) would add financial data next to the
  filings. It's listed here because the plan asked for it, and it is out of scope for this build.
