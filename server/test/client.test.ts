import { afterEach, expect, test } from 'bun:test'
import { getCached, setCached } from '../src/cache'
import { EdgarError, getSubmissions } from '../src/edgar/client'
import { submissionsUrl } from '../src/edgar/urls'

// fetch is stubbed, so nothing reaches EDGAR. The cache is the real SQLite file; the CIKs are
// beyond any real one and each test asserts its row is gone.

const realFetch = globalThis.fetch
afterEach(() => {
  globalThis.fetch = realFetch
})

function stubFetch(response: () => Response): { calls: number } {
  const counter = { calls: 0 }
  globalThis.fetch = (async () => {
    counter.calls++
    return response()
  }) as unknown as typeof fetch
  return counter
}

async function rejection(promise: Promise<unknown>): Promise<EdgarError> {
  const error = await promise.then(() => null, (e: unknown) => e)
  expect(error).toBeInstanceOf(EdgarError)
  return error as EdgarError
}

test('a 200 with an HTML body throws with the URL and caches nothing', async () => {
  const cik = 9999999901
  const url = submissionsUrl(cik)
  stubFetch(() => new Response('<html><body>Service unavailable</body></html>', { status: 200 }))

  const error = await rejection(getSubmissions(cik))

  expect(error.url).toBe(url)
  expect(error.message).toContain(url)
  expect(error.message).toContain('<html><body>Service unavailable')
  expect(getCached(url, Infinity)).toBeNull()
})

test('valid JSON in the wrong shape throws with the URL, fresh or already cached, and leaves no row', async () => {
  const cik = 9999999902
  const url = submissionsUrl(cik)
  const wrongShape = JSON.stringify({ filings: { recent: {}, files: [] } })

  const fresh = stubFetch(() => Response.json(JSON.parse(wrongShape)))
  const freshError = await rejection(getSubmissions(cik))
  expect(freshError.url).toBe(url)
  expect(fresh.calls).toBe(1)
  expect(getCached(url, Infinity)).toBeNull()

  // A bad row written before these checks existed is served from cache, rejected and deleted.
  setCached(url, wrongShape)
  const cached = stubFetch(() => Response.json({}))
  const cachedError = await rejection(getSubmissions(cik))
  expect(cachedError.message).toContain(url)
  expect(cached.calls).toBe(0)
  expect(getCached(url, Infinity)).toBeNull()
})
