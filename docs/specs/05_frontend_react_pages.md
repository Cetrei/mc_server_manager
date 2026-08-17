# Component Spec 05: React Frontend on Cloudflare Pages (`web-dashboard`)
**Type**: Frontend Application

**Stack**: React 18 + Vite + TailwindCSS + Lucide Icons + Recharts

**Hosting**: Cloudflare Pages (`https://panel.cetrei.dev`)

---

## 1. Dual Interface Architecture

The web frontend is divided cleanly into two separate user experiences:

```text
panel.cetrei.dev
├── /status  (Public Player View)  --> Clean, mobile-first, no auth required
└── /dev     (Dev/Ops Dashboard)   --> Password/Token protected, telemetry graphs

```

Autenticación para `/dev` vía Supabase Auth (JWT, roles `admin`/`user` en `app_metadata`) — ver `tech_stack.md` §5 para el flujo completo de invitación y el detalle de permisos por rol.

---

## 2. Interface 1: Public Player View (`/status`)

Designed for gaming friends and community players. Fast loading, clean aesthetics, zero complexity.

* **Hero Banner**: Live status indicator (Glow effect Green = Online, Amber = Starting, Red = Offline).
* **Server Cards Grid**:
* Server Name & Description (`Survival SMP`, `Creative Plotworld`).
* Connection Address with 1-click copy: `survival.cetrei.dev`.
* Player Count Badge (e.g. `12 / 30 Players`).
* Active Player Avatars (rendered via Minecraft skin head API `https://mc-heads.net/avatar/{username}`).
* Dynamic Ping / Latency Badge.



---

## 3. Interface 2: Dev & Ops Monitoring Dashboard (`/dev`)

Designed for admin control, resource monitoring, and maintenance.

* **System Health Header**: Real-time CPU, RAM, Swap, and Disk gauges.
* **Resource Time-series Graphs (Recharts)**:
* 1-minute historical CPU & RAM trend line graph (updated every 2s, configurable).
* Panel de conexión/VPS: ping WireGuard, throughput, sesiones de jugadores conectadas, y CPU/RAM del propio VPS — consume el schema `VpsConnectionMetrics` (spec 07), alimentado por el telemetry sidecar del VPS (spec 01 §3).
* Individual Podman container resource distribution breakdown.

Todos los valores de intervalo/threshold mostrados en esta interfaz siguen la regla de 3 niveles de configuración (`tech_stack.md` §3) — los que aplican hot-reload lo hacen vía Supabase Realtime, sin necesidad de recargar la página ni reiniciar ningún servicio.


* **Crafty Instance Power Controls**:
* Action buttons (`Start`, `Graceful Stop`, `Restart`, `Force Kill`, `Backup`, `Relocate` — este último visible solo para rol `admin`, ver spec 08 §6).
* Confirmation modals for destructive actions.
* **Scheduling & Policies panel** (ver spec 08): alta/edición/borrado de reglas programadas (fecha fija, delay relativo, recurrente diario, auto-apagado por inactividad), listadas como tarjetas tipo "alarma" editable.
* **Toggle manual "Estoy jugando" (`playing_lock`)**: switch simple en `/dev`. Es independiente de la política de auto-apagado por inactividad (esta última sigue evaluándose igual, activar el toggle no la pausa). Si al activarlo el sistema detecta que ya hay un server corriendo, mostrar debajo del switch un aviso con link directo al panel de control de ese server para apagarlo manualmente en un clic.


* **Console Log Viewer**: Embedded terminal box streaming tail logs from Crafty / Minecraft instance, y opcionalmente del resto de contenedores del pod (`local-agent`, `cloudflared`) mediante selector de fuente.