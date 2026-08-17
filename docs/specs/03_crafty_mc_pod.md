# Component Spec 03: Crafty Controller & Minecraft Podman Pod
**Type**: Containerized Workload

**Engine**: Podman Pod (`mc-stack.pod`)

**Deployment**: Quadlets in Arch Linux (`/etc/containers/systemd/`)

---

## 1. Architecture Overview

All Minecraft-related services run within a single isolated Podman Pod (`mc-stack`). This allows Crafty, the Rust Agent, and Minecraft server instances to communicate over `localhost` on a dedicated internal network namespace while isolating them from the main host OS.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ Podman Pod: mc-stack.pod                                                 │
│                                                                          │
│  ┌──────────────────────┐   localhost:8123   ┌────────────────────────┐  │
│  │ crafty.container     │◄───────────────────┤ local-agent.container  │  │
│  │ (Crafty 4 GUI/API)   │                    │ (Rust Axum Service)    │  │
│  └──────────┬───────────┘                    └───────────▲────────────┘  │
│             │ Podman Socket                              │               │
│             ▼                                            │               │
│  ┌──────────────────────┐                     ┌──────────┴─────────────┐ │
│  │ mc-instance-1        │                     │ cloudflared.container  │ │
│  │ (Paper/Forge 1.20+)  │                     │ (Cloudflare Tunnel)    │ │
│  └──────────────────────┘                     └────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘

```

> Decisión de diseño: Traefik descartado. Con 3-4 contenedores fijos dentro de un mismo pod (sin subdominios dinámicos por servidor, ver spec 01 §2), un reverse proxy interno agrega complejidad sin beneficio — el routing directo `localhost` dentro del namespace compartido del pod ya es lo más simple y eficiente posible.

## 2. Quadlet Definition Files

### `mc-stack.pod`

```ini
[Pod]
PodName=mc-stack
PublishPort=10.0.0.2:25565:25565
PublishPort=10.0.0.2:25566:25566
PublishPort=127.0.0.1:9090:9090

[Install]
WantedBy=default.target

```

Todos los valores de esta sección (puertos publicados, límites de memoria/CPU por contenedor) son configurables vía Doppler/`.env` según la regla de 3 niveles definida en `tech_stack.md` §3 — nunca hardcodeados en el Quadlet directamente en producción.

### `crafty.container`

```ini
[Unit]
Description=Crafty Controller v4 Service
After=network-online.target

[Container]
Pod=mc-stack.pod
Image=docker.io/arcadiaware/crafty-4:latest
ContainerName=crafty
Volume=/home/mcuser/crafty/data:/crafty/crafty_data
Volume=/home/mcuser/crafty/servers:/crafty/crafty_web/hosted
Environment=TZ=America/Mexico_City

[Install]
WantedBy=default.target

```