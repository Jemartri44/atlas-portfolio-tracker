# Atlas Portfolio Tracker

Aplicación personal para gestionar una cartera de inversión a 20 años: libro mayor *append-only*, lotes fiscales FIFO, traspasos entre fondos y preparación de los datos de la Renta. **Nunca ejecuta órdenes**: cada operación se hace a mano en la plataforma y se registra aquí.

## Estado

Feature `001-ledger-core` (Fase 1): dominio puro (`@atlas/domain`), adaptadores de fichero y memoria (`@atlas/adapters`) y la CLI `atlas` sobre un `ledger.jsonl` local. Sin API, sin web, sin infraestructura todavía. Detalle en [`specs/001-ledger-core/`](specs/001-ledger-core/).

## Documentación

- [`docs/specification.md`](docs/specification.md) — especificación funcional y técnica. Es la referencia.
- [`docs/business-rules.md`](docs/business-rules.md) — reglas de dominio y mecánica fiscal española.
- [`docs/data-schema.md`](docs/data-schema.md) — formato del libro (`ledger.jsonl`), eventos, proyecciones y FIFO.
- [`docs/adr/`](docs/adr/) — decisiones de arquitectura. [`docs/dependencies.md`](docs/dependencies.md) — presupuesto cerrado de dependencias.
- [`CLAUDE.md`](CLAUDE.md) — contexto y convenciones para el asistente de código.
- [`.specify/memory/constitution.md`](.specify/memory/constitution.md) — constitución del proyecto ([GitHub Spec Kit](https://github.com/github/spec-kit)). Los specs por funcionalidad viven en `specs/`.

El plan de inversión personal (`plan-financiero.md`) es privado y no está en el repositorio.

## Arranque en local

Requisitos: Node 22 (vía [nvm](https://github.com/nvm-sh/nvm)) y npm 10.

```bash
nvm install 22 && nvm use            # lee .nvmrc
npm ci                               # instala el toolchain (sin dependencias en runtime)
npm run lint && npm run typecheck    # Biome + tsc
npm test                             # vitest (dominio al 100 % de cobertura con npm run test:coverage)
npm run build                        # compila a dist/ y copia big.js vendorizada
```

Estructura (ADR-0007): `packages/domain` (núcleo puro, sin imports externos; `vendor/big.js` para el decimal exacto), `packages/adapters` (`FileLedgerStore`, `MemoryLedgerStore`, reloj y aleatoriedad del sistema) y `apps/cli`.

## Uso de la CLI

Tras `npm run build`, el ejecutable es `node apps/cli/dist/main.js` (o `npm run atlas --`). Todos los comandos aceptan `--ledger <ruta>` (por defecto `./ledger.jsonl`), `--yes` (omite la confirmación), `--confirm-duplicate` y `--json`. Ejemplo completo con datos inventados:

```bash
alias atlas='node apps/cli/dist/main.js --ledger ./demo.jsonl'

# Catálogo
atlas account add --id acc_fund --name "Fondos" --platform myinvestor --book core --base-currency EUR --country ES --yes
atlas asset add --id ast_world --type fund --book core --asset-class equity --name "World Index" --currency EUR --transferable --isin XX0000000001 --yes

# Operaciones (importes, cantidades y tipos de cambio siempre como texto decimal; el tipo BCE tal cual se publica)
atlas add cash-in --account acc_fund --value-date 2026-08-31 --amount 5000 --currency EUR --fx-rate 1 --yes
atlas add buy --account acc_fund --asset ast_world --trade-date 2026-09-01 --value-date 2026-09-02 \
  --quantity 10.123456 --amount 1000 --currency EUR --fx-rate 1 --fx-rate-date 2026-09-02 --yes

# Consultas
atlas positions          # posición física por cuenta y activo
atlas lots               # lotes fiscales (FIFO global por activo), con fecha y coste en EUR
atlas cash               # efectivo por cuenta y divisa
atlas gains 2027         # ganancias realizadas del ejercicio (redondeadas una vez por operación)
atlas income 2027        # dividendos e intereses
atlas check              # integridad del libro

# Rectificar (el libro nunca se edita: anulación + evento corregido)
atlas edit <id> --reason "precio mal tecleado" --unit-price 123.45
atlas delete <id> --reason "duplicado"

# Seguimiento de órdenes y traspasos en curso, y exportación
atlas order place --account acc_fund --asset ast_world --side buy --amount 500 --requested-date 2027-07-01 --yes
atlas transfer request --from-account acc_fund --from-asset ast_world --to-account acc_fund --to-asset ast_bonds --quantity-out 4 --requested-date 2027-03-01 --yes
atlas export --format csv --out ledger.csv
```

Códigos de salida: `0` OK · `1` error de validación o de proyección · `2` conflicto de escritura (repite) · `3` huella repetida sin `--confirm-duplicate` · `4` falta confirmación sin terminal (añade `--yes`) · `5` libro escrito por una versión más nueva · `64` uso incorrecto.

## Idioma

Todo lo técnico (código, identificadores, commits, ramas, ficheros, infraestructura) va en **inglés**. Los documentos de `docs/` y los mensajes de la CLI van en **español**, con los identificadores en inglés.

## Flujo de trabajo (git flow)

El repositorio sigue el modelo **git flow** con **git básico, sin la extensión `git-flow`**:

| Rama        | Propósito                                                        |
|-------------|------------------------------------------------------------------|
| `main`      | Código en producción. Cada release se etiqueta (`vX.Y.Z`).       |
| `develop`   | Rama de integración. De aquí parten las *features*.              |
| `feature/*` | Desarrollo de una funcionalidad. Se fusiona en `develop`.        |
| `fix/*`     | Corrección no urgente sobre `develop`. Se fusiona en `develop`.  |
| `release/*` | Preparación de una versión. Se fusiona en `main` y `develop`.    |
| `hotfix/*`  | Arreglos urgentes sobre `main`. Se fusionan en `main` y `develop`.|

Las fusiones a `develop` y `main` se hacen mediante pull request, nunca con push directo.

```bash
# Feature (igual para fix/*)
git checkout -b feature/<name> develop
git checkout develop && git merge --no-ff feature/<name> && git branch -d feature/<name>

# Release
git checkout -b release/<version> develop
git checkout main && git merge --no-ff release/<version> && git tag -a v<version> -m "v<version>"
git checkout develop && git merge --no-ff release/<version> && git branch -d release/<version>

# Hotfix
git checkout -b hotfix/<version> main
git checkout main && git merge --no-ff hotfix/<version> && git tag -a v<version> -m "v<version>"
git checkout develop && git merge --no-ff hotfix/<version> && git branch -d hotfix/<version>
```

Los mensajes de commit siguen [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`, …), en inglés y en una sola línea. Hooks: `git config core.hooksPath .githooks`.

## Licencia

[MIT](LICENSE).
