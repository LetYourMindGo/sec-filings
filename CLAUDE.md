# SEC EDGAR Filings Explorer

An API over the SEC EDGAR submissions data, with a small React UI on top of it.
`PLAN.md` holds the implementation plan and the decisions behind it.

## Constraints

- **Time budget: 4 hours total.** Prefer cutting scope to extending the budget. If a step is running
  long, say so and propose what to drop.
- **Stack:** Bun + Elysia backend, React + Vite frontend, TypeScript throughout.
- **`PLAN.md` is the agreed plan.** Follow its phases in order. If a step looks wrong, stop and raise
  it rather than deviating silently.
- **Ask before adding any dependency** that isn't already in `package.json`.
- Prefer the obvious implementation over the clever one. No abstraction with a single caller.
  No configuration option with a single value.

## EDGAR rules

- A `User-Agent` header with contact info is **mandatory** — EDGAR returns 403 without one. Read it
  from `EDGAR_USER_AGENT` and fail at boot if it's unset.
- **Rate limit: max 8 req/s** across all outbound EDGAR traffic. SEC's published ceiling is 10 req/s
  and clients that exceed it get throttled.
- CIK padding differs by host: **zero-padded to 10 digits** for `data.sec.gov/submissions/`,
  **unpadded** for `www.sec.gov/Archives/`. All URL construction lives in
  `server/src/edgar/urls.ts` and nowhere else.
- `filings.recent` holds at least 12 months of filings or 1000 filings, whichever is more. Both
  endpoints read `recent` only; the `filings.files` chunks are never fetched. See `PLAN.md` Phase 2e.

## Conventions

- **Pure functions stay separate from I/O.** Normalizing, filtering, sorting, paginating and
  summarizing take data in and return data out. Only `edgar/client.ts` touches the network.
- **Tests never hit the network.** Use the fixtures in `server/test/fixtures/`.
- Validate every route with a TypeBox schema, so runtime validation and handler types come from one
  declaration.
- Convert EDGAR's empty strings to `null` at the normalization boundary.

## Prose

`README.md` and `NOTES.md` are written for another engineer, in plain declarative sentences. No
marketing register, no "seamlessly" / "robust" / "leverages", no three-item lists where one item
would do, no restating the obvious back to the reader. State what the thing does, what it doesn't
do, and why. If a sentence could appear in any project's README, cut it.

## Out of scope

Auth, Docker, CI, end-to-end tests, XBRL financial facts, full-text search, component libraries,
charting libraries beyond one small chart, and logging frameworks. Don't add these, and don't
suggest them unless asked.

## Prompt log

Every prompt is appended to `prompts/LOG.md` by a `UserPromptSubmit` hook. It's a required
deliverable — if you notice it isn't being written, say so.

## Definition of done

- `bun install && bun dev` works from a fresh clone
- `bun test` passes
- `README.md` has runnable curl examples for both endpoints
- `NOTES.md` records the decisions from `PLAN.md`, known limitations, and next steps
- Every file answers *"why does this exist, and what breaks if I delete it?"*
