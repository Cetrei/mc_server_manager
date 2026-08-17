# Estándar de testing (obligatorio, todo componente)

Cada pieza de funcionalidad — aunque dependa de infraestructura externa (Crafty API, Cloudflare, Supabase, Podman socket) — debe tener al menos un test que la ejercite con **datos mock**, sin depender de que el servicio real esté disponible. Objetivo: detectar regresiones de contrato/lógica sin necesidad de un entorno completo desplegado, y sin que un fallo de red externo se confunda con un bug propio.

* Todos los tests del monorepo viven en `tests/` (raíz), agnósticos de en qué lenguaje esté escrita la app que prueban (Rust, TS, infra) — se invocan uniformemente con `bun run test [grupo] [nombre]`. Ver `tests/README.md` para la convención de estructura completa.
* Mock en el borde de la integración externa (ej. mockear la respuesta HTTP de Crafty, no la lógica que la consume).
* El test mock debe poder correr offline / sin credenciales reales, y ser parte del set que corre siempre con `bun run test`.
* La prueba de integración real contra el servicio real es un test aparte dentro del mismo grupo (ej. `remote-e2e.test.ts`), que se salta con un mensaje claro si la infraestructura/credenciales no están disponibles — nunca debe romper `bun run test` en un checkout limpio. Documentar su Definition of Done en el issue correspondiente.
