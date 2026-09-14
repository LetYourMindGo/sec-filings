import { cors } from '@elysiajs/cors'
import { Elysia } from 'elysia'

const app = new Elysia()
  .use(cors({ origin: 'http://localhost:5173' }))
  .get('/health', () => ({ ok: true }))
  .listen(3000)

console.log(`API listening on http://localhost:${app.server?.port}`)
