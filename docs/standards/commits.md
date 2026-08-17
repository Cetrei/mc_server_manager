# Estándar de commits (obligatorio, todo el repo)

Se usa [Conventional Commits](https://www.conventionalcommits.org/), verificado por `commitlint` (`commitlint.config.js`, extiende `@commitlint/config-conventional`) vía Git hook (`.husky/commit-msg`, instalado con `bun install`).

* Formato: `<tipo>(<scope opcional>): <descripción corta en imperativo>`.
* Tipos permitidos: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `style`, `perf`, `ci`, `build`, `revert`.
* El scope, cuando aplica, es el nombre del paquete/app/spec afectado (ej. `feat(cloudflare-bootstrap): ...`, `docs(spec-09): ...`).
* Un commit = un cambio lógico. No mezclar un `feat` con un `chore` no relacionado en el mismo commit.
* Qué rama usar para cada commit, cómo nombrarla, y cómo llega a `main` vía PR: ver `docs/standards/branching.md`.

## Cuerpo del commit (opcional, con criterio)

El header (primera línea) es lo obligatorio y lo que valida `commitlint`. El cuerpo es opcional y **no** es el lugar para repetir en prosa lo que el diff ya muestra.

* Sin cuerpo por default. La mayoría de los commits (un paquete, un test, un fix puntual) se explican solos con un buen header.
* Cuerpo solo cuando hay un **por qué** que el diff no puede transmitir por sí solo (una decisión de diseño, un trade-off, una razón para una API que rompe compatibilidad). No para describir qué archivos se tocaron — eso ya lo dice `git show`.
* Si hace falta cuerpo: **bullets cortos, no párrafos**. 2-4 líneas máximo, cada una una idea. Nada de resumenes largos tipo release note dentro de un commit individual — eso ensucia `git log --oneline` y el historial se vuelve difícil de escanear.
* El detalle largo (contexto de diseño, alternativas consideradas, pendientes conocidos) va en la **descripción del PR**, no en el commit — el PR es el lugar pensado para eso y no contamina el log de Git.

## Instalación del hook

```bash
bun add -d husky @commitlint/cli @commitlint/config-conventional
bunx husky init
echo 'bunx --no -- commitlint --edit "$1"' > .husky/commit-msg
```

## Verificación de tests

`bun run test` (la suite completa, `tests/run.ts`) **no** corre como pre-commit local — durante el armado incremental del repo por ramas, el working directory legítimamente tiene código de una sola feature a la vez, y la suite completa fallaría contra piezas que otras ramas todavía no aportaron. La verificación real corre en CI (`.github/workflows/ci.yml`) contra el estado final de cada PR, donde sí tiene sentido exigir que pase completa antes de mergear a `main`.
