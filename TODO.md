# TODO — Secuencia de implementación

Este archivo define el **orden real de dependencia** para llevar el sistema de "bootstrap de infraestructura funcionando" (estado actual) a "sistema completo funcionando". No es un backlog plano — es una secuencia: cada fase asume que la anterior está completa y verificada con su propio test end-to-end antes de arrancar la siguiente.

Convención por fase: **componente completo → test E2E propio → siguiente fase**. No se avanza de fase sin que el E2E de la fase actual pase contra infraestructura real (no solo mocks) al menos una vez, igual que se hizo con `tests/cf-tunnel/remote-e2e.test.ts` para el bootstrap.

El tracking operativo (issues, status) vive en GitHub — ver `AGENT.md` § "Estado de tracking en GitHub". Este archivo es el mapa de secuencia, no reemplaza los issues.

---

## Fase 0 — Bootstrap de infraestructura ✅ COMPLETA

**Qué es**: Cloudflare Tunnel (dos ingress) + Doppler, automatizados vía `apps/setup-wizard`.

**Componentes**: `packages/config-loader`, `packages/cloudflare-bootstrap`, `packages/doppler-bootstrap`, `packages/quadlet-render`, `apps/setup-wizard`.

**Test E2E**: `tests/cf-tunnel/remote-e2e.test.ts` — pendiente de correr contra el túnel real al menos una vez (requiere `MC_TUNNEL_TEST_DOMAIN`, ver `.env.example`).

