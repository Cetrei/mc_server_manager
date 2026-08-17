# Component Spec 08: Scheduling, Policies & Event Notifications
**Type**: Application Service (lógica compartida entre Rust Agent y Supabase)

---

## 1. Responsibilities

* Permitir definir, editar y eliminar reglas programadas de encendido/apagado del mundo activo, con la misma flexibilidad que una alarma de teléfono: fecha/hora específica, delay relativo ("en X horas/minutos"), o recurrencia diaria.
* Permitir definir políticas de auto-apagado por inactividad (sin jugadores conectados durante N minutos configurables).
* Permitir políticas de bloqueo manual de uso (toggle "estoy jugando" desde `/dev`, puramente manual, sin detección automática).
* Antes de ejecutar cualquier acción disruptiva programada (apagado), emitir un evento de aviso con anticipación configurable a listeners suscritos (ej. bot de Discord).
* Permitir que un listener cancele o posponga (snooze) la acción antes de que se ejecute.
* Persistir el estado de las reglas de forma que sobreviva reinicios del Rust Agent (fuente de verdad: Supabase).

## 2. Modelo de datos

### Tabla `scheduled_policies` (Supabase Postgres)

| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | uuid | PK |
| `type` | enum | `fixed_datetime` \| `relative_delay` \| `daily_recurring` \| `idle_shutdown` |
| `enabled` | boolean | Permite desactivar sin borrar (equivalente a "apagar la alarma") |
| `trigger_at` | timestamptz, nullable | Usado por `fixed_datetime` |
| `delay_minutes` | integer, nullable | Usado por `relative_delay` |
| `daily_time` | time, nullable | Usado por `daily_recurring` (hora local del servidor) |
| `idle_threshold_minutes` | integer, nullable | Usado por `idle_shutdown` — minutos sin jugadores antes de disparar |
| `warning_lead_minutes` | integer | Anticipación del evento de aviso antes de ejecutar la acción. Configurable, sin default hardcodeado en código |
| `created_by` | uuid | FK a usuario Supabase |
| `created_at` | timestamptz | |

### Tabla `policy_toggles` (Supabase Postgres)

| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `key` | text | PK, ej. `"playing_lock"` |
| `value` | boolean | Toggle manual, editado únicamente desde `/dev` |
| `updated_by` | uuid | |
| `updated_at` | timestamptz | |

### Tabla `pending_action_events` (Supabase Postgres)

Registra el ciclo de vida de un aviso de acción disruptiva en curso (nace cuando se emite el evento de aviso, muere cuando la acción se ejecuta o se cancela).

| Campo | Tipo | Notas |
| :--- | :--- | :--- |
| `id` | uuid | PK |
| `policy_id` | uuid | FK a `scheduled_policies` que originó el evento |
| `action` | enum | `stop` (única acción disruptiva contemplada por ahora) |
| `scheduled_for` | timestamptz | Momento en que se ejecutará si nadie cancela/pospone |
| `status` | enum | `pending` \| `snoozed` \| `cancelled` \| `executed` |
| `snooze_count` | integer | Sin límite superior — snoozes ilimitados, confirmado en discusión de diseño |
| `created_at` | timestamptz | |

## 3. Ciclo de vida de un evento de aviso

1. El scheduler (corriendo dentro del Rust Agent, con reglas leídas/sincronizadas desde Supabase) detecta que una policy está a `warning_lead_minutes` de distancia de su `trigger`.
2. Se crea una fila en `pending_action_events` con `status: pending` y `scheduled_for` = momento real de ejecución.
3. El Rust Agent dispara un **webhook saliente** hacia cada listener registrado (ver §4), con el payload de §5.
4. El listener puede responder antes de `scheduled_for`:
   - **Cancelar**: `status` pasa a `cancelled`. La acción no se ejecuta. La policy original (si es recurrente) sigue vigente para su próximo ciclo.
   - **Posponer (snooze)**: el mismo temporizador original se corre `snooze_minutes` (configurable, no hardcodeado) hacia adelante. `scheduled_for` se actualiza, `status` vuelve a `pending`, `snooze_count` se incrementa. Al llegar el nuevo `scheduled_for`, se vuelve a emitir el mismo aviso (vuelve al paso 3). No hay límite de snoozes.
5. Si nadie responde antes de `scheduled_for`, el Rust Agent ejecuta la acción (`stop`) y marca `status: executed`.

> Nota de diseño confirmada: el snooze NO reevalúa actividad de jugadores desde cero — es un snooze típico, simplemente corre el mismo reloj original hacia adelante y vuelve a preguntar.

## 4. Transporte de eventos (webhooks salientes)

* Los listeners se registran en una tabla `event_listeners` (Supabase): `id`, `webhook_url`, `secret` (para firmar el payload, verificación HMAC del lado del listener), `subscribed_events` (array, ej. `["shutdown_warning"]`), `created_by`.
* Registrar un listener es una acción de `admin` (mismo criterio que generación de tokens de bot — no cualquiera debe poder suscribir un endpoint arbitrario a recibir/reaccionar a estos eventos).
* El Rust Agent hace `POST` al `webhook_url` con el payload firmado. Reintentos ante fallo (status distinto de `2xx` o timeout): **3 intentos, backoff exponencial corto (2s, 8s, 32s)**, configurable vía Supabase (`webhook_retry_count`, `webhook_retry_backoff_seconds` — hot-reloadable, ver `tech_stack.md` §3). Si los 3 intentos fallan, el evento permanece en `pending_action_events` con `status: pending` sin perderse — el owner puede verlo y actuar manualmente desde `/dev` aunque el webhook nunca haya llegado al listener.
* El listener responde a la acción (cancelar/posponer) llamando de vuelta a un endpoint del Rust Agent (`POST /v1/events/:event_id/cancel` o `/snooze`), autenticado con el mismo token de bot que ya posee.
* **Concurrencia entre listeners**: si existe más de un listener suscrito, gana el primero en responder (cancelar o posponer). El endpoint es idempotente por estado — una vez que el evento sale de `pending` (pasa a `cancelled` o vuelve a `pending` tras un snooze), cualquier respuesta posterior de otro listener al mismo `event_id` recibe `409 Conflict` ("evento ya resuelto") en vez de aplicarse silenciosamente. No se define prioridad entre listeners más allá de orden de llegada — es un caso de uso simple (un bot, o el propio owner a mano), no se sobre-diseña para múltiples listeners compitiendo.

