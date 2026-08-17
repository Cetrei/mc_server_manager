# System Specification: MC Homelab Orchestrator
**Version**: 1.0.0  
**Target Environment**: Arch Linux (Local Host) + Oracle VPS (Edge L4) + Cloudflare (Edge L7)

---

## 1. Functional Requirements

### 1.1 Public Player Status Interface (`/status`)
1. **Public Availability**: Accessible at `https://panel.cetrei.dev/status` without login.
2. **Server Metadata**: Display current status (`ONLINE`, `OFFLINE`, `STARTING`, `STOPPING`) per server.
3. **Player Info**: Display online player count (e.g., `5/20`), player avatars/usernames, MOTD, and server version.
4. **Connection Strings**: Provide one-click copy buttons for server addresses.
5. **Real-time Latency Indicator**: Display ping indicator from edge worker to local agent.
6. **Zero Admin Actions**: No server control levers, system metrics, or configuration options visible.

### 1.2 Dev & Ops Monitoring Interface (`/dev`)
1. **Secure Access**: Protected by Supabase Auth JWT (roles `admin`/`user`) in Cloudflare Worker.
2. **Host Hardware Metrics**: Live graphs (interval configurable) for total host CPU usage, RAM breakdown (Used, Cached, Free), and disk I/O.
3. **Container Metrics**: Individual CPU/RAM telemetry for `crafty`, `rust-agent`, `cloudflared`, and the active Minecraft instance container.
4. **VPS & Connection Status**: Display connected player sessions, throughput, WireGuard tunnel latency, and VPS host CPU/RAM — ver spec 07 (`VpsConnectionMetrics`) y spec 01 §3 para el mini-componente de telemetría del lado VPS.
5. **Crafty Controller Management**: Trigger power operations (`START`, `STOP`, `RESTART`, `KILL`, `RELOCATE`) and trigger automated world backups.
6. **Log Streamer**: View tail logs from Crafty, Minecraft console, y opcionalmente el resto de contenedores del pod.
7. **Scheduling & Policies**: Ver spec 08 — reglas de apagado programado, auto-apagado por inactividad, y toggle manual `playing_lock`.

---

## 2. Non-Functional Requirements

| Category | Requirement | Target Metric |
| :--- | :--- | :--- |
| **Performance (Local)** | Local Agent memory usage | < 15 MB RAM in idle / < 1% CPU utilization |
| **Performance (Edge)** | API response time at Cloudflare Edge | < 50ms (cached status) / < 250ms (tunnel pass-through) |
| **Cost** | Operational infrastructure cost | $0.00 / month (100% Free Tier Stack) |
| **Security** | Attack surface reduction | 0 inbound open ports on home router; VPS expuesto solo en los puertos estrictamente necesarios (ver spec 01) |
| **Reliability** | Edge graceful degradation | Edge worker serves stale/cached status if host is offline |
| **Scale** | Uso esperado | Máximo ~10 personas concurrentes |
| **Configurabilidad** | Sin valores hardcodeados | Toda constante/delay/puerto/ruta/feature configurable vía Supabase (hot-reload), `.yml` local, o Doppler/`.env` (secretos) — ver `tech_stack.md` §3 para la regla de decisión de qué va en cada nivel |
| **Políticas de uso** | Activación/desactivación y auto-apagado | Ver spec 08 — políticas programables, no hardcodeadas |

---

## 3. Endpoints Contract Overview

### Public Endpoints (`/api/v1/public/*`)
- `GET /api/v1/public/status`: Returns JSON summary of the active Minecraft server (cached, TTL configurable).
- `GET /api/v1/public/ping`: Edge health check endpoint.

### Admin & Discord Bot Endpoints (`/api/v1/admin/*`)
- `GET /api/v1/admin/metrics`: Full hardware & container telemetry stream.
- `POST /api/v1/admin/server/:id/action`: Execute power action (`start`, `stop`, `restart`, `backup`, `relocate`).
- Ver spec 08 para endpoints de policies, eventos y listeners.
