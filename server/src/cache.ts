import { Database } from 'bun:sqlite'

// TTL cache for raw EDGAR response bodies. SQLite so it survives restarts during development.
const db = new Database(`${import.meta.dir}/../cache.sqlite`)
db.run('CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, body TEXT NOT NULL, fetched_at INTEGER NOT NULL)')

const select = db.query<{ body: string; fetched_at: number }, [string]>(
  'SELECT body, fetched_at FROM cache WHERE key = ?',
)
const upsert = db.query('INSERT OR REPLACE INTO cache (key, body, fetched_at) VALUES (?, ?, ?)')

export function getCached(key: string, maxAgeMs: number): string | null {
  const row = select.get(key)
  return row && Date.now() - row.fetched_at < maxAgeMs ? row.body : null
}

export function setCached(key: string, body: string): void {
  upsert.run(key, body, Date.now())
}
