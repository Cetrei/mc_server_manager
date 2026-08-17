# Component Spec 02: Rust Local Agent (`local-agent`)
**Type**: Application Service

**Runtime**: Rust 1.80+ (`Axum` + `Tokio` + `sysinfo` + `reqwest` + `bollard`)

**Footprint**: ~8 MB RAM, 0% idle CPU

---

## 1. Responsibilities

* Collect local Arch Linux host telemetry (CPU usage, RAM allocation, Swap, Disk activity, Network I/O).
* Communicate with the local Podman UNIX socket (`/run/user/1000/podman/podman.sock`) to fetch container stats for Quadlets.
* Communicate with Crafty Controller REST API (`http://localhost:8123/api/v2`) to query server states and trigger actions.
* Valida autenticación de forma independiente del Edge Worker (defensa en profundidad) — el Worker no es el único punto de verificación de JWT/token, el Local Agent también valida antes de ejecutar cualquier acción.
* Es la única fuente de verdad de rutas/endpoints del sistema. El Edge Worker actúa como dumb proxy (ver `tech_stack.md` §4) — no redefine ni duplica el contrato de rutas, evitando el desface entre ambos puntos.
* Expose a clean, lightweight REST API for the Cloudflare Tunnel (`cloudflared`).

## 2. Directory Structure

```text
apps/local-agent/
├── Cargo.toml
└── src/
    ├── main.rs
    ├── config.rs
    ├── telemetry/
    │   ├── system.rs       # sysinfo host collector
    │   ├── containers.rs   # Podman socket collector
    │   └── vps.rs          # Recibe métricas del telemetry sidecar del VPS (spec 01 §3) sobre wg0
    ├── crafty/
    │   ├── client.rs       # Crafty v4 API wrapper
    │   └── models.rs       # DTOs
    ├── scheduling/
    │   ├── models.rs       # PendingActionEventPayload, EventResponseRequest (spec 08)
    │   └── scheduler.rs    # Evaluación de policies, disparo de webhooks, snooze/cancel
    └── api/
        ├── router.rs
        ├── public_handlers.rs
        └── admin_handlers.rs

```

## 3. Key Endpoints Implemented

| Method | Path | Target Source | Response Data |
| --- | --- | --- | --- |
| `GET` | `/health` | Self | `{"status": "ok", "uptime_secs": 84200}` |
| `GET` | `/v1/status` | Crafty REST API | Server names, online player lists, status strings |
| `GET` | `/v1/metrics` | `sysinfo` + Podman | Host CPU/RAM %, Container memory/CPU tables |
| `POST` | `/v1/action` | Crafty REST API | Execute start/stop/restart/backup/relocate for target UUID (`relocate` exclusivo de rol `admin`, ver spec 08) |

Ver spec 08 para los endpoints adicionales de `/v1/policies`, `/v1/events/*` y `/v1/listeners`.