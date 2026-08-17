# Component Spec 07: Shared API Contracts & DTO Schemas
**Type**: Type Definitions & Data Models
**Languages**: TypeScript & Rust (`serde` serializable)

---

## 1. Unified Status Response Schema (`StatusResponse`)

> Cambio respecto a la versión anterior: `running: boolean` no puede representar estados intermedios (arrancando / deteniéndose). Se reemplaza por un enum `ServerState`. Se agrega `location` para reflejar el modelo de mundo único portable (spec 01, spec 08).

### TypeScript Definition (`packages/api-contracts/src/status.ts`)
```typescript
export type ServerState = 'OFFLINE' | 'STARTING' | 'ONLINE' | 'STOPPING';

export type ServerLocation = 'local' | 'vps';

export interface ServerInstance {
  id: string;
  name: string;
  type: 'paper' | 'forge' | 'fabric' | 'vanilla';
  version: string;
  address: string;
  state: ServerState;
  location: ServerLocation;
  onlinePlayers: number;
  maxPlayers: number;
  playersList: string[];
  motd: string;
  pingMs: number;
}

export interface StatusResponse {
  systemStatus: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  timestamp: string;
  servers: ServerInstance[];
}
```

`STARTING` se determina como el punto intermedio entre el comando de encendido emitido y la confirmación de arranque devuelta por Crafty. `STOPPING` es el equivalente para el comando de apagado. Ambos son transitorios y de corta duración — el consumidor (frontend) debe tratarlos como estados de carga, no como error.

### Rust Struct Definition (`apps/local-agent/src/crafty/models.rs`)
```rust
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ServerState {
    Offline,
    Starting,
    Online,
    Stopping,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ServerLocation {
    Local,
    Vps,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ServerInstance {
    pub id: String,
    pub name: String,
    pub server_type: String,
    pub version: String,
    pub address: String,
    pub state: ServerState,
    pub location: ServerLocation,
    pub online_players: u32,
    pub max_players: u32,
    pub players_list: Vec<String>,
    pub motd: String,
    pub ping_ms: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StatusResponse {
    pub system_status: String,
    pub timestamp: String,
    pub servers: Vec<ServerInstance>,
}
```

---

## 2. Dev Telemetry Metrics Schema (`MetricsResponse`)

> Se agregan campos de telemetría VPS/conexión. Fuente: el telemetry sidecar del lado VPS (spec 01 §3), incluido en este ciclo (confirmado) — empuja datos por el túnel WireGuard hacia el Local Agent. Mientras el sidecar no esté desplegado en un ambiente dado (ej. durante desarrollo temprano), estos campos deben quedar honestamente en `null`/`0` con `vps.available: false`, nunca simulados.

```typescript
export interface ContainerMetric {
  name: string;
  cpuPercent: number;
  memoryMb: number;
  memoryLimitMb: number;
}

export interface VpsConnectionMetrics {
  available: boolean;
  wireguardPingMs: number | null;
  velocityThroughputKbps: number | null; // renombrar si se descarta terminología Velocity
  connectedPlayerSessions: number | null;
  vpsHostCpuPercent: number | null;
  vpsHostMemoryUsedMb: number | null;
  vpsHostMemoryTotalMb: number | null;
}

export interface MetricsResponse {
  hostCpuPercent: number;
  hostMemoryUsedMb: number;
  hostMemoryTotalMb: number;
  hostSwapUsedMb: number;
  containers: ContainerMetric[];
  tunnelConnected: boolean;
  vps: VpsConnectionMetrics;
}
```

Ver spec 01 §3 para el mecanismo de captura del lado VPS.

---

## 3. Esquemas de Scheduling y Eventos

Ver spec 08 (`08_scheduling_events.md`) para los schemas de `ScheduledPolicy`, `PendingActionEvent`, y las acciones `relocate` / `start` / `stop`. Se referencian aquí por completitud de contrato, no se duplican.
