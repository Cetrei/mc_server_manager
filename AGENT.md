# AGENT.md — MC Homelab Orchestrator

Índice de la documentación del proyecto. Cada entrada resume el propósito del archivo — para el contenido y las decisiones vigentes, abrir el archivo correspondiente. Este archivo es solo índice: ninguna convención ni decisión de diseño vive acá, ver `docs/standards/` y `docs/specs/`.

```text
mc_server_manager/
├── AGENT.md                — este índice
├── package.json             — raíz del monorepo, expone `bun run test` (ver tests/README.md)
├── tests/                   — TODOS los tests del proyecto, agnósticos de qué lenguaje use cada app. Ver tests/README.md para la convención completa.
│   ├── run.ts                    — runner genérico invocado por `bun run test [grupo] [nombre]`
│   ├── _shared/                  — utilidades compartidas entre grupos (mocks reutilizables, etc.)
│   ├── cf-tunnel/                — tests del túnel de Cloudflare (spec 01b): mocks offline (protocol-mock, live-players) + E2E real opcional (remote-e2e, se salta sin MC_TUNNEL_TEST_DOMAIN)
│   ├── config-loader/            — tests de packages/config-loader/: dos niveles de config (.yml + env), fallo explícito sin defaults inventados
│   ├── quadlet-render/           — tests del render de Quadlets (packages/quadlet-render/): resolución de placeholders, fallo ante variables faltantes
│   ├── cloudflare-bootstrap/     — tests del bootstrap de Cloudflare (spec 09): creación desde cero + idempotencia, mock offline
│   ├── doppler-bootstrap/        — tests del bootstrap de Doppler (spec 09): creación desde cero + idempotencia, mock offline
│   └── setup-wizard/             — tests del wizard (spec 09): flujo completo mockeado + config estructural/secretos incompletos
├── docs/
│   ├── system_spec.md       — Requisitos funcionales y no-funcionales del sistema completo (interfaces /status y /dev, contrato de endpoints de alto nivel)
│   ├── tech_stack.md        — Stack tecnológico completo: runtimes, infraestructura, capas de datos, networking, seguridad/auth, estructura del monorepo
│   ├── ARCHITECTURE_CANVAS.pdf — Diagrama visual de arquitectura
│   ├── standards/            — Convenciones obligatorias de todo el repo (testing, comentarios/clean code, config de infra generada, ubicación de documentación, branching)
│   ├── decisions/            — ADRs: decisiones de arquitectura puntuales no cubiertas (todavía) por un spec formal
│   │   └── 0001-single-tunnel-dual-ingress.md — Un túnel de Cloudflare, dos reglas de ingress (TCP minecraft + HTTP api). Ver spec 09 §5 (desactualizado, describe solo el ingress TCP original)
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
│       └── 09_bootstrap_automation.md   — [EN PROGRESO] Bootstrap automatizado de Cloudflare/Doppler/Supabase vía paquetes horizontales TS + wizard interactivo. Ver estado real por paquete en el propio spec §13 (nota: §5 describe el ingress TCP original, ver docs/decisions/0001-single-tunnel-dual-ingress.md para el diseño vigente de dos ingress). Tracking real en GitHub, ver § "Estado de tracking en GitHub" abajo.
├── infra/
│   ├── cloudflare-tunnel/      — (sin contenido propio actualmente; la guía operativa vive en docs/specs/01b_cloudflare_tunnel_interim.md §6)
│   └── quadlets/               — Solo la plantilla `.template` (artefacto de infra versionado). La lógica de render vive en packages/quadlet-render/ (spec 09 §4)
├── packages/                — Paquetes horizontales TS, un paquete por servicio/responsabilidad compartida (tech_stack.md §6, spec 09 §4)
│   ├── config-loader/           — Carga y valida los dos niveles de config no-Supabase (estructural .yml + secretos/env), fallo explícito sin defaults inventados. Fuente única que reemplaza los defaults dispersos que antes vivían en cloudflare-bootstrap/setup-wizard.
│   ├── quadlet-render/          — Lógica de resolución de placeholders + escritura del .container final. Migrado desde infra/quadlets/render.ts
│   ├── cloudflare-bootstrap/    — Crea túnel + dos reglas de ingress (TCP minecraft + HTTP api) + dos DNS records vía API de Cloudflare (docs/decisions/0001-single-tunnel-dual-ingress.md). Implementado, consume config-loader.
│   ├── doppler-bootstrap/       — Crea proyecto/config Doppler + upsert de secrets (spec 09 §6). Implementado.
│   └── supabase-bootstrap/      — [BLOQUEADO] Crea proyecto Supabase vía Management API. Dos decisiones de diseño pendientes antes de implementar (shape de API keys, manejo de ACTIVE_HEALTHY). Ver issue #5.
├── apps/
│   └── setup-wizard/            — Punto de entrada único del bootstrap (spec 09 §8). Orquesta cloudflare-bootstrap -> doppler-bootstrap. No incluye supabase-bootstrap todavía (bloqueado, ver spec 09 §7).
├── scripts/
│   ├── bootstrap-cloudflare.ts  — Wrapper individual de cloudflare-bootstrap para uso/debugging aislado (spec 09 §9)
│   └── bootstrap-doppler.ts     — Wrapper individual de doppler-bootstrap. scripts/bootstrap-supabase.ts pendiente del desbloqueo de supabase-bootstrap (spec 09 §7).
├── .env.example — Variables de config estructural no sensible (dominio, puertos). Los secretos NO van aquí, ver tech_stack.md §3
└── _deprecated/ — Artefactos descartados por desviarse del spec vigente, conservados como referencia histórica, no versionados como parte activa del sistema
```

