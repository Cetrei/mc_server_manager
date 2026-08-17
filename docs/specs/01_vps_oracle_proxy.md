# Component Spec 01: Oracle VPS L4 Proxy & WireGuard Segment
**Type**: Infrastructure Segment

> **⏸ PAUSADO (2026-08-16)**: bloqueado por falta de capacidad Always Free en la región `mx-queretaro-1` (single-AD, tanto A1.Flex como E2.1.Micro sin disponibilidad) y CGNAT confirmado en el ISP (sin IP pública real, port forwarding no viable como alternativa). El diseño de este spec sigue vigente — no requiere rediseño, solo esperar disponibilidad o decidir pagar un VPS. Mientras tanto, el punto de entrada público real es **spec 01b (Cloudflare Tunnel)**. Detalle completo de la decisión: registrado en este spec, 2026-08-16 (repo de GitHub aún no inicializado — mover este contexto a un comentario del EPIC correspondiente cuando el repo exista).

**Host**: Oracle Cloud Always Free (Ampere A1.Flex ARM64, 2 vCPU / 12 GB RAM total, Ubuntu 24.04 LTS)

> **Nota de capacidad (2026-08-14)**: Oracle redujo el shape Always Free A1.Flex de 4 vCPU/24GB a 2 vCPU/12GB, efectivo a partir del 18 de agosto de 2026. Todos los cálculos de este spec asumen el límite reducido. Verificar el shape real asignado en la consola antes de dimensionar el mundo que corra localmente en el VPS (ver sección 5).

---

## 1. Responsibilities

* Servir como punto de entrada público IPv4 para conexiones TCP de Minecraft (`*.cetrei.dev`).
* Reenviar el tráfico del puerto público de Minecraft hacia el destino correcto según dónde esté corriendo el mundo activo en cada momento: `localhost` del propio VPS (si el mundo vive ahí) o la IP interna del host local vía WireGuard (si el mundo fue relocalizado al PC local).
* Terminar el túnel WireGuard cifrado que conecta el VPS con el host Arch Linux local.
* Mantener aislado el tráfico de otros servicios que ya viven bajo `*.cetrei.dev` (no-Minecraft) — este componente no debe interferir con ellos.
* Almacenar el mundo Minecraft cuando este reside en el VPS (ver spec 08 para el mecanismo de relocalización local↔VPS).

## 2. Decisión de diseño: sin proxy L7 (Velocity descartado)

Versión anterior de este spec usaba Velocity (proxy L7 Java) para enrutar por hostname virtual entre múltiples backends Minecraft simultáneos. Esa necesidad ya no existe: el sistema corre **un único mundo activo a la vez**, nunca múltiples servers en simultáneo. Consecuencias:

* Un proxy L7 que parsea el protocolo Minecraft para rutear por hostname deja de aportar valor — no hay múltiples backends entre los que elegir por SNI/hostname.
* Se reemplaza por un mecanismo de **DNAT a nivel kernel** (iptables), sin proceso de aplicación corriendo, sin footprint de JVM (~100MB+ ahorrados de entrada).
* El destino del DNAT es un valor dinámico, no estático: apunta a `127.0.0.1:<puerto>` si el mundo corre en el VPS, o a `10.0.0.2:<puerto>` (IP interna del host local sobre `wg0`) si el mundo fue relocalizado.
* La actualización de la regla DNAT la dispara el backend propio (Local Agent o su componente equivalente corriendo en el VPS) cada vez que cambia la ubicación del mundo activo — ver spec 08, acción `relocate`.

## 3. Installed Software & Daemons

* **WireGuard**: módulo de kernel `wg0` escuchando en UDP `51820`.
* **iptables** (reglas DNAT + filtros): reenvío del puerto público de Minecraft hacia el destino dinámico, sin proceso de aplicación intermedio.
* **fail2ban**: monitorea logs de conexión (kernel/iptables logging o logs del propio server Minecraft reenviados) y banea IPs con patrones de conexión sospechosos (scanning, flood de intentos).
* **UFW**: firewall base, permite únicamente TCP `25565` (puerto público Minecraft) y UDP `51820` (WireGuard). Todo lo demás cerrado, incluyendo SSH en el puerto estándar — acceso administrativo solo vía `wg0` o un puerto SSH no estándar, nunca expuesto directo en la IP pública.
* **Telemetry sidecar**: mini-servicio de telemetría del lado VPS que expone métricas de throughput/latencia de la conexión Minecraft y CPU/RAM del propio VPS, empujadas de vuelta al Local Agent por el túnel WireGuard. Incluido en este ciclo (confirmado) — alimenta el schema `VpsConnectionMetrics` de spec 07.

