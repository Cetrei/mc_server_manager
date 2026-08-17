# Estándar de configuración en infraestructura generada (Quadlets y similares)

La regla de "nunca hardcodear" (`tech_stack.md` §3, `system_spec.md` — Configurabilidad) aplica también a los artefactos de infraestructura que se generan para producción, no solo al código de aplicación:

* Ningún archivo de infraestructura con valores reales de despliegue (dominios, IDs de túnel, tokens) se versiona. Se versiona una **plantilla** con placeholders más un **script de render** que resuelve esos placeholders leyendo `.env` (config estructural no sensible) y el entorno inyectado por Doppler (secretos) — nunca al revés.
* El script de render falla explícito si falta una variable requerida. Nunca genera un artefacto con un placeholder sin resolver ni con un default inventado para algo que debería venir de config/secretos.
* Ver `docs/specs/01b_cloudflare_tunnel_interim.md` §4 y §6 para el caso concreto del túnel de Cloudflare: qué variable vive en qué nivel, y la guía operativa de render.
