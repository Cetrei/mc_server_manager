# AGENT.md — MC Homelab Orchestrator

Índice de la documentación del proyecto. Cada entrada resume el propósito del archivo — para el contenido y las decisiones vigentes, abrir el archivo correspondiente. Este archivo es solo índice: ninguna convención ni decisión de diseño vive acá, ver `docs/standards/` y `docs/specs/`.

```text
mc_server_manager/
├── AGENT.md                — este índice
├── package.json             — raíz del monorepo, expone `bun run test` (ver tests/README.md)
├── tests/                   — TODOS los tests del proyecto, agnósticos de qué lenguaje use cada app. Ver tests/README.md para la convención completa.
│   ├── run.ts                    — runner genérico invocado por `bun run test [grupo] [nombre]`
│   ├── _shared/                  — utilidades compartidas entre grupos (mocks reutilizables, etc.)
│   ├── cf-tunnel/                — tests del túnel de Cloudflare (spec 01b): mocks offline + E2E real opcional
│   ├── quadlet-render/           — tests del render de Quadlets (packages/quadlet-render/): resolución de placeholders, fallo ante variables faltantes
│   ├── cloudflare-bootstrap/     — tests del bootstrap de Cloudflare (spec 09): creación desde cero + idempotencia, mock offline
│   ├── doppler-bootstrap/        — tests del bootstrap de Doppler (spec 09): creación desde cero + idempotencia, mock offline
│   └── setup-wizard/             — tests del wizard (spec 09): flujo completo mockeado + detección de .env incompleto
├── docs/
│   ├── system_spec.md       — Requisitos funcionales y no-funcionales del sistema completo (interfaces /status y /dev, contrato de endpoints de alto nivel)
│   ├── tech_stack.md        — Stack tecnológico completo: runtimes, infraestructura, capas de datos, networking, seguridad/auth, estructura del monorepo
│   ├── ARCHITECTURE_CANVAS.pdf — Diagrama visual de arquitectura
│   ├── standards/            — Convenciones obligatorias de todo el repo (testing, comentarios/clean code, config de infra generada, ubicación de documentación)
│   └── specs/
│       ├── 01_vps_oracle_proxy.md       — [PAUSADO] VPS Oracle: DNAT dinámico, WireGuard, modelo de amenaza y seguridad de red, modelo de mundo único portable (local/VPS). Bloqueado por falta de capacidad en mx-queretaro-1 + CGNAT del ISP. Diseño vigente, retomar cuando haya capacidad o se pague un VPS.
│       ├── 01b_cloudflare_tunnel_interim.md — [ACTIVO] Arquitectura interina de exposición pública: Cloudflare Tunnel sobre cetrei.dev, mundo siempre en local. Sustituye a 01 mientras esté pausado. Solo cubre Java Edition (TCP), no Bedrock/UDP. Incluye la guía operativa completa (creación del túnel automatizada vía spec 09, con fallback manual documentado).
│       ├── 02_rust_local_agent.md       — Local Agent en Rust: responsabilidades, estructura de directorios, endpoints implementados
│       ├── 03_crafty_mc_pod.md          — Pod de Podman (Crafty + Minecraft + Local Agent + cloudflared): arquitectura del pod, Quadlet definitions
│       ├── 04_cloudflare_edge_worker.md — Worker de Cloudflare: gateway de API, rate limiting, validación de auth, ejemplo de implementación
│       ├── 05_frontend_react_pages.md   — Frontend React: interfaz pública /status e interfaz /dev (telemetría, controles, scheduling, logs)
│       ├── 06_daemons_quadlets_systemd.md — Definiciones Quadlet completas, comandos systemd, objetivo de rendimiento/footprint, manejo operativo diario
│       ├── 07_api_contracts_types.md    — Contratos de datos compartidos (TypeScript + Rust): StatusResponse, MetricsResponse
│       ├── 08_scheduling_events.md      — Sistema de policies programables, ciclo de vida de eventos de aviso (webhooks, cancelar/snooze), acción relocate
│       └── 09_bootstrap_automation.md   — [EN PROGRESO] Bootstrap automatizado de Cloudflare/Doppler/Supabase vía paquetes horizontales TS + wizard interactivo. Ver estado real por paquete en el propio spec §13. Repo de GitHub aún no inicializado — issues reales pendientes de crear cuando exista (ver § "Estado de tracking en GitHub" abajo).
├── infra/
│   ├── cloudflare-tunnel/      — (sin contenido propio actualmente; la guía operativa vive en docs/specs/01b_cloudflare_tunnel_interim.md §6)
│   └── quadlets/               — Solo la plantilla `.template` (artefacto de infra versionado). La lógica de render vive en packages/quadlet-render/ (spec 09 §4)
├── packages/                — Paquetes horizontales TS, un paquete por servicio/responsabilidad compartida (tech_stack.md §6, spec 09 §4)
│   ├── quadlet-render/          — Lógica de resolución de placeholders + escritura del .container final. Migrado desde infra/quadlets/render.ts
│   ├── cloudflare-bootstrap/    — Crea túnel + ingress + DNS record vía API de Cloudflare (spec 09 §5). Implementado.
│   ├── doppler-bootstrap/       — Crea proyecto/config Doppler + upsert de secrets (spec 09 §6). Implementado.
│   └── supabase-bootstrap/      — [BLOQUEADO] Crea proyecto Supabase vía Management API. Dos decisiones de diseño pendientes antes de implementar (shape de API keys, manejo de ACTIVE_HEALTHY).
├── apps/
│   └── setup-wizard/            — Punto de entrada único del bootstrap (spec 09 §8). Orquesta cloudflare-bootstrap -> doppler-bootstrap. No incluye supabase-bootstrap todavía (bloqueado, ver spec 09 §7).
├── scripts/
│   ├── bootstrap-cloudflare.ts  — Wrapper individual de cloudflare-bootstrap para uso/debugging aislado (spec 09 §9)
│   └── bootstrap-doppler.ts     — Wrapper individual de doppler-bootstrap. scripts/bootstrap-supabase.ts pendiente del desbloqueo de supabase-bootstrap (spec 09 §7).
├── .env.example — Variables de config estructural no sensible (dominio, puertos). Los secretos NO van aquí, ver tech_stack.md §3
└── _deprecated/ — Artefactos descartados por desviarse del spec vigente, conservados como referencia histórica, no versionados como parte activa del sistema
```

