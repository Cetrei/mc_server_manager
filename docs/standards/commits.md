# Estándar de commits (obligatorio, todo el repo)

Se usa [Conventional Commits](https://www.conventionalcommits.org/), verificado por `commitlint` (`commitlint.config.js`, extiende `@commitlint/config-conventional`) vía Git hook (`.husky/commit-msg`, instalado con `bun install`).

* Formato: `<tipo>(<scope opcional>): <descripción corta en imperativo>`.
* Tipos permitidos: `feat`, `fix`, `docs`, `test`, `chore`, `refactor`, `style`, `perf`, `ci`, `build`, `revert`.
* El scope, cuando aplica, es el nombre del paquete/app/spec afectado (ej. `feat(cloudflare-bootstrap): ...`, `docs(spec-09): ...`).
* Un commit = un cambio lógico. No mezclar un `feat` con un `chore` no relacionado en el mismo commit.
* Cada feature/paquete nuevo se desarrolla en su propia rama (`feat/<nombre>`) y se mergea a `main` vía PR — nunca push directo a `main` salvo el commit inicial de bootstrap del repo.

## Instalación del hook

```bash
bun add -d husky @commitlint/cli @commitlint/config-conventional
bunx husky init
echo 'bunx --no -- commitlint --edit "$1"' > .husky/commit-msg
```

## Verificación de tests

`bun run test` (la suite completa, `tests/run.ts`) **no** corre como pre-commit local — durante el armado incremental del repo por ramas, el working directory legítimamente tiene código de una sola feature a la vez, y la suite completa fallaría contra piezas que otras ramas todavía no aportaron. La verificación real corre en CI (`.github/workflows/ci.yml`) contra el estado final de cada PR, donde sí tiene sentido exigir que pase completa antes de mergear a `main`.
