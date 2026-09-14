
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