**Bloqueado**: `packages/supabase-bootstrap` (issue #5) — no bloquea las fases siguientes, se retoma en paralelo cuando se resuelvan sus dos decisiones de diseño.

---

## Fase 1 — `packages/api-contracts` (spec 07)

**Por qué va primero**: es el contrato de datos (`StatusResponse`, `ServerInstance`, `ServerState`, etc.) que consumen tanto el Local Agent (Rust) como el Worker y el frontend (TypeScript). Implementarlo antes evita que Local Agent, Worker y frontend inventen shapes distintos y haya que reconciliarlos después.

**Componentes**:
- `packages/api-contracts/src/*.ts` — definiciones TypeScript (`status.ts`, y lo que agregue spec 08 para scheduling).
- Definiciones Rust equivalentes (`serde`-serializables) — spec 07 las ubica en `apps/local-agent/src/crafty/models.rs`, así que el struct Rust en sí se escribe en Fase 2, pero el contrato/spec que ambos lados deben cumplir se congela acá.

**Test E2E**: no aplica un E2E de red — el "E2E" de este paquete es un test de round-trip de serialización: un payload de ejemplo serializado en TypeScript debe deserializar correctamente en Rust (mismo JSON, mismos campos, mismos nombres) y viceversa. Vive en `tests/api-contracts/`.

**Depende de**: nada (Fase 0 no es dependencia técnica, solo orden de trabajo).

---

## Fase 2 — `apps/local-agent` (spec 02)

**Por qué va acá**: es el corazón del sistema. El ingress HTTP (`apiHostname`/`apiLocalPort: 8091`) que ya configuró `cloudflare-bootstrap` en Fase 0 apunta a este componente — hasta que exista, ese ingress apunta a nada. Todo lo demás (Worker, frontend) es un cliente de este servicio.

**Componentes** (ver spec 02 §2 para el árbol completo):
- `apps/local-agent/src/main.rs`, `config.rs`
- `telemetry/system.rs` (sysinfo), `telemetry/containers.rs` (Podman socket) — `telemetry/vps.rs` puede esperar a que spec 01 se retome (issue #6, pausado)
- `crafty/client.rs`, `crafty/models.rs` (usa los contratos de Fase 1)
- `api/router.rs`, `public_handlers.rs`, `admin_handlers.rs`
- Validación de auth independiente del Worker (defensa en profundidad, spec 02 §1)

**Test E2E**: levantar el binario real (no mock) escuchando en `apiLocalPort`, y golpear `/v1/status` con un cliente HTTP real verificando que el shape coincide con `packages/api-contracts`. Vive en `tests/local-agent/`, sigue el mismo patrón de "mock offline siempre corre + E2E real opcional que se salta sin el binario compilado" que `tests/cf-tunnel/`.

**Depende de**: Fase 1 (contratos), Crafty corriendo (Fase 3) para el E2E completo del proxy hacia Crafty — el E2E de `/v1/status` puede empezar a validarse antes de que Crafty exista si se mockea esa pata específica, pero el E2E *completo* de esta fase no cierra hasta tener Fase 3 arriba.

---

## Fase 3 — Pod de Podman: Crafty + Minecraft (spec 03)

**Por qué va acá**: Local Agent (Fase 2) necesita algo real del otro lado de `localhost:8123` para dejar de mockear esa integración. Este es el "sistema corriendo de verdad" del homelab.

**Componentes**:
- `mc-stack.pod` — definición del pod (quadlet)
- `crafty.container` — quadlet de Crafty Controller
- Quadlet(s) de instancia(s) de Minecraft (`mc-instance-1`, Paper/Forge)
- `cloudflared.container` ya existe (`infra/quadlets/cloudflared.container.template`, Fase 0) — este es el punto donde efectivamente se integra al mismo pod/namespace de red.
- `docs/specs/06_daemons_quadlets_systemd.md` — falta en disco (issue #7), se escribe como parte de esta fase en vez de antes, porque documentar comandos systemd sin el pod real sería inventar contenido.

**Test E2E**: con el pod levantado localmente, correr `tests/cf-tunnel/protocol-mock.test.ts`-style pero contra el Minecraft real (no el mock server) — o extender `remote-e2e.test.ts` para que, si detecta el pod arriba, valide un Server List Ping real contra `mc-instance-1` en vez de solo el eco del mock. A definir el detalle exacto al llegar a esta fase.

**Depende de**: Fase 2 (Local Agent necesita existir para exponer el pod hacia afuera vía el túnel de Fase 0).

---

## Fase 4 — Cloudflare Edge Worker (spec 04)

**Por qué va acá**: es un *dumb proxy* (spec 04 §2) — no tiene razón de existir hasta que Local Agent (Fase 2) expone `/v1/status` y compañía de verdad. Antes de eso no hay nada que proxyear.

**Componentes**:
- `apps/edge-worker/` (Hono.js sobre Cloudflare Workers)
- Rate limiting (60 req/min público, ~10 req/min en endpoints de acción)
- Validación JWT de Supabase + token de bot de larga duración (spec 04 §1, `tech_stack.md` §5)
- Cache stale-while-revalidate (5s TTL) para status público

**Test E2E**: request real HTTP contra el Worker desplegado (Wrangler), verificando que reenvía correctamente al Local Agent a través del túnel de Fase 0 y que el rate limiting/auth rechazan lo que deben rechazar.

**Depende de**: Fase 2 (Local Agent), Fase 0 (el túnel HTTP que el Worker usa como `CF_TUNNEL_URL`), Supabase Auth configurado (`packages/supabase-bootstrap`, issue #5 — este es el punto donde ese bloqueo empieza a importar de verdad).

---

## Fase 5 — Frontend React (spec 05)

**Por qué va al final**: consume el Worker (Fase 4). No tiene sentido construir UI contra una API que todavía no expone datos reales.

**Componentes**:
- `/status` — vista pública, sin auth
- `/dev` — dashboard autenticado (Supabase Auth), telemetría, controles, scheduling, logs

**Test E2E**: prueba de UI (Playwright o similar, a decidir al llegar acá) contra el Worker real, verificando que `/status` muestra datos reales del pod de Fase 3 y que `/dev` respeta el gate de auth.

**Depende de**: Fase 4 (Worker), Fase 1 (contratos, para tipar las respuestas en el cliente).

---

## Fase 6 — Scheduling & Events (spec 08)

**Por qué va al final**: es lógica que vive *dentro* de Local Agent + Supabase (no es una capa nueva de infraestructura), y depende de que exista un flujo de acción real (encender/apagar) que las policies puedan disparar — eso solo existe una vez que Fases 2–3 están completas y, para la UI de administración de policies, Fase 5.

**Componentes**:
- Tabla `scheduled_policies` en Supabase (spec 08 §2)
- `apps/local-agent/src/scheduling/models.rs`, `scheduler.rs`
- Webhooks de aviso + cancelar/snooze
- UI de administración en `/dev` (parte de Fase 5, o una iteración posterior de la misma)

**Test E2E**: crear una policy con delay corto, verificar que dispara el webhook de aviso, verificar que un snooze la pospone correctamente, verificar que la acción final (apagado) ocurre si no se cancela.

**Depende de**: Fase 2, 3, 5 (parcialmente), Supabase (issue #5).

---

## Fuera de secuencia (retomar cuando se desbloqueen)

* **Spec 01 — VPS Oracle** (issue #6): pausado por falta de capacidad/CGNAT. Si se retoma, se inserta como una fase paralela que no reemplaza el túnel de Cloudflare (Fase 0) sino que lo complementa para el modelo de mundo portable (`ServerLocation: 'vps'` en los contratos de Fase 1).
* **`docs/specs/01b_cloudflare_tunnel_interim.md`** (issue #7): se escribe formalmente durante o después de Fase 3, una vez que la guía operativa completa (incluyendo el pod real) tiene contenido real que documentar en vez de ser prospectiva.
