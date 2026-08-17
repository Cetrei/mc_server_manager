# Estándar de ubicación de documentación

Las decisiones de diseño, contexto de arquitectura, guías operativas y cualquier justificación de "por qué se hizo algo así" viven en `docs/` (specs) o en el issue de GitHub correspondiente — nunca como `README.md` sueltos dentro de carpetas de implementación (`infra/*`, `tests/*`, `apps/*`, etc.) ni como comentarios de cabecera en el código.

* Un directorio de implementación puede tener como máximo referencias cortas ("ver spec tal") si hace falta orientar a quien abre la carpeta — nunca contenido sustantivo que duplique o desactualice lo que ya vive en el spec.
* Cuando un componente tiene una guía operativa real (comandos a correr, pasos manuales de configuración), esa guía es una sección dentro del spec correspondiente en `docs/specs/`, no un README aparte — así hay una sola fuente de verdad por componente y no se desincroniza cuando el diseño cambia.
* Excepción: `tests/README.md` documenta la convención *mecánica* del test runner (cómo invocar `bun run test`, estructura de `tests/<grupo>/`) — no decisiones de arquitectura de ningún componente — y por eso vive junto al runner. No es precedente para otros README de implementación.
* `AGENT.md` en la raíz del repo es únicamente un índice de dónde está cada cosa — nunca contiene la convención en sí, solo apunta a `docs/standards/` o al spec correspondiente.
