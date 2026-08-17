# Component Spec 09: Bootstrap Automation del Stack de Configuración
**Type**: Developer Tooling / Infrastructure Automation

**Issue**: EPIC de bootstrap automation. Repo de GitHub aún no inicializado (proyecto trackeado en el Project standalone "MC Server Manager — Backlog"); reemplazar esta línea por el link real al issue cuando el repo exista.

---

## 1. Contexto

Levantar el entorno desde cero requiere operar tres dashboards a mano en un orden específico (Cloudflare → Doppler → Supabase) y recordar qué valor de cada uno alimenta al siguiente paso. Spec 01b §6.1 ya documentaba el flujo manual de Cloudflare como ejemplo. Este spec automatiza ese flujo y lo extiende a Doppler y Supabase, para que levantar el entorno sea `bun run apps/setup-wizard` contra un `.env` con tokens de cuenta, en vez de una guía operativa seguida a mano.

No reemplaza spec 01b §6.1 como documentación (ese sigue siendo el fallback documentado), lo complementa como camino principal.

## 2. Responsibilities

* `packages/cloudflare-bootstrap/` — crea el túnel remotely-managed, su ingress TCP y el CNAME "DNS only" asociado vía API de Cloudflare (reemplaza los pasos manuales de spec 01b §6.1).
* `packages/doppler-bootstrap/` — crea proyecto/config en Doppler y setea los secretos producidos por los demás pasos (ej. el token del túnel).
* `packages/supabase-bootstrap/` — crea el proyecto Supabase vía Management API. No implementa el esquema de auth (tablas, RLS, flujo de invitación de `tech_stack.md` §5) — eso pertenece al issue de implementación de spec 05, que corre contra el proyecto ya creado acá.
* `packages/quadlet-render/` — migración de `infra/quadlets/render.ts`, sin cambio de lógica más que la ruta relativa al template (ver §4).
* `apps/setup-wizard/` — punto de entrada único (`bun run apps/setup-wizard`) que orquesta los paquetes de arriba en orden de dependencia, detecta qué credenciales faltan en `.env`, y reporta progreso.
* `scripts/bootstrap-<servicio>.ts` — wrapper individual por paquete de bootstrap, para uso o debugging aislado sin pasar por el wizard completo.

## 3. Alcance y límites

### Dentro de alcance
* Los tres paquetes de bootstrap (Cloudflare, Doppler, Supabase), cada uno con al menos un test mock offline.
* La migración de `quadlet-render` a `packages/`.
* El wizard, corriendo de punta a punta contra credenciales mock, sin tocar red real en los tests.

### Fuera de alcance
* Sentry y Oracle VPS — no se automatizan en este EPIC. Se agregarían como paquetes nuevos bajo el mismo patrón si se automatizan a futuro.
* Esquema de tablas/RLS de Supabase auth y flujo de invitación (`tech_stack.md` §5) — pertenece al issue de implementación de spec 05, que corre contra el proyecto ya creado por `supabase-bootstrap`.
* Rotación o revocación de los tokens de cuenta tras el bootstrap — recomendación operativa documentada en §7, no automatizada.

## 4. Convención de paquetes horizontales

`packages/` ya existía en `tech_stack.md` §6 con `api-contracts/` como ejemplo: un paquete por unidad de responsabilidad compartida, no por capa técnica. Este spec extiende esa misma convención a "un paquete por servicio externo del que el sistema depende para su bootstrap" — no es un concepto nuevo, es la aplicación de uno ya vigente.

Bajo ese principio, `quadlet-render` se mueve de `infra/quadlets/render.ts` a `packages/quadlet-render/`: es lógica de aplicación (resolución de placeholders), no un artefacto de infraestructura como el `.template` con el que trabaja. El `.template` se queda en `infra/quadlets/` (spec 06, `docs/standards/infra-config.md`) porque sí es un artefacto de infra versionado; solo la lógica que lo consume se movió. `quadlet-render` no expone API HTTP externa: es una utilidad invocada por el wizard y, en fallback, directamente por `bun run` (ver spec 01b §6.2).

Cada paquete horizontal:
* Vive en `packages/<servicio>-bootstrap/` (o `packages/quadlet-render/` para el caso ya migrado).
* Expone una función pública `bootstrap<Servicio>(input): Promise<Result>`, sin efectos colaterales de proceso (no lee `process.env` ni escribe a disco directamente salvo `quadlet-render`, que sí escribe el `.container` por ser su responsabilidad única).
* Es idempotente: si el recurso remoto ya existe (mismo nombre/hostname/identificador de negocio), lo reutiliza en vez de duplicarlo. Esto es deliberado — el wizard puede correrse más de una vez sobre un entorno parcialmente configurado sin generar recursos huérfanos en Cloudflare/Doppler/Supabase.
* Tiene al menos un test mock offline en `tests/<servicio>-bootstrap/`, mockeando `fetch` en el borde de la integración externa (`docs/standards/testing.md`).

