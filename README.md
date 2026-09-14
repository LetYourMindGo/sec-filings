# SEC EDGAR Filings Explorer

An API and a small React UI for browsing a company's SEC filings by ticker and comparing filing
activity across companies over the last 12 months. Every request reads from SEC EDGAR's submissions
API at request time. There is no database; responses are cached in a local SQLite file for up to an
hour so repeated requests don't hit EDGAR again.

## Requirements

[Bun](https://bun.sh). Developed on Bun 1.4.2.

## Setup

```sh
bun install
cp .env.example .env
```

Edit `.env` and set `EDGAR_USER_AGENT` to your own name and email, e.g.
`EDGAR_USER_AGENT="Jane Doe jane@example.com"`. SEC requires every client to identify itself and
returns 403 to requests without this header. The repository can't ship a working value because it
has to identify you. The server refuses to start while it's unset.

## Run

```sh
bun dev
```

This starts the API on http://localhost:3000 and the UI on http://localhost:5173. If 5173 is taken,
Vite picks the next free port and prints it; the UI works on any port because Vite proxies API
requests to :3000.

## Test

```sh
bun test
```

Tests run against saved EDGAR responses in `server/test/fixtures/` and never hit the network. They
don't need `.env`.

## API

### `GET /companies/:ticker/filings`

A company's filings, newest first by default. Tickers are case-insensitive, and share classes can be
written with a dot or a dash (`BRK.B` or `BRK-B`).

```sh
curl 'http://localhost:3000/companies/AAPL/filings?form=10-K&limit=3'
```

| Parameter | Default | Description |
|---|---|---|
| `form` | all forms | Exact form type, case-insensitive. `10-K` doesn't match `10-K/A`. |
| `includeAmendments` | `false` | With `form`, also match its amendments (`10-K/A`). |
| `sort` | `-filingDate` | `filingDate` for oldest first, `-filingDate` for newest first. |
| `limit` | `50` | Page size, 1 to 200. |
| `offset` | `0` | Number of filings to skip. |

Returns `{ company, items, total, limit, offset }`. Each item has a `documentUrl` pointing at the
filing on sec.gov. An unknown ticker returns 404.

### `GET /filings/summary`

Filing counts per form type over the last 12 months, and the date of the latest 10-K, for each
requested company.

```sh
curl 'http://localhost:3000/filings/summary?tickers=AAPL,SPOT,JPM'
```

| Parameter | Default | Description |
|---|---|---|
| `tickers` | required | Comma-separated tickers, at most 10. |

Returns `{ since, results, errors }`. `since` is the first day of the window. Tickers that can't be
resolved or fetched are listed in `errors` while the rest still return. `latest10K` is `null` for
companies that file no 10-K, such as Spotify, which files a 20-F.

Errors from either endpoint have the shape `{ error: { code, message } }`.

Swagger UI: http://localhost:3000/swagger

## Layout

```
server/src/edgar/     EDGAR access: URL building, the HTTP client, normalization, ticker lookup
server/src/service/   Pure functions for filtering, paging and the 12-month summary
server/src/           Routes (index.ts) and the SQLite cache
server/test/          bun tests; fixtures/ holds trimmed EDGAR responses
shared/               Response types used by both server and web
web/src/              React UI: filings view, summary view, API client
prompts/              Log of every prompt given to the AI assistant during the build
```

`PLAN.md` has the implementation plan and what EDGAR actually returned during recon. `NOTES.md` has
the design decisions, known limitations and next steps.
