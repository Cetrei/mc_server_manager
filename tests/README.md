# Tests — mc_server_manager

Convención de testing del monorepo. Agnóstica de qué lenguaje/runtime use cada `apps/*` — todo se invoca desde un único entrypoint en TypeScript/Bun.

## Estructura

```text
tests/
├── run.ts              — runner genérico, invocado por `bun run test`
├── _shared/             — utilidades compartidas entre grupos de test (prefijo _ = no es un grupo de test)
│   ├── minecraft-protocol.ts     — encoding/decoding del protocolo Minecraft (VarInt, paquetes)
│   ├── mock-minecraft-server.ts  — mock server reutilizable (Server List Ping)
│   └── mock-minecraft-client.ts  — mock client reutilizable (ping de status)
├── cf-tunnel/            — grupo de tests: túnel de Cloudflare (spec 01b)
│   ├── protocol-mock.test.ts     — mock puro, offline
│   ├── live-players.test.ts      — mock puro, offline, concurrencia
│   ├── remote-e2e.test.ts        — E2E real, requiere túnel + dominio activo (se salta si falta MC_TUNNEL_TEST_DOMAIN)
│   └── _start-live-mock-server.ts — helper: levanta el mock en el puerto de MC_TUNNEL_LOCAL_PORT para el test E2E
├── quadlet-render/       — grupo de tests: render de Quadlets (packages/quadlet-render/)
│   └── render.test.ts            — mock puro, offline: resolución de placeholders y fallo ante variables faltantes
├── cloudflare-bootstrap/ — grupo de tests: bootstrap de Cloudflare (spec 09)
├── doppler-bootstrap/    — grupo de tests: bootstrap de Doppler (spec 09)
├── setup-wizard/         — grupo de tests: wizard de bootstrap (spec 09)
└── <futuro-grupo>/      — un directorio por componente (local-agent, edge-worker, crafty-pod, etc.)
```

## Convención

* **Un grupo de test = un directorio** dentro de `tests/`, nombrado igual que el componente que prueba (idealmente el mismo nombre que su carpeta en `infra/` o `apps/`).
* **Un test = un archivo `*.test.ts`** dentro del grupo. El nombre del archivo (sin `.test.ts`) es el nombre del test para efectos de `bun run test <grupo> <nombre>`.
* Cada test exporta una función `default async` que lanza una excepción si falla (usar el helper `assert` local, no una librería de assertions — mantenerlo simple mientras el proyecto es pequeño).
* Archivos/carpetas con prefijo `_` (ej. `_shared/`, `_start-live-mock-server.ts`) **no son tests** — son utilidades o scripts auxiliares, el runner los ignora.
* **Todo test debe poder correr con datos mock, offline, sin credenciales reales** (ver regla completa en `AGENT.md`, sección "Convención de testing"). Si el componente necesita además una prueba contra el servicio real (como `remote-e2e.test.ts`), ese test se salta con un mensaje claro (no falla) cuando la infraestructura/credenciales no están disponibles — nunca debe romper `bun run test` en un checkout limpio.

## Uso

```bash
bun run test                          # corre todos los grupos
bun run test cf-tunnel                # corre todos los tests del grupo cf-tunnel
bun run test cf-tunnel live-players   # corre solo ese test puntual

# Test E2E real del túnel (usa .env / Doppler, ver .env.example):
MC_TUNNEL_TEST_DOMAIN=$MC_TUNNEL_DOMAIN bun run test cf-tunnel remote-e2e
```

## Agregar un test nuevo

1. Si el grupo no existe, crear `tests/<grupo>/`.
2. Agregar `tests/<grupo>/<nombre>.test.ts` exportando `export default async function run() { ... }`.
3. Si necesita un mock reutilizable entre varios grupos, ponerlo en `tests/_shared/`, no duplicado dentro de cada grupo.
