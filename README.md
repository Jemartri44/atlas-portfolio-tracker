# Atlas Portfolio Tracker

Aplicación personal para gestionar una cartera de inversión a 20 años: libro mayor *append-only*, lotes fiscales FIFO, traspasos entre fondos y preparación de los datos de la Renta. **Nunca ejecuta órdenes**: cada operación se hace a mano en la plataforma y se registra aquí.

## Estado

Fase 1 completa: feature `001-ledger-core` (dominio puro `@atlas/domain`, adaptadores de fichero y memoria `@atlas/adapters`, CLI `atlas` sobre un `ledger.jsonl` local), feature `002-corporate-actions` (eventos corporativos como composición de cinco primitivas de lote, tesis del cubo especulativo y valoraciones a una fecha) y feature `003-synthetic-data` (generador de libros sintéticos con *golden file*, `compact` con archivo del original, verificación profunda y copia local verificada). Sin API, sin web, sin infraestructura todavía. Detalle en [`specs/001-ledger-core/`](specs/001-ledger-core/), [`specs/002-corporate-actions/`](specs/002-corporate-actions/) y [`specs/003-synthetic-data/`](specs/003-synthetic-data/).

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
npm run clean                        # borra dist/, dist-test/ y coverage/ de todos los paquetes
```

`npm run clean && npm run build` reconstruye desde cero (los `.tsbuildinfo` viven dentro de `dist*/`, así que borrar la salida no deja estado incremental a medias, por ejemplo al cambiar de rama).

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
atlas check              # integridad del libro (proyección)
atlas check --deep       # además, líneas crudas: ids duplicados, huellas manipuladas, líneas no canónicas o antiguas

# Rectificar (el libro nunca se edita: anulación + evento corregido)
atlas edit <id> --reason "precio mal tecleado" --unit-price 123.45
atlas delete <id> --reason "duplicado"

# Seguimiento de órdenes y traspasos en curso, y exportación
atlas order place --account acc_fund --asset ast_world --side buy --amount 500 --requested-date 2027-07-01 --yes
atlas transfer request --from-account acc_fund --from-asset ast_world --to-account acc_fund --to-asset ast_bonds --quantity-out 4 --requested-date 2027-03-01 --yes
atlas export --format csv --out ledger.csv
```

### Copia de seguridad provisional (Fases 1-3)

Mientras el libro real viva en un fichero local, haz una copia verificada tras cada sesión de registro y **siempre fuera del repositorio** (el repo es público):

```bash
atlas backup --to ~/atlas-private/backups
```

`.gitignore` ignora `ledger*.jsonl`, `demo*.jsonl` y `backups/` en todo el árbol como red de seguridad, pero la regla es no escribir datos reales dentro del repositorio.

### Eventos corporativos y tesis

Un evento corporativo (`corporate_action`) lleva un `kind` para las personas y una lista de **cinco primitivas de lote** (`scale`, `convert`, `carve_out`, `forced_sale`, `grant`) que es lo único que el dominio ejecuta; una tabla por `kind` decide qué secuencias se admiten (`docs/data-schema.md` §8.5, ADR-0011). Los asistentes `atlas ca <kind>` construyen los efectos a partir de flags sencillos, muestran el evento y una tabla **antes/después** de lotes y posiciones, y escriben solo tras confirmar. `ratio` admite un decimal (`4`, `0.25`) o una fracción `nuevas/antiguas` (`1/4`, `4/3`) para que un contrasplit 1:3 quede exacto.

```bash
# Split 4:1 de una acción: cantidades ×4, coste y fecha de adquisición intactos, sin hecho imponible
atlas asset add --id ast_acme --type stock --book core --asset-class equity --name "ACME" --currency EUR --not-transferable --yes
atlas add buy --account acc_fund --asset ast_acme --trade-date 2027-01-10 --value-date 2027-01-12 --quantity 10 --unit-price 100 --currency EUR --fx-rate 1 --fx-rate-date 2027-01-10 --yes
atlas ca split --asset ast_acme --ratio 4 --effective-date 2027-03-01 --source-document https://acme.example/split.pdf --yes

# Contrasplit 1:4 con liquidación de picos cuenta a cuenta (los picos son un hecho imponible aunque la ganancia sea cero)
atlas ca reverse-split --asset ast_acme --ratio 1/4 --effective-date 2027-06-01 --source-document https://acme.example/reverse.pdf \
  --cash-per-share 400 --currency EUR --fx-rate 1 --fx-rate-date 2027-06-01 --fees acc_fund=1 --yes

# Otros asistentes: merger, spin-off, fund-merger, share-class-change, fund-liquidation, delisting; raw para el resto
atlas ca raw --asset ast_acme --kind issuer_liquidation --effects-json '[{"op":"forced_sale","per_account":[{"account_id":"acc_fund","quantity":"all"}],"unit_price":"0","currency":"EUR","fx_rate":"1","fx_rate_date":"2028-01-15"}]' --effective-date 2028-01-15 --source-document documents/acme/liquidation.pdf --yes
```

