# Tech Stack Handoff: MC Homelab Orchestrator
**Date**: August 2026 (revisado)
**Status**: Final / Production Architecture
**Domain**: cetrei.dev infrastructure

---

## 1. Runtime & Executables

| Component | Language / Runtime | Framework / Engine | Build Tool / Package Mgr | Version Target | Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Local Agent** | Rust | Axum + Tokio | Cargo | Rust 1.80+ | ~8 MB RAM footprint, zero GC overhead, native `sysinfo` OS metrics |
| **Edge API** | TypeScript | Hono.js | pnpm / Wrangler | Node 20 LTS / Workers V8 | Deployed to Cloudflare Workers ($0 tier). Actúa como dumb proxy — no redefine rutas, solo valida auth y reenvía |
| **Status & Dev Web** | TypeScript / JSX | React 18 + Vite | pnpm | Node 20 LTS | Static export deployed to Cloudflare Pages |
| **VPS Proxy** | — (kernel-level) | iptables DNAT + fail2ban | — | — | Sin proceso de aplicación. Reemplaza al proxy L7 Java (Velocity) descartado — ver spec 01 §2 |
| **Server Manager** | Python / Java | Crafty Controller v4 | Native Docker/Podman image | Latest Stable | Containerized inside Podman Pod |
| **Auth / Identity** | — (servicio gestionado) | Supabase Auth | — | — | JWT-based, `app_metadata.role` para roles `admin`/`user`. Ver §5 |
| **Error Tracking** | — (servicio gestionado) | Sentry | — | — | Free tier. Captura excepciones no manejadas del Rust Agent y del Worker. No reemplaza telemetría de sistema |

---

## 2. Infrastructure & Containerization

| Dimension | Choice | Location | Configuration / Tool |
| :--- | :--- | :--- | :--- |
| **Container Engine** | Podman (Rootless / Systemd integrated) | Local Arch Linux Host | Quadlets (`/etc/containers/systemd/`) |
| **Process Supervisor** | `systemd` | Local Arch Linux Host | Native systemd user/system units via Quadlet |
| **L4 Gaming Tunnel** | WireGuard | Oracle VPS <-> Local Host | Kernel-level WireGuard mesh interface (`wg0`) |
| **L7 Web API Tunnel** | Cloudflare Tunnel (`cloudflared`) | Local Host Container | Outbound-only tunnel to Cloudflare Edge |
| **DNS / CDN / Edge** | Cloudflare Free Tier | Global Edge | Subdomains: `*.cetrei.dev`, Workers, Pages |
| **VPS Compute** | Oracle Cloud Always Free | Ampere A1.Flex ARM64 | 2 vCPU / 12 GB RAM total (shape reducido desde 18-ago-2026), 200GB block storage |

---

## 3. Data Layer & State Management

| Store / Source | Technology | Location | Purpose | Access Pattern |
| :--- | :--- | :--- | :--- | :--- |
| **System Metrics** | Linux `/proc` & Podman Socket | Local Host | CPU, RAM, Disk, Container stats | Polled every 2s (configurable) by Rust Agent |
| **MC Server State** | Crafty v4 REST API / SQLite | Local Host o VPS (según ubicación del mundo activo) | Server start/stop, player lists, configs | HTTP REST via Rust Agent |
| **Edge Token / Cache** | Cloudflare KV / Secrets | Cloudflare Edge | Cache de status público (5s TTL, configurable) | Short-lived cache para status público |
| **Identidad y Roles** | Supabase Auth + Postgres | Supabase (managed) | Cuentas de usuario, roles (`admin`/`user`), invites | JWT validado por Rust Agent / Worker |
| **Config no-frágil / hot-reloadable** | Supabase Postgres (+ Realtime) | Supabase (managed) | Reglas de scheduling, thresholds de auto-shutdown, policy toggles | Rust Agent se suscribe vía Supabase Realtime, aplica en caliente sin restart |
| **Config estructural no apta para Supabase** | Archivo `.yml` local | Local Host | Config que no depende de red externa para arrancar | Leído al inicio; hot-reload vía file-watcher donde aplique |
| **Secretos / config frágil** | Doppler + `.env` / secrets de Cloudflare / GitHub Actions | Según contexto de despliegue | Credenciales, tokens, URLs de infraestructura — cualquier cosa que si se corrompe rompe el arranque | Requiere restart explícito, nunca hot-reload |

### Regla de decisión: dónde vive cada config

1. **¿Es un valor que puede cambiar en caliente sin requerir rebind de sockets, reinicio de proceso, ni re-autenticación?** → Supabase (hot-reload real vía Realtime).
2. **¿Es estructural, local al host, pero no sensible?** → `.yml` local.
3. **¿Es un secreto o algo que rompe el arranque si cambia mal?** → Doppler / `.env` / secrets de plataforma. Restart explícito, nunca hot-reload automático.