## Estado del entorno de desarrollo

`bun install && bun run test` corre en verde (11/11) contra el estado actual del repo, incluyendo `packages/config-loader`, el ingress dual de `cloudflare-bootstrap`, y `tests/cf-tunnel/` (incluye `remote-e2e.test.ts`, que se salta con mensaje claro si falta `MC_TUNNEL_TEST_DOMAIN` — nunca rompe un checkout limpio, ver `docs/standards/testing.md`).

## Estado de tracking en GitHub

**El repo `Cetrei/mc_server_manager` existe en GitHub y ya tiene issues reales**, agregados al Project standalone "MC Server Manager — Backlog" (número 3):

* [#4](https://github.com/Cetrei/mc_server_manager/issues/4) — EPIC bootstrap automation (spec 09). Status: In Progress.
* [#5](https://github.com/Cetrei/mc_server_manager/issues/5) — supabase-bootstrap bloqueado (sub-issue de #4). Status: Todo.
* [#6](https://github.com/Cetrei/mc_server_manager/issues/6) — EPIC VPS Oracle (spec 01), pausado. Status: Todo.
* [#7](https://github.com/Cetrei/mc_server_manager/issues/7) — Cloudflare Tunnel interino (spec 01b) sin contenido en disco, incluye 06 (Quadlets/systemd). Status: Todo.

**Pendiente manual**: el Project no expone vía API/MCP la acción de "enlazar repositorio" (Project Settings -> Manage access / linked repositories) — agregar el repo ahí a mano para que aparezca en el selector de repos del Project. Los items ya están cargados y trackeables sin ese paso.

Varios specs (`01_vps_oracle_proxy.md`, `01b_cloudflare_tunnel_interim.md`, `09_bootstrap_automation.md`) tenían referencias a números de issue fabricados por una sesión anterior (no correspondían a estos issues reales). Pendiente: reemplazar las referencias "ver spec X §Y" añadidas en la limpieza anterior por links reales a #4–#7 donde corresponda.

## Limpieza pendiente (manual, fuera del alcance de las herramientas MCP disponibles)

* `_deprecated/tests-quadlets/` quedó como directorio vacío tras mover `tests/quadlets/` (huérfano) — el filesystem MCP no tiene `delete_directory`. Es inofensivo (fuera de `tests/`, `run.ts` no lo recorre) pero se puede borrar a mano: `rmdir _deprecated/tests-quadlets`.

## Convenciones del repo

Todas las convenciones obligatorias (testing, comentarios/clean code, configuración de infraestructura generada, ubicación de documentación) viven en `docs/standards/` — no en este archivo. Ver:

* `docs/standards/testing.md`
* `docs/standards/code-comments.md`
* `docs/standards/infra-config.md`
* `docs/standards/docs-location.md`
* `docs/standards/commits.md`
* `docs/standards/branching.md`