## 5. Payload del evento (`PendingActionEvent`)

### TypeScript (`packages/api-contracts/src/events.ts`)
```typescript
export interface PendingActionEventPayload {
  eventId: string;
  action: 'stop';
  scheduledFor: string; // ISO timestamp
  leadMinutes: number;
  snoozeCount: number;
  serverName: string;
  reason: 'scheduled' | 'idle_timeout';
}

export interface EventResponseRequest {
  choice: 'cancel' | 'snooze';
  snoozeMinutes?: number; // requerido si choice === 'snooze'
}
```

### Rust (`apps/local-agent/src/scheduling/models.rs`)
```rust
use serde::{Serialize, Deserialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingActionEventPayload {
    pub event_id: String,
    pub action: String, // "stop"
    pub scheduled_for: String,
    pub lead_minutes: u32,
    pub snooze_count: u32,
    pub server_name: String,
    pub reason: String, // "scheduled" | "idle_timeout"
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventResponseRequest {
    pub choice: String, // "cancel" | "snooze"
    pub snooze_minutes: Option<u32>,
}
```

## 6. Acción `relocate` (mover el mundo local ⇄ VPS)

Aunque no es un evento programado, `relocate` comparte la misma tabla de acciones disponibles vía `/dev` y el mismo modelo de auditoría. Se documenta aquí por ser la tercera acción de policy junto a `start`/`stop`.

* **Exclusiva de rol `admin`** — mover el mundo enciende carga en el hardware personal del owner (si el destino es `local`), decisión que no debe quedar en manos de `user`.
* Modelo **exclusivo** (checkout/checkin): el mundo vive en un solo lugar a la vez, nunca corre en ambos simultáneamente.
* Flujo:
  1. `admin` dispara `POST /v1/action` con `{ action: "relocate", target: "local" | "vps" }`.
  2. El Rust Agent (del lado donde el mundo está corriendo actualmente) ejecuta `stop` limpio vía Crafty y espera confirmación de cierre del proceso — nunca se copia un mundo con el server corriendo, riesgo de corrupción de chunks.
  3. Transferencia vía `rsync` sobre el túnel WireGuard existente (`wg0`), sin infraestructura nueva.
  4. Al completar, se actualiza `location` en el registro del mundo y se dispara la actualización de la regla DNAT del VPS (spec 01 §4) para que el tráfico público apunte al nuevo destino.
  5. Arranque en destino es un paso opcional separado (`start`), no implícito en `relocate`.
* Solo existe **un mundo portable** en el sistema actual (confirmado en discusión) — no se contempla multi-mundo simultáneo. Si el mundo activo no está marcado como portable, `relocate` no aplica (queda fijo en su ubicación).

## 7. Endpoints nuevos (Rust Agent)

| Method | Path | Rol requerido | Descripción |
| --- | --- | --- | --- |
| `GET` | `/v1/policies` | `user` | Lista reglas configuradas |
| `POST` | `/v1/policies` | `admin` | Crea una regla nueva |
| `PATCH` | `/v1/policies/:id` | `admin` | Edita (incluye enable/disable) |
| `DELETE` | `/v1/policies/:id` | `admin` | Elimina una regla |
| `POST` | `/v1/policies/toggle/:key` | `admin` | Cambia un toggle manual (ej. `playing_lock`) |
| `POST` | `/v1/events/:event_id/cancel` | listener autenticado por token | Cancela una acción pendiente |
| `POST` | `/v1/events/:event_id/snooze` | listener autenticado por token | Pospone una acción pendiente |
| `POST` | `/v1/listeners` | `admin` | Registra un nuevo webhook listener |
| `DELETE` | `/v1/listeners/:id` | `admin` | Elimina un listener |
| `POST` | `/v1/action` | `admin` (para `relocate`) / `user` (para `start`,`stop`) | Ejecuta la acción indicada |

## 8. Decisiones confirmadas

**`idle_shutdown` y `playing_lock`**: independientes. Activar el toggle manual "estoy jugando" no pausa ni cancela la evaluación de auto-apagado por inactividad — si el owner quiere evitar el apagado mientras usa ese modo, debe apagar la policy de inactividad como paso aparte. Mejora de UX en frontend (spec 05): si al activar `playing_lock` ya hay un server corriendo, mostrar debajo del switch un aviso con link directo al panel de control de ese server.

**Reintentos de webhook**: 3 intentos, backoff 2s/8s/32s, configurable (ver §4). Sin pérdida de evento si todos fallan — queda pendiente en base para acción manual.

**Listeners concurrentes**: primero en responder gana; respuestas posteriores al mismo evento son rechazadas (`409`). Sin sistema de prioridad — no es necesario para el caso de uso actual (bot propio + owner manual).