Ningún valor de código (puertos, delays, duraciones, rutas, thresholds, intervalos, feature flags, config de render de frontend) debe quedar hardcodeado — todo pasa por alguno de los tres niveles anteriores.

---

## 4. Networking & Routing Topography

| Protocol Layer | Endpoint Path | Source -> Destination | Mechanism |
| :--- | :--- | :--- | :--- |
| **L4 (Minecraft TCP)** | `<mundo-activo>.cetrei.dev:25565` | Players -> Oracle VPS -> iptables DNAT -> (localhost VPS \| WireGuard -> Local Host) | DNAT dinámico según ubicación del mundo activo — ver spec 01 |
| **L7 Public Web** | `panel.cetrei.dev/status` | Browser -> Cloudflare Edge -> Cloudflare Pages Asset | Static React UI + Recharts, sin autenticación |
| **L7 Dev / Admin Web**| `panel.cetrei.dev/dev` | Browser -> Cloudflare Worker -> Supabase Auth JWT check -> Cloudflare Pages | Protected Admin/User Dashboard según rol |
| **L7 API Gateway** | `panel.cetrei.dev/api/v1/*`| Client / Discord Bot -> Cloudflare Worker -> `cloudflared` -> Rust Agent | Worker es dumb proxy: valida JWT/token, reenvía sin reimplementar rutas. Único origen de verdad de rutas es el Rust Agent |

---

## 5. Security & Authentication

| Domain | Mechanism | Implementation Details |
| :--- | :--- | :--- |
| **Público, no sensible** (`/status`, `/api/v1/public/*`) | Sin login | Rate limiting en el Worker (60 req/min por IP, configurable) |
| **Usuarios humanos** (`/dev`, acciones) | Supabase Auth JWT | `app_metadata.role: "admin" \| "user"`. Sin self-signup público — altas solo vía link de invitación (ver flujo abajo) |
| **Bot / integraciones no-humanas** | Token de larga duración | Generado únicamente por cuenta `admin` desde `/dev`, guardado en Doppler, validado por el Worker. No es JWT de Supabase — no es una sesión humana |
| **Acciones destructivas** (`start`/`stop`/`relocate`) | Rate limiting más estricto | ~10 req/min por token en el Worker (configurable), más estricto que el de status público |
| **Local Agent Boundary** | Loopback / Internal Podman Network | Sin exposición directa fuera del pod/túnel |
| **Zero Open Ports (router doméstico)** | Cloudflare Tunnel + WireGuard | Router sin puertos inbound expuestos a IPv4 pública |
| **VPS público** | UFW + iptables `recent` + fail2ban | Ver spec 01 §4 para el modelo de amenaza y mitigación en capas |

### Flujo de invitación (sin self-signup abierto)

1. Cuenta `admin` genera un registro en tabla `invites` de Supabase (`token`, `expires_at`, `used: false`).
2. Comparte el link `panel.cetrei.dev/invite/{token}` con el amigo a invitar.
3. La página valida el token (existe, no expiró, no usado) antes de mostrar el formulario de alta.
4. Al completar el alta (`supabase.auth.signUp()`), el backend marca el invite como usado y recién ahí asigna `app_metadata.role` — sin ese paso, la cuenta existe pero sin rol, y sin rol no hay acceso a ninguna acción.
5. Rol por defecto para invitados: `user`. Solo `admin` puede promover a otro `admin` manualmente.

### Rol `admin` vs `user`

* `user`: puede ver `/dev` (observabilidad completa: métricas, logs), y ejecutar `start`/`stop` sobre el mundo activo.
* `admin`: todo lo anterior, más `relocate` (mover el mundo entre local/VPS — afecta hardware personal del owner, por eso restringido), gestión de invites, generación de tokens de bot, y edición de reglas de scheduling/policies.

---

## 6. Developer Tooling & Monorepo Structure

```text
mc-server-manager/
├── apps/
│   ├── local-agent/             # Rust (Axum, Tokio, sysinfo, reqwest, bollard)
│   ├── edge-worker/             # TypeScript (Hono, Cloudflare Worker) — dumb proxy
│   └── web-dashboard/           # React + Vite + TailwindCSS + Recharts
├── packages/
│   └── api-contracts/           # Shared TypeScript types & Rust struct definitions (fuente única de contrato)
├── infra/
│   ├── quadlets/                # Arch Linux systemd Quadlets (.pod, .container)
│   └── oracle-vps/              # DNAT/iptables/fail2ban + WireGuard configuration (sin Velocity)
└── scripts/                     # Systemd deploy & management tools
```