## 5. `cloudflare-bootstrap`

**Estado: implementado y verificado en disco** (`packages/cloudflare-bootstrap/bootstrap.ts`).

### Input / Output

```typescript
interface BootstrapCloudflareTunnelInput {
  apiToken: string;
  accountId: string;
  zoneId: string;
  tunnelName: string;
  publicHostname: string;
  localPort: number;
}

interface BootstrapCloudflareTunnelResult {
  tunnelId: string;
  tunnelToken: string;
  dnsRecordId: string;
}
```

### Flujo

1. `GET /accounts/{account_id}/cfd_tunnel?name=<tunnelName>` — busca un túnel existente por nombre. Si existe, se reutiliza (idempotencia); si no, se crea.
2. `POST /accounts/{account_id}/cfd_tunnel` con `{name, config_src: "cloudflare"}` — crea el túnel remotely-managed.
3. `GET /accounts/{account_id}/cfd_tunnel/{tunnel_id}/token` — obtiene el token autosuficiente (`result` es un string, no un objeto).
4. `PUT /accounts/{account_id}/cfd_tunnel/{tunnel_id}/configurations` con el ingress: `{hostname, service: "tcp://localhost:<puerto>"}` más una regla catch-all `{service: "http_status:404"}` al final (requerida por la API de Cloudflare). Este paso corre siempre, exista o no el túnel de antes, para que el ingress quede sincronizado con el input actual.
5. `GET /zones/{zone_id}/dns_records?type=CNAME&name=<publicHostname>` — busca un CNAME existente. Si existe, se reutiliza; si no, se crea.
6. `POST /zones/{zone_id}/dns_records` con `{type: "CNAME", name, content: "<tunnel_id>.cfargotunnel.com", proxied: false}` — `proxied: false` es obligatorio (DNS only), el proxy HTTP de Cloudflare no entiende el protocolo Minecraft (ver spec 01b §6.1).

### Tests (`tests/cloudflare-bootstrap/`)

* `create-tunnel.test.ts` — cuenta sin túnel/DNS previos, verifica que se cree todo desde cero con los shapes correctos.
* `idempotent-existing-tunnel.test.ts` — cuenta con túnel y DNS ya existentes (mismo nombre/hostname), verifica que se reutilicen sin llamar a los endpoints de creación (el mock lanza si se intenta crear de nuevo).
* `_mock-cloudflare-api.ts` — mock local de `fetch`, con dos variantes (`installFreshAccountMock`, `installExistingAccountMock`). No vive en `tests/_shared/` porque, a la fecha de este spec, ningún otro grupo de test necesita mockear la API de Cloudflare (YAGNI).

## 6. `doppler-bootstrap`

**Estado: implementado y verificado en disco** (`packages/doppler-bootstrap/bootstrap.ts`).

### Input / Output

```typescript
interface BootstrapDopplerProjectInput {
  apiToken: string;
  projectName: string;
  configName: string;
  secrets: Record<string, string>;
}

interface BootstrapDopplerProjectResult {
  projectSlug: string;
  configName: string;
}
```

### Flujo

1. `GET https://api.doppler.com/v3/projects/project?project=<projectName>` — verifica si el proyecto ya existe (idempotencia).
2. `POST https://api.doppler.com/v3/projects` con `{name: projectName}` — crea el proyecto si no existe.
3. `POST https://api.doppler.com/v3/configs/config/secrets` con `{project, config, secrets: {KEY: "value", ...}}` — setea los secretos recibidos como input (ej. `CLOUDFLARE_TUNNEL_TOKEN` producido por `cloudflare-bootstrap`). Este paso es siempre un upsert: correrlo de nuevo sobre secretos ya seteados los sobrescribe con el mismo valor, sin error.

### Tests (`tests/doppler-bootstrap/`)

Mismo patrón que `cloudflare-bootstrap`: `create-project.test.ts` (proyecto nuevo) e `idempotent-existing-project.test.ts` (proyecto ya existente), con un `_mock-doppler-api.ts` local.

## 7. `supabase-bootstrap`

**Estado: pendiente de implementación. El shape de la respuesta de creación de proyecto (URL, `anon key`, `service_role key`) no está confirmado contra la documentación oficial al momento de escribir este spec — se confirma en el turno de implementación, no se infiere aquí.**