## 4. Configuración de red y seguridad

### Modelo de amenaza

El sistema es privado — un grupo cerrado de amigos conocidos por el owner, no un servicio público. El riesgo real no es "usuarios no autorizados jugando" (ya mitigado por whitelist/forwarding-secret a nivel Minecraft), sino:

1. Scanning masivo de internet buscando puertos Minecraft abiertos (ruido de fondo constante, no dirigido).
2. Conexiones repetidas o flood accidental/intencional contra el puerto público.
3. Oracle idle-reclamation: instancias con percentil-95 de CPU, red y memoria por debajo del 20% durante 7 días consecutivos pueden ser reclamadas (ver sección 5).

### Mitigación en capas

1. **UFW**: solo los puertos estrictamente necesarios abiertos (ver sección 3).
2. **iptables `recent` module**: rate-limiting de nuevas conexiones por IP al puerto público de Minecraft, antes de que lleguen a cualquier proceso de aplicación — primera línea de defensa contra scanning/flood, corre en kernel, costo de recursos insignificante.
3. **fail2ban**: capa reactiva sobre los logs, banea IPs con comportamiento repetido sospechoso.
4. **Whitelist / forwarding-secret a nivel Minecraft**: control de acceso real — solo jugadores en la whitelist del owner pueden efectivamente jugar, todo lo anterior es solo para reducir carga de ruido de internet antes de llegar a esta capa.

No se contempla WAF ni soluciones tipo Cloudflare Spectrum — sobre-ingeniería para el modelo de amenaza de un grupo cerrado.

### WireGuard Server (`/etc/wireguard/wg0.conf`)

```ini
[Interface]
Address = 10.0.0.1/24
ListenPort = 51820
PrivateKey = <VPS_PRIVATE_KEY>
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE

[Peer]
# Local Arch Linux Host
PublicKey = <LOCAL_HOST_PUBLIC_KEY>
AllowedIPs = 10.0.0.2/32
```

> Nota: el rango `10.0.0.0/24` está reservado exclusivamente para las IPs del túnel WireGuard (`10.0.0.1` VPS, `10.0.0.2` host local). La VCN de Oracle Cloud para este proyecto usa subnets separados (`10.0.10.0/24` público, `10.0.11.0/24` privado) dentro del mismo `10.0.0.0/16`, para evitar colisión de rango entre la red de infraestructura de Oracle y la red lógica del túnel.

### DNAT dinámico (reemplaza `forced-hosts` de Velocity)

Plantilla conceptual — el valor de `<DESTINO_ACTUAL>` lo escribe el backend dinámicamente:

```bash
# Ejemplo: mundo activo corriendo en el VPS (localhost)
iptables -t nat -A PREROUTING -p tcp --dport 25565 -j DNAT --to-destination 127.0.0.1:25566

# Ejemplo: mundo activo relocalizado al host local (vía wg0)
iptables -t nat -A PREROUTING -p tcp --dport 25565 -j DNAT --to-destination 10.0.0.2:25565
```

El puerto público (`25565`) es fijo y configurable vía Doppler/`.env` — nunca hardcodeado. El destino (host:puerto interno) es lo único que cambia dinámicamente según ubicación del mundo activo.

## 5. Modelo de mundo único portable (local ⇄ VPS)

* El sistema mantiene **un solo mundo activo**, cuya ubicación (`location: "local" | "vps"`) es controlada como una policy más (ver spec 08, acción `relocate`, exclusiva de rol `admin`).
* El VPS tiene espacio suficiente (200GB free tier block storage) para almacenar el mundo cuando reside ahí.
* Correr el mundo en el VPS 24/7 (para modpacks livianos) tiene un beneficio adicional: genera actividad real de CPU/red/memoria que ayuda a evitar el idle-reclamation de Oracle (sección 4.3), sin necesidad de trucos artificiales de actividad falsa.
* Modpacks pesados (ej. Prominence 2) deben correr en el host local (32GB RAM, mejor rendimiento single-core) — el shape reducido del VPS (2 vCPU/12GB compartido con el resto del stack del VPS) no tiene margen cómodo para modpacks pesados.
* El mecanismo de transferencia (rsync sobre `wg0`, apagado limpio antes de mover) se especifica en spec 08.

> Pendiente de validación directa en consola de Oracle por el owner (no es una decisión de diseño): confirmar el shape real asignado a la instancia y la política de idle-reclamation vigente en la cuenta.