## Estado del entorno de desarrollo

**`node_modules` no está instalado en este checkout.** Ningún test (nuevo o preexistente) puede correrse hasta hacer `bun install` desde la raíz del repo — incluye la dependencia `@clack/prompts` en `apps/setup-wizard/package.json`. No se ha verificado con `bun run test` que el código de spec 09 compile y pase; se revisó manualmente contra los shapes de API confirmados, pero la verificación real con el runner queda pendiente de que el entorno tenga las dependencias instaladas.

## Estado de tracking en GitHub

**El repo no está inicializado en GitHub todavía** — solo existe el Project standalone "MC Server Manager — Backlog" (sin repo enlazado). Ningún issue real existe aún.

Varios specs (`01_vps_oracle_proxy.md`, `01b_cloudflare_tunnel_interim.md`, `09_bootstrap_automation.md`) tenían referencias a números de issue (`#1`, `#29`, `#30`, `#31`, `#32`) y enlaces `github.com/...` como si ya existieran — eran fabricados por una sesión anterior, no reales. Se corrigieron a referencias internas al spec correspondiente. Pendiente cuando se inicialice el repo:

1. Crear el repo y enlazarlo al Project existente.
2. Crear los issues reales (EPIC de bootstrap automation con sub-issue de supabase-bootstrap bloqueado; EPIC de VPS Oracle pausado; issue de Cloudflare Tunnel interino).
3. Reemplazar las referencias "ver spec X §Y" añadidas en esta limpieza por los links reales a issues donde el spec lo indica.

## Limpieza pendiente (manual, fuera del alcance de las herramientas MCP disponibles)

* `_deprecated/tests-quadlets/` quedó como directorio vacío tras mover `tests/quadlets/` (huérfano) — el filesystem MCP no tiene `delete_directory`. Es inofensivo (fuera de `tests/`, `run.ts` no lo recorre) pero se puede borrar a mano: `rmdir _deprecated/tests-quadlets`.

## Convenciones del repo

Todas las convenciones obligatorias (testing, comentarios/clean code, configuración de infraestructura generada, ubicación de documentación) viven en `docs/standards/` — no en este archivo. Ver:

* `docs/standards/testing.md`
* `docs/standards/code-comments.md`
* `docs/standards/infra-config.md`
* `docs/standards/docs-location.md`
* `docs/standards/commits.md`
