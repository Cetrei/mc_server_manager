# Component Spec 04: Cloudflare Edge Worker (`edge-worker`)
**Type**: Edge API Gateway / Serverless Worker

**Runtime**: Cloudflare Workers (TypeScript + Hono.js)

**Deployment**: Wrangler CLI

---

## 1. Responsibilities

* Serve as the single API entry point under `https://panel.cetrei.dev/api/v1/*`.
* Enforce Rate Limiting on public endpoints (60 requests/min per IP, configurable) y un límite más estricto en endpoints de acción (~10 req/min por token, configurable — ver `tech_stack.md` §5).
* Validar JWT de Supabase (`app_metadata.role`) para requests de usuarios humanos, y validar token de larga duración para el bot/integraciones — ambos mecanismos conviven, ver `tech_stack.md` §5 para el detalle de cuál aplica a qué tipo de cliente. Los tokens de bot solo pueden generarse desde una sesión `admin` autenticada en `/dev`, nunca desde este Worker directamente.
* Pass authenticated requests securely through the Cloudflare Tunnel to the Rust Local Agent.
* Provide stale-while-revalidate caching (5s TTL, configurable) for public server status queries.

## 2. Code Structure & Implementation Highlights

> El Worker es un *dumb proxy*: valida auth y reenvía, pero no redefine ni reimplementa el contrato de rutas de admin — esa es responsabilidad exclusiva del Rust Local Agent (spec 02). Esto evita el desface entre dos listados de endpoints que existía en la versión anterior de este spec.

```typescript
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { cache } from 'hono/cache'

type Bindings = {
  CF_TUNNEL_URL: string
  SUPABASE_JWT_SECRET: string
  BOT_TOKEN: string // token de larga duración, generado desde /dev por un admin, guardado en Doppler
}

const app = new Hono<{ Bindings: Bindings }>()

app.use('*', cors())

// Public status endpoint with edge caching & error fallback
app.get('/api/v1/public/status', async (c) => {
  try {
    const res = await fetch(`${c.env.CF_TUNNEL_URL}/v1/status`, {
      headers: { 'X-Source': 'Cloudflare-Worker' }
    })
    if (!res.ok) throw new Error('Host agent unhealthy')
    const data = await res.json()
    return c.json({ status: 'online', data }, 200, {
      'Cache-Control': 'public, max-age=5, s-maxage=5'
    })
  } catch (err) {
    // Graceful degradation when host is offline
    return c.json({
      status: 'offline',
      message: 'Local server host is currently offline or unreachable.',
      servers: []
    }, 200)
  }
})

// Dumb proxy para cualquier ruta bajo /api/v1/admin/* — no reimplementa el contrato de rutas.
// Valida JWT de Supabase (usuarios humanos) o BOT_TOKEN (integraciones), y reenvía intacto.
app.all('/api/v1/admin/*', async (c) => {
  const authHeader = c.req.header('Authorization')
  const isValidBotToken = authHeader === `Bearer ${c.env.BOT_TOKEN}`
  const isValidUserJwt = authHeader && await verifySupabaseJwt(authHeader, c.env.SUPABASE_JWT_SECRET)

  if (!isValidBotToken && !isValidUserJwt) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  const targetPath = c.req.path.replace('/api/v1', '/v1')
  const res = await fetch(`${c.env.CF_TUNNEL_URL}${targetPath}`, {
    method: c.req.method,
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: c.req.method !== 'GET' ? await c.req.text() : undefined
  })
  return c.json(await res.json(), res.status)
})

export default app

```