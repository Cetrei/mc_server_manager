# Estándar de branching (obligatorio, todo el repo)

`main` es la única rama protegida y refleja siempre el estado desplegable/definitivo del repo. Nada se trabaja directamente sobre `main` — todo cambio, sin excepción, vive primero en una rama de vida corta y llega a `main` vía Pull Request.

## Nomenclatura de ramas

`<tipo>/<slug-corto>`, mismo set de tipos que `docs/standards/commits.md` (Conventional Commits), en kebab-case:

* `feat/<slug>` — feature o paquete nuevo. Ej. `feat/config-loader`, `feat/supabase-bootstrap`.
* `fix/<slug>` — corrección de un bug ya en `main`. Nunca se mezcla con un `feat` en la misma rama, aunque el fix haya aparecido mientras se trabajaba una feature — se separa a su propia rama (ver "Fixes descubiertos en el camino" abajo).
* `docs/<slug>` — cambios de documentación pura (specs, ADRs, standards) sin tocar código.
* `refactor/<slug>` — reestructuración sin cambio de comportamiento observable.
* `chore/<slug>` — mantenimiento (deps, config de CI, lockfiles) que no encaja en las anteriores.

El slug describe el cambio, no el issue: `feat/config-loader`, no `feat/issue-4`. Si la rama implementa un issue específico, la referencia va en el PR (`Closes #4`), no en el nombre de la rama.

## Una rama = un cambio lógico

Cada rama contiene el trabajo de **una** unidad de cambio coherente — lo que en `commits.md` es "un commit = un cambio lógico", aplicado un nivel arriba. Una rama puede tener varios commits (`feat` + sus `test` correspondientes suelen ir juntos), pero no mezcla dos features independientes ni un `feat` con un `fix` no relacionado.

Si mientras trabajás `feat/A` notás que hace falta un `fix/B` no relacionado:

1. No lo agregues a la rama de `feat/A`.
2. `git checkout main`, `git pull`, `git checkout -b fix/B`, resolvés y abrís su propio PR.
3. Volvés a `feat/A` y seguís (`git checkout feat/A`), rebaseando contra `main` si `fix/B` ya se mergeó y lo necesitás.

## Flujo estándar

```bash
git checkout main
git pull
git checkout -b feat/<slug>

# ... commits normales, cada uno cumpliendo commits.md ...

git push -u origin feat/<slug>
# abrir PR contra main (gh pr create, o la UI de GitHub)
```

El PR es el punto de revisión: CI (`.github/workflows/ci.yml`) corre `bun run test` contra el estado final de la rama, no localmente por rama (ver `commits.md` § "Verificación de tests" para el porqué). Se mergea solo cuando CI está en verde.

## Después de mergear

* Borrar la rama de feature (local y remoto) una vez mergeado el PR — no acumular ramas viejas ya integradas.
* Si quedó trabajo de seguimiento explícitamente fuera de alcance del PR (ver sección "Pendiente" que suelen llevar los PRs de este repo), abrir o actualizar el issue correspondiente, no dejarlo flotando solo en la descripción del PR ya mergeado.

## Excepción

Ninguna, salvo el commit inicial de bootstrap del repo (ya ocurrido). Ningún otro caso justifica push directo a `main`, incluyendo cambios "chiquitos" de docs o config — esos también son `docs/<slug>` o `chore/<slug>` con su propio PR, aunque sea de aprobación instantánea.