El documento fuente (`--source-document`) se guarda como referencia: el PDF se copia a mano a `documents/`. Un `corporate_action` no se edita: `atlas delete <id>` y registrarlo de nuevo.

En el cubo especulativo **no se puede comprar sin tesis** (regla 15 del plan): la tesis se abre antes en el libro y cada compra la referencia con `--thesis`; las ventas también pueden enlazarse para que el resultado de la tesis sea derivable.

```bash
atlas account add --id acc_bucket --name "Cubo" --platform ibkr --book bucket --base-currency EUR --country IE --yes
atlas asset add --id ast_spec --type stock --book bucket --name "Spec Inc" --currency USD --not-transferable --yes
atlas thesis open --id th_spec_1 --account acc_bucket --asset ast_spec --hypothesis "Resultados Q3 por encima del consenso" \
  --horizon-days 90 --invalidation "Guidance recortada" --planned-size 500 --yes
atlas add buy --account acc_bucket --asset ast_spec --trade-date 2027-07-01 --value-date 2027-07-03 --quantity 10 --unit-price 50 --fee 1 --currency USD --fx-rate 1.1 --fx-rate-date 2027-07-01 --thesis th_spec_1 --yes
atlas add sell --account acc_bucket --asset ast_spec --trade-date 2027-09-01 --value-date 2027-09-03 --quantity 10 --unit-price 60 --fee 1 --currency USD --fx-rate 1.1 --fx-rate-date 2027-09-01 --thesis th_spec_1 --yes
atlas thesis close th_spec_1 --notes "Cumplida" --yes
atlas thesis list --closed     # invertido, resultado, comisiones, posición viva y días abierta
atlas valuations --date 2027-12-31   # última foto de valoración por cuenta y activo (Modelo 720)
```

Códigos de salida: `0` OK · `1` error de validación o de proyección · `2` conflicto de escritura (repite) · `3` huella repetida sin `--confirm-duplicate` · `4` falta confirmación sin terminal (añade `--yes`) · `5` libro escrito por una versión más nueva · `64` uso incorrecto.

### Datos sintéticos, compactación y copia de seguridad

Toda feature se prueba contra un **libro sintético** reproducible: `atlas synth` genera un libro de tres ejercicios con todos los tipos de evento y los casos raros (traspasos parciales encadenados, contrasplit con picos en dos cuentas, registro tardío, corrección de un ejercicio anterior, venta el 30/12 con liquidación el 02/01…), idéntico byte a byte para la misma semilla. La salida de la semilla 1 está congelada como *golden file* en `tests/fixtures/ledger/synthetic-v1.jsonl` junto con la instantánea de su proyección.

```bash
atlas synth --out demo.jsonl                 # semilla 1 (por defecto); rechaza si la ruta existe
atlas synth --out otra.jsonl --seed 42       # mismo esqueleto, otros importes, precios y fechas
atlas --ledger demo.jsonl check --deep       # verificación profunda sobre las líneas crudas
atlas --ledger demo.jsonl compact            # reescribe el libro a la versión actual del esquema…
                                             # …tras archivar el original tal cual en archive/ (no-op si no hay líneas antiguas)
atlas --ledger demo.jsonl backup --to /ruta/copias   # copia ledger-<fecha>.jsonl, releída y verificada por etag
```

`compact` es la única operación que reescribe el libro: guarda antes los bytes originales en `archive/ledger-<fecha>-v<n>.jsonl` (nunca sobrescribe un archivo), es no-op si todas las líneas están en la versión actual y aborta sin escribir si la proyección cambiaría o hay eventos inválidos.

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
