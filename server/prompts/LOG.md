
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