### Input / Output (parcial, sujeto a confirmación del shape de respuesta)

```typescript
interface BootstrapSupabaseProjectInput {
  accessToken: string;
  organizationId: string;
  projectName: string;
  region: string;
  dbPassword: string;
}

interface BootstrapSupabaseProjectResult {
  projectId: string;
  projectUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}
```

### Flujo (alto nivel, confirmar shape exacto en implementación)

1. Verificar si ya existe un proyecto con `projectName` en la organización (idempotencia).
2. `POST https://api.supabase.com/v1/projects` con al menos `{organization_id, name, region, db_pass}`, autenticado con Bearer (Personal Access Token de cuenta).
3. Extraer `projectUrl`, `anonKey`, `serviceRoleKey` de la respuesta — **el shape exacto de estos tres campos debe confirmarse contra la documentación oficial de la Management API antes de implementar**, no asumirse.

### Consumidor

Este paquete solo crea el proyecto. El esquema de auth (tablas, RLS, flujo de invitación) lo implementa el issue de spec 05 cuando exista, contra el proyecto ya creado acá.

## 8. `apps/setup-wizard`

**Estado: implementado y verificado en disco** (`apps/setup-wizard/index.ts`), con una limitación de alcance real: orquesta únicamente `cloudflare-bootstrap → doppler-bootstrap`. `supabase-bootstrap` queda fuera hasta que se resuelvan las dos decisiones de diseño pendientes de §7 (ver EPIC).

Punto de entrada único, invocado como `bun run apps/setup-wizard`. Responsabilidades:

1. Lee `.env` y detecta qué variables de bootstrap faltan (tokens de cuenta: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_ZONE_ID`, `MC_TUNNEL_DOMAIN`, `DOPPLER_API_TOKEN`; `SUPABASE_ACCESS_TOKEN` se agregará cuando `supabase-bootstrap` se incorpore al wizard).
2. Si falta algo, lo reporta con un mensaje claro (qué variable, dónde se obtiene) y no continúa — nunca inventa un default para un secreto.
3. Orquesta los paquetes en orden de dependencia: `cloudflare-bootstrap` primero (produce el token del túnel) → `doppler-bootstrap` (recibe ese token como uno de los secretos a setear). `supabase-bootstrap` se integrará en este mismo orden (independiente de los anteriores) cuando exista.
4. Imprime progreso con `@clack/prompts` (spinners, colores, confirmaciones) — única dependencia nueva que introduce este spec, justificada por ser la librería de prompts interactivos ya estándar en el ecosistema Bun/TS.
5. Al terminar, imprime un resumen de qué se creó y qué se reutilizó (idempotencia visible para el usuario).

### Tests (`tests/setup-wizard/`)

* Un test que corre el wizard completo contra los tres paquetes de bootstrap mockeados, verificando el orden de invocación y que el output final contenga los tres resultados.
* Un test que corre el wizard contra un `.env` incompleto (falta un token), verificando que reporte exactamente qué falta y no invoque ningún paquete de bootstrap.

## 9. `scripts/bootstrap-<servicio>.ts`

**Estado: pendiente de implementación.** Ya previsto en spec 06 §5 como patrón general de `scripts/` (wrappers simples, sin lógica propia).

Cada wrapper (`scripts/bootstrap-cloudflare.ts`, `scripts/bootstrap-doppler.ts`, `scripts/bootstrap-supabase.ts`) lee las variables de entorno necesarias para su paquete correspondiente y llama a su función de bootstrap, sin pasar por el wizard. Uso: correr o debuggear un paso aislado sin repetir los anteriores.

```bash
doppler run --project minecraft_sm -- bun run scripts/bootstrap-cloudflare.ts
```

## 10. ADR: tokens de cuenta con scope amplio en `.env` local

### Decisión

El bootstrap usa tokens de cuenta con scope amplio (`CLOUDFLARE_API_TOKEN`, `DOPPLER_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`) pegados una sola vez en `.env` local, de uso único durante el bootstrap.

### Contexto

Los tokens de API con scope acotado (ej. un token de Cloudflare limitado a "Cloudflare Tunnel: Edit" sobre una zona específica) reducirían el blast radius de una filtración, pero:

* Cada servicio requiere generar y gestionar su propio token acotado, con su propio flujo de creación en cada dashboard — exactamente la fricción operativa que este EPIC busca eliminar.
* El bootstrap es una operación de uso muy poco frecuente (levantar el entorno desde cero, o re-provisionar tras un desastre), no un flujo que corre en producción de forma recurrente.
* El proyecto es un homelab de un solo owner (`tech_stack.md` — "Máximo ~10 personas concurrentes"), no un sistema multi-tenant donde el blast radius de un token de cuenta comprometido afecte a terceros.

### Trade-off aceptado

Un token de cuenta filtrado (ej. por un `.env` commiteado por error) tiene más blast radius que uno acotado por scope. Se mitiga con:

* `.env` en `.gitignore` desde el inicio del repo (ya vigente, no es una medida nueva de este spec).
* Uso único: el token no queda en ningún proceso corriendo de forma persistente, solo se lee durante la ejecución del bootstrap.
* Recomendación operativa (no automatizada, ver §3): revocar o rotar los tokens de cuenta después de un bootstrap exitoso, ya que no se necesitan de nuevo hasta el siguiente re-provisionamiento.

### Alternativa descartada

Tokens acotados por servicio, generados a mano antes de cada bootstrap. Descartada por reintroducir la fricción manual que este EPIC existe para eliminar, con una reducción de riesgo que no se justifica dado el contexto de un solo owner sin terceros expuestos.

## 11. ADR: TypeScript/Bun para paquetes de bootstrap y wizard

### Decisión

Todos los paquetes de bootstrap, sus tests, y el wizard se escriben en TypeScript, corridos con Bun. Ningún script `.sh`.

### Razones

* Consistencia con el resto del monorepo (`tests/`, `apps/edge-worker`, `apps/web-dashboard`, `packages/api-contracts` ya son TS/Bun) — un desarrollador que ya conoce el repo no necesita otro runtime ni otra sintaxis para tocar el bootstrap.
* Portabilidad: `bun run <archivo>.ts` corre igual en cualquier SO con Bun instalado, sin depender de utilidades de shell POSIX que varían entre entornos.
* Tipado compartido: `BootstrapCloudflareTunnelResult` puede consumirse directamente por `doppler-bootstrap` sin serializar/deserializar a través de un formato intermedio.

## 12. Testing

Aplica `docs/standards/testing.md` sin excepción: cada paquete de bootstrap tiene al menos un test mock offline que mockea `fetch` en el borde de la integración externa, corre sin credenciales reales, y es parte del set que corre siempre con `bun run test`. Ningún test de este EPIC depende de red real — a diferencia de `tests/cf-tunnel/remote-e2e.test.ts` (spec 01b), no hay equivalente E2E real para bootstrap: probar contra las cuentas reales de Cloudflare/Doppler/Supabase crearía recursos reales en cada corrida, lo cual no es deseable como parte de un test suite reproducible.

## 13. Criterios de aceptación (EPIC)

- [x] `packages/cloudflare-bootstrap/` existe con dos tests mock offline (creación + idempotencia).
- [x] `quadlet-render` migrado a `packages/`, referencias actualizadas en spec 01b y `AGENT.md`.
- [x] `packages/doppler-bootstrap/` existe con al menos un test mock offline.
- [ ] `packages/supabase-bootstrap/` existe con al menos un test mock offline, con el shape de la Management API confirmado (no asumido) antes de implementar. **Bloqueado**: dos decisiones de diseño sin resolver (shape de API keys, manejo de `ACTIVE_HEALTHY`) — ver §7.
- [x] El wizard corre de punta a punta contra credenciales mock sin tocar red real, y detecta correctamente qué falta cuando corre contra un `.env` incompleto (cubre únicamente cloudflare-bootstrap + doppler-bootstrap; se amplía cuando supabase-bootstrap se desbloquee).
- [x] Spec 01b §6.1 actualizado para marcar el flujo manual como fallback, con el automatizado como camino principal.

**Nota de verificación**: estos tests no se han corrido aún con el runner real (`bun run test`) — `node_modules` no está instalado en este checkout. El estado "[x]" refleja que el código existe y fue revisado manualmente contra los shapes de API/contrato esperado, no una corrida verde confirmada. Correr `bun install && bun run test` antes de dar el EPIC por cerrado.

## 14. Definition of Done

* `bun run test` pasa en un checkout limpio, sin credenciales reales, cubriendo los tres paquetes de bootstrap y el wizard.
* `bun run apps/setup-wizard` corrido una vez contra credenciales reales de un entorno de prueba deja el túnel, el proyecto Doppler y el proyecto Supabase creados y funcionales, sin ningún paso manual adicional en ningún dashboard.
* Correr el wizard una segunda vez contra el mismo entorno no crea recursos duplicados (idempotencia verificada en la práctica, no solo en el mock).
