import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'

if (!process.env.EDGAR_USER_AGENT) {
  console.error('EDGAR_USER_AGENT is not set. SEC rejects requests without it; copy .env.example to .env.')
  process.exit(1)
}

const app = new Elysia()
  .use(cors({ origin: 'http://localhost:5173' }))
  .get('/health', () => ({ ok: true }))
  .listen(3000)

console.log(`API listening on http://localhost:${app.server?.port}`)
