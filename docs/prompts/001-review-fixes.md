# Prompt 001-fixes — Correcciones tras la revisión de la PR #10

> Para el asistente implementador de la feature 001. Copia este texto íntegro o indícale que lea `docs/prompts/001-review-fixes.md`. Es un encargo pequeño y cerrado: no reabre el alcance de la 001 ni adelanta nada de la 002.

---

Eres el asistente implementador del proyecto **Atlas Portfolio Tracker**. La PR #10 (`feature/001-ledger-core`) está fusionada en `develop`. La revisión de dirección encontró cinco puntos que corregir; los documentos ya están actualizados en `develop` (esta misma PR de documentos). Tu trabajo es alinear el código con ellos.

## 1. Lee antes de empezar

`CLAUDE.md` (§ *Working on a feature* y § *Domain traps*), `docs/data-schema.md` §4 (`unit_price?`) y §6.1 (`asset_type`, regla de `asset_updated`), ADR-0007 (puerto `RandomSource`), y `specs/001-ledger-core/questions.md` (Q4 y notas de implementación).

## 2. Flujo

- Rama `fix/001-review-fixes` desde `origin/develop` **actualizado** (`git fetch origin && git worktree add ../atlas-portfolio-tracker-001-fixes -b fix/001-review-fixes origin/develop`, o reutiliza tu worktree tras `git checkout -b fix/001-review-fixes origin/develop`). Hooks con `git config core.hooksPath .githooks`.
- Un commit por punto, Conventional Commits en inglés, línea única. Sin rastro de IA. PR a `develop` con la plantilla; no fusiones.
- `npm run lint`, `typecheck`, `test:coverage` (100 % en `packages/domain`) y `build` en verde antes de cada commit. Ningún documento de `docs/` se toca; si algo no encaja, anótalo en `specs/001-ledger-core/questions.md` y avisa.

## 3. Correcciones

1. **`unit_price` opcional cuando hay `amount`** (`data-schema.md` §4). Hoy la CLI escribe `unit_price: "0"` cuando solo recibe `--amount` (`apps/cli/src/commands/add.ts`, `withDerivedPrice`), y el comentario de esa función dice lo contrario de lo que hace. Cambios: en `validate.ts`, `buy`/`sell` exigen **exactamente** `unit_price` o `amount` como base (`amount` puede ir acompañado de `unit_price` informativo; sin `amount`, `unit_price` es obligatorio); la CLI deja de inventar el cero y elimina `withDerivedPrice`; `basisOf` en `operations.ts` ya contempla ambos casos; la huella (`fingerprint.ts`) usa `amount ?? unit_price` y no cambia. Tests: compra solo con `--amount` produce una línea **sin** `unit_price`; compra sin ninguno de los dos se rechaza; las fixtures y el `quickstart.md`/README no deben mostrar `unit_price: "0"`. Si alguna fixture de `tests/fixtures/ledger/` lleva `unit_price` junto a `amount`, déjala: sigue siendo válida.
2. **`asset_updated` rechaza cambiar `asset_type` o `currency`** (`data-schema.md` §6.1). Validación contextual en `catalogue.ts` (`applyAssetUpdated`), error `asset_type_change` / `asset_currency_change` con el evento afectado, y un test por cada caso más uno que confirme que cambiar `isin`, `ticker`, `ter`, `name`, `reference_etf_id`, `transferable` o `active` sigue permitido.
3. **`isPriorYear` usa el año UTC** (`usecases/rectify.ts`). Debe usar el año de la fecha de hoy en `Europe/Madrid` (`todayInMadrid(clock)` ya existe en `dates/madrid.ts`). Test con un reloj en `2027-12-31T23:30:00Z` (es 2028-01-01 en Madrid).
4. **Lotes procedentes de traspaso y desempate por posición** (`operations.ts`, `applyTransfer`). Los lotes destino reciben hoy la posición del `transfer`; para el desempate FIFO entre lotes con la misma `acquisition_date` deben conservar la **posición del evento origen del lote consumido** (`slice.position`), que es lo que `data-schema.md` §8.1 llama "evento origen". Test: fondo B con una compra directa en fecha D registrada después de un traspaso desde A cuyo lote también tiene fecha D; una venta de B consume primero el lote heredado (su compra en A es anterior en el fichero).
5. **Nits**, un commit cada uno si los haces: el comentario de `withDerivedPrice` desaparece con el punto 1; `rootDir: "src"` en los `tsconfig` de los tres paquetes para que la salida sea `dist/main.js` en vez de `dist/src/main.js` (ajusta `bin`, `exports`, el script `atlas`, el README y `quickstart.md`; `tests/` mantiene su propio `tsconfig`); en el README, recupera el bloque de comandos de git flow (feature, release, hotfix) que tenía la versión anterior (`git show 0b34210:README.md`).

## 4. Fuera de alcance

Todo lo demás: eventos corporativos, tesis, `compact`, importadores, S3, cambios de esquema no listados. Si al hacer el punto 1 crees que hace falta tocar `docs/data-schema.md`, no lo hagas: pregunta.

## 5. Criterios de terminado

CI en verde; cobertura 100 % en `domain`; `specs/001-ledger-core/questions.md` actualizado (Q4 marcada como resuelta: `data-schema.md` §6.1 ya dice `asset_type`); PR a `develop` con la checklist honesta.
