# Notes

Decisions, limitations and next steps. `PLAN.md` has the full plan; this file is completed in Phase 7.

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
