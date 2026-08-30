# Tareas: Libro mayor — núcleo y CLI (`001-ledger-core`)

**Entrada**: `specs/001-ledger-core/` (`spec.md`, `plan.md`, `data-model.md`, `research.md`, `contracts/`, `quickstart.md`, `questions.md`)

**Tests**: obligatorios (constitución VII): cada tarea de código lleva sus tests en la misma tarea o en la inmediatamente siguiente; `packages/domain` al 100 % de cobertura.

**Commits**: un commit por tarea (o por pareja código+test cuando se indica), Conventional Commits en inglés, una línea. Antes de cada commit: `npm run lint && npm run typecheck && npm test`.

**Organización**: por historia de usuario (`spec.md`), tras dos fases comunes (esqueleto y cimientos del dominio). Orden global: dinero → esquema → proyecciones → casos de uso → adaptadores → CLI → README.

## Formato: `[ID] [P?] [Historia?] Descripción con ruta`

- **[P]**: paralelizable (ficheros distintos, sin dependencia de tareas incompletas)
- **[US1..US5]**: historia de `spec.md` a la que sirve

## Fase 1: Esqueleto del monorepo (prompt §3.1, ADR-0007, ADR-0008)

- [ ] T001 Crear `.nvmrc` (`22`), `package.json` raíz (`private`, `workspaces: ["packages/*", "apps/*"]`, `engines.node >=22`, scripts `lint`, `format`, `typecheck`, `test`, `test:coverage`, `build`) y `.gitignore` ampliado (`dist/`, `coverage/`, `*.tmp-*`) — commit `chore: bootstrap npm workspaces monorepo`
- [ ] T002 Crear `tsconfig.base.json` (ESM, `NodeNext`, `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, `declaration`, `sourceMap`) y `tsconfig.json` raíz con `references` a los tres paquetes
- [ ] T003 [P] Crear `packages/domain/package.json` (`@atlas/domain`, `type: module`, `exports` → `dist/index.js`, **sin `dependencies`**) y `packages/domain/tsconfig.json`; `packages/domain/src/index.ts` vacío exportable
- [ ] T004 [P] Crear `packages/adapters/package.json` (`@atlas/adapters`, dependencia `@atlas/domain` por workspace) y `packages/adapters/tsconfig.json` con `references` a domain; `src/index.ts`
- [ ] T005 [P] Crear `apps/cli/package.json` (`@atlas/cli`, `bin: {atlas: dist/main.js}`, dependencias `@atlas/domain` y `@atlas/adapters`, **sin otras**) y `apps/cli/tsconfig.json`; `src/main.ts` mínimo
- [ ] T006 Instalar dependencias de desarrollo en la raíz (solo las de `docs/dependencies.md`: `typescript`, `@biomejs/biome`, `vitest`, `@vitest/coverage-v8`, `fast-check`, `@types/node`) con `npm install -D` y comprometer `package-lock.json` — commit `chore: add development toolchain`
- [ ] T007 [P] Crear `biome.json` (formato + lint recomendado, `organizeImports`, ignorar `dist/`, `coverage/`, `packages/domain/vendor/big.js`) y verificar `npm run lint` / `npm run format` limpios
- [ ] T008 [P] Crear `vitest.config.ts` raíz: `test.projects` para `packages/domain`, `packages/adapters`, `apps/cli`; `resolve.alias` `@atlas/domain` → `packages/domain/src/index.ts`, `@atlas/adapters` → `packages/adapters/src/index.ts`; cobertura v8 `include: ['packages/domain/src/**']`, `thresholds` 100 en `lines`, `branches`, `functions`, `statements`
- [ ] T009 Crear `packages/domain/test/architecture.test.ts`: recorre `packages/domain/src/**/*.ts`, extrae `import`/`export … from` y falla ante cualquier especificador no relativo o `node:*`, o relativo que resuelva fuera de `src/` y `vendor/`; comprobar también que `packages/domain/package.json` no tiene `dependencies` — commit `test(domain): add architecture test`
- [ ] T010 Crear `.github/workflows/ci.yml`: `on: pull_request` y `push` a `develop`/`main`; Node desde `.nvmrc`; `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm audit --audit-level=high`, `npm run build` — commit `ci: add lint, typecheck, test and build workflow`

**Punto de control**: `npm run lint`, `typecheck`, `test`, `build` pasan con paquetes vacíos.

## Fase 2: Cimientos del dominio (bloqueante para todas las historias)

### Dinero (ADR-0005, prompt §3.2)

- [ ] T011 Vendorizar `big.js` 7.0.1: descargar el tarball de npm (`research.md` R1), copiar `big.js` a `packages/domain/vendor/big.js` sin modificar, escribir `packages/domain/vendor/big.d.ts` (tipado mínimo: constructor, `plus`, `minus`, `times`, `div`, `cmp`, `eq`, `lt`, `gt`, `abs`, `neg`, `round`, `toFixed`, `toString`, estáticos `DP`, `RM`) y `packages/domain/vendor/VENDOR.md` (origen, versión, SHA-256 del fichero, licencia MIT, procedimiento de actualización) — commit `chore(domain): vendor big.js 7.0.1`
- [ ] T012 Implementar `packages/domain/src/money/decimal.ts` (`Decimal` inmutable: `parse` estricto `^-?\d+(\.\d+)?$`, rechaza `number`; `add/sub/mul/div/cmp/eq/neg/abs/isZero/isNegative/isPositive/toString` sin exponente; `Big.DP = 10`, `Big.RM = 1`) y `packages/domain/src/errors.ts` (`DomainError` base con `code`, `ValidationError`, `CurrencyMismatchError`, `ProjectionError`, `SchemaTooNewError`, `ConflictError`, `NotFoundError`, `DuplicateFingerprintError`, `DependentEventsError`, `UnsupportedEventError`)
- [ ] T013 Tests `packages/domain/test/money/decimal.test.ts`: vectores conocidos (`"0.1" + "0.2" = "0.3"`, `"1" / "3"` a 10 decimales half-up, `"1e3"` rechazado, `number` rechazado, `toString` sin exponente para `"0.0000000001"`) y propiedades con `fast-check` (conmutatividad y asociatividad de la suma, `a − a = 0`, `parse(toString(x)) = x`) — commit `feat(domain): add exact Decimal over vendored big.js`
- [ ] T014 Implementar `packages/domain/src/money/money.ts` (`Money`, `Currency` validada `^[A-Z]{3}$`, `add/sub/mul(Decimal)/neg/isZero/cmp`, `roundToCents()` half-up, `toString()`), `quantity.ts` (`Quantity`), `price.ts` (`Price.times(Quantity) → Money`), `fx-rate.ts` (`FxRate {rate, currency, date}`, `toEur(Money) → Money(EUR)`, exige misma divisa, `rate > 0`) y `packages/domain/src/money/index.ts`
- [ ] T015 Tests `packages/domain/test/money/{money,quantity,price,fx-rate}.test.ts`: mezcla de divisas lanza, `roundToCents` idempotente y half-up (`"0.005"` → `"0.01"`, `"-0.005"` → `"-0.01"`), `FxRate("1.0850", USD).toEur("1001.5" USD)` = `1001.5 / 1.0850` a 10 decimales, EUR con `rate = "1"` es identidad; propiedades de suma de `Money` — commit `feat(domain): add Money, Quantity, Price and FxRate`

### Identificadores y fechas

- [ ] T016 [P] Implementar `packages/domain/src/ids/sha256.ts` (SHA-256 puro sobre `Uint8Array`/UTF-8, devuelve hex) con tests `packages/domain/test/ids/sha256.test.ts` (vectores: `""`, `"abc"`, cadena de 56 y 64 bytes, UTF-8 multibyte) — commit `feat(domain): add pure SHA-256`
- [ ] T017 [P] Implementar `packages/domain/src/ids/ulid.ts` (`createUlidGenerator({now, random?})`: 10 chars de tiempo + 16 aleatorios Crockford base32, monótono si el ms se repite; `isUlid(s)`) con tests `packages/domain/test/ids/ulid.test.ts` (longitud 26, alfabeto, prefijo temporal de un instante conocido, monotonía en 1000 ids del mismo ms, `random` inyectada determinista, desbordamiento de la parte aleatoria lanza) — commit `feat(domain): add monotonic ULID generator`
- [ ] T018 [P] Implementar `packages/domain/src/dates/civil-date.ts` (`isCivilDate` con validación de calendario, `compareCivilDates`, `yearOf`, `today(clock)`) y `packages/domain/src/dates/madrid.ts` (`madridDateOf(isoInstant)` con `Intl.DateTimeFormat('en-CA', {timeZone: 'Europe/Madrid'})`) con tests `packages/domain/test/dates/*.test.ts` (30/02 inválido, bisiestos, `2026-08-30T22:30:00Z` → `2026-08-31`, `2026-12-30T23:30:00Z` → `2026-12-31`, cambio de hora de marzo y octubre) — commit `feat(domain): add civil dates and Europe/Madrid conversion`

### Esquema y línea (ADR-0006, data-schema §2-§6)

- [ ] T019 Definir tipos en `packages/domain/src/schema/envelope.ts` (`Envelope`, `EventType`, `CURRENT_SCHEMA_VERSION = 1`, `RESERVED_TYPES`) y `packages/domain/src/schema/events.ts` (una interfaz por tipo de `data-model.md` §2, `LedgerEvent` unión discriminada, `Draft<T>`, `AssetType`, `Book`, `DecimalString`, `CivilDate`) — commit `feat(domain): add ledger event types`
- [ ] T020 Implementar `packages/domain/src/settings/settings.ts` (`Settings` completo de `data-model.md` §2.1, `DEFAULT_SETTINGS` con `fiscal_date_rule` y `wash_sale_window_days` de ADR-0013 marcados "verificar", `validateSettings`, `mergeSettings`) y `packages/domain/src/settings/fiscal-date.ts` (`fiscalDateOf(event, assetType, settings)`) con tests `packages/domain/test/settings/*.test.ts` (defaults, pesos que no suman 100 rechazados, `fund` → `value_date`, `etc` → `trade_date`, regla cambiada invierte el resultado, `dividend`/`interest` → `value_date`) — commit `feat(domain): add Settings with documented defaults and fiscal date rule`
- [ ] T021 Implementar `packages/domain/src/schema/validate.ts`: `validateShape(raw: unknown): LedgerEvent` por tipo (obligatorios, cadenas decimales vía `Decimal.parse`, `number` en campo numérico → error, fechas, divisas, `book`, `asset_class` solo en `core`, `value_date ≥ trade_date`, `quantity > 0`, `sold_currency ≠ bought_currency`, `reason` no vacío, tipos reservados aceptados solo a nivel de envoltorio, tipo desconocido → error) con tests `packages/domain/test/schema/validate.test.ts` (un caso válido por tipo + un caso inválido por regla; propiedad: cualquier evento generado por los arbitrarios de `test/arbitraries.ts` pasa) — commit `feat(domain): validate event shape per type`
- [ ] T022 Implementar `packages/domain/src/schema/fingerprint.ts` (`fingerprintOf(event)` según `data-model.md` §2.6) y `packages/domain/src/schema/migrations/index.ts` (`MIGRATIONS: Record<number, (raw) => raw>` vacío, `migrate(raw)`), con tests `packages/domain/test/schema/{fingerprint,migrations}.test.ts` (huella determinista, cambia al cambiar `quantity`, manual sin `broker_ref` deja el campo vacío y dos registros idénticos coinciden, `broker_ref` los distingue; línea v1 pasa intacta, versión 0 desconocida → error) — commit `feat(domain): add fingerprint and migration chain`
- [ ] T023 Implementar `packages/domain/src/schema/line.ts` (`encodeLine` con orden de claves fijo, `decodeLine` → `{event, raw}`, `SchemaTooNewError` si `schema_version > CURRENT` antes de migrar) con tests `packages/domain/test/schema/line.test.ts` (ida y vuelta por tipo, `number` rechazado, JSON inválido, versión 2 rechazada, propiedad `decode(encode(e)) ≅ e`) — commit `feat(domain): encode and decode ledger lines`
- [ ] T024 Crear `packages/domain/test/arbitraries.ts` (generadores `fast-check` de decimales como cadenas, fechas civiles, divisas, cuentas, activos, `buy`/`sell`/`transfer` coherentes con un catálogo) y `packages/domain/test/helpers.ts` (`FixedClock`, `sequentialRandom`, constructor de eventos con envoltorio) — commit `test(domain): add arbitraries and helpers`

### Puertos y almacén en memoria

- [ ] T025 Definir `packages/domain/src/ports/ledger-store.ts` y `packages/domain/src/ports/clock.ts` (`contracts/ports.md` §2) y exportarlos desde `src/index.ts` — commit `feat(domain): define LedgerStore and Clock ports`
- [ ] T026 Implementar `packages/adapters/src/ledger-store/memory.ts` (`MemoryLedgerStore`: `{event, raw}[]`, `etag` incremental, `ConflictError`), `packages/adapters/src/clock/system.ts` (`SystemClock`) y `packages/adapters/src/index.ts`; crear `packages/adapters/test/ledger-store.contract.ts` (contrato de `contracts/ports.md` §2, puntos 1-4, parametrizado por fábrica) y `packages/adapters/test/memory.test.ts` que lo ejecuta — commit `feat(adapters): add in-memory LedgerStore and system Clock`

**Punto de control**: dominio con dinero, ids, fechas, tipos, validación de forma, línea y puertos al 100 % de cobertura; `MemoryLedgerStore` pasa el contrato.

## Fase 3: Historia 1 — Registrar catálogo y operaciones (P1) 🎯 MVP

**Objetivo**: `recordEvent` con validación contextual y proyección del catálogo, posiciones, efectivo y lotes de compra; CLI `account`, `asset`, `settings`, `add`.

**Prueba independiente**: `quickstart.md` escenario 1 hasta `atlas cash`.

- [ ] T027 [US1] Implementar `packages/domain/src/projections/state.ts` (`LedgerState` de `data-model.md` §3, `createEmptyState`, claves compuestas) y `packages/domain/src/projections/catalogue.ts` (aplicar `account_*`, `asset_*` con reglas de `data-model.md` §2.1: id nuevo/existente, mismo `book`, `identifier_history`, cambio de `book` con posiciones vivas → error; consultas `accounts(state)`, `assets(state)`) con tests `packages/domain/test/projections/catalogue.test.ts` — commit `feat(domain): project accounts and assets`
- [ ] T028 [US1] Implementar `packages/domain/src/projections/settings-at.ts` (aplicar `settings_changed` a `settingsHistory` con fecha Madrid; `settingsAt(state, date)`; `resolveFiscalSettings(state, override?)` = Q3-a) con tests `packages/domain/test/projections/settings-at.test.ts` (dos cambios el mismo día, `recorded_at` 23:30 UTC, sin cambios → defaults, `origin`) — commit `feat(domain): project settings history`
- [ ] T029 [US1] Implementar `packages/domain/src/projections/lots.ts` (inventario por activo: `openLot`, `consume(state, assetId, qty, byEvent)` FIFO por `(acquisition_date, posición)` partiendo el último lote, lanza `ProjectionError insufficient_lots`; `fiscalLots(state, assetId?)`) con tests `packages/domain/test/projections/lots.test.ts` (misma fecha respeta posición, partición exacta con 18 decimales, coste proporcional exacto, insuficiente lanza) — commit `feat(domain): add FIFO lot inventory`
- [ ] T030 [US1] Implementar `packages/domain/src/projections/positions.ts` y `packages/domain/src/projections/cash.ts` (aplicar efectos de `data-model.md` §2.3 sobre `positions` y `cash`; negativo en posiciones → `ProjectionError`; consultas `physicalPositions`, `cashBalances`) con tests — commit `feat(domain): project physical positions and cash balances`
- [ ] T031 [US1] Implementar `packages/domain/src/projections/project-ledger.ts` (pasadas 0, A y B de `plan.md`: catálogo y configuración en orden del fichero, operaciones y seguimiento por `(fecha de negocio, posición)` vía `orderForProjection` = Q1-b, parejas anuladas ignoradas, modo `collectErrors`, `buy` en `bucket` → `ProjectionError thesis_required` = Q2-a, `asset.book ≠ account.book` → error, `order_id`/`request_id` referencias, aviso `same_asset_two_accounts`, tipos reservados → `UnsupportedEventError`, `fingerprints`) cubriendo `buy`, `dividend`, `interest`, `fx_exchange`, `cash_deposit`, `cash_withdrawal`, `standalone_fee`, `valuation`, `settings_changed`, catálogo; con tests `packages/domain/test/projections/project-ledger.test.ts` — commit `feat(domain): project the ledger in file order`
- [ ] T032 [US1] Tests de propiedades `packages/domain/test/properties/projection.test.ts`: "proyectar dos veces da lo mismo" y "suma de lotes abiertos = posición física por activo" sobre libros generados con `arbitraries.ts` (solo compras y efectivo en esta fase; se amplía en US2/US4) — commit `test(domain): add projection invariants as properties`
- [ ] T033 [US1] Implementar `packages/domain/src/usecases/record-event.ts` (flujo de `plan.md`; `Draft` → envoltorio con `ulid`, `recorded_at`, `fingerprint`; `validateShape`; proyección con el nuevo evento; duplicado → `DuplicateFingerprintError` salvo `confirmDuplicate`; `append`) y `packages/domain/src/usecases/project-ledger.ts` (`load` + proyección) con tests `packages/domain/test/usecases/record-event.test.ts` sobre `MemoryLedgerStore` (evento escrito, rechazo no escribe, duplicado con y sin confirmación, conflicto propagado, avisos devueltos, compra registrada tarde aceptada sin aviso, error de proyección que señala un evento posterior en fecha) — commit `feat(domain): add recordEvent and projectLedger use cases`
- [ ] T034 [US1] Implementar `apps/cli/src/args.ts` (parser de `contracts/cli.md`: posicionales, `--k v`, `--k=v`, booleanos, `--`, errores de uso → código 64) y `apps/cli/src/output/table.ts` (tabla de texto alineada, tabla clave/valor) con tests `apps/cli/test/{args,table}.test.ts` — commit `feat(cli): add argument parser and text tables`
- [ ] T035 [US1] Implementar `apps/cli/src/main.ts` (resuelve `--ledger`, compone `FileLedgerStore` + `SystemClock`, despacha comandos, mapea errores de dominio a mensajes en español y códigos de salida de `contracts/cli.md`), `apps/cli/src/confirm.ts` (readline, `--yes`, sin TTY → 4) y `apps/cli/src/output/messages.ts` — commit `feat(cli): add entry point, confirmation and error mapping`
- [ ] T036 [US1] Implementar `apps/cli/src/commands/account.ts`, `asset.ts`, `settings.ts` (`add|update|list`, `set|show`) con tests `apps/cli/test/commands/catalogue.test.ts` (memoria, salida capturada) — commit `feat(cli): add account, asset and settings commands`
- [ ] T037 [US1] Implementar `apps/cli/src/commands/add.ts` (`buy|sell|transfer|dividend|interest|fx|cash-in|cash-out|fee|valuation` → borrador, vista previa, confirmación, `recordEvent`; `--confirm-duplicate`) con tests `apps/cli/test/commands/add.test.ts` (compra con `--amount`, duplicado → 3, validación → 1, `--yes`) — commit `feat(cli): add operation recording commands`

**Punto de control**: escenario 1 de `quickstart.md` hasta `atlas cash` funciona sobre un fichero (`FileLedgerStore` básico de T042 puede adelantarse si se quiere probar a mano; en tests se usa memoria).

## Fase 4: Historia 2 — Consultar posiciones, lotes, efectivo y ganancias (P1)

**Objetivo**: `sell` con FIFO global, `realizedGains`, `investmentIncome`, `integrity`; CLI de consulta.

**Prueba independiente**: escenarios 1 (`sell`, `gains`, cambio de regla) de `quickstart.md`.

- [ ] T038 [US2] Extender `project-ledger.ts` con `sell` (posición física de la cuenta suficiente, consumo FIFO global, `withholding` en efectivo) y `packages/domain/src/projections/gains.ts` (`RealizedGain` por operación y lote, `proceeds_eur` proporcional exacto, `gain_eur_rounded` una vez; `realizedGains(state, year)` por `fiscal_date`) con tests `packages/domain/test/projections/gains.test.ts`: venta que parte un lote, lotes de dos cuentas (consume la más antigua de la otra cuenta), misma fecha, compra registrada tarde con fecha anterior a una venta ya registrada (la venta consume ese lote: proyección cronológica), venta mayor que la posición de la cuenta (rechazo aunque haya lotes globales), 30/12–02/01 con `etc` y con `fund`, cambio de `fiscal_date_rule` mueve el ejercicio, redondeo una sola vez frente a suma de redondeos por lote — commit `feat(domain): project sells with global FIFO and realized gains`
- [ ] T039 [US2] Implementar `packages/domain/src/projections/income.ts` (`investmentIncome(state, year)` con importes en divisa y EUR) con tests `packages/domain/test/projections/income.test.ts` (dividendo con doble retención en USD, interés en EUR, ejercicio por `value_date`) — commit `feat(domain): project investment income`
- [ ] T040 [US2] Implementar `packages/domain/src/projections/integrity.ts` (hallazgos de `data-model.md` §3.2) con tests `packages/domain/test/projections/integrity.test.ts` (libro sano sin hallazgos, huella duplicada confirmada → warning, tipo reservado presente → error) — commit `feat(domain): add integrity checks`
- [ ] T041 [US2] Ampliar `packages/domain/test/properties/projection.test.ts` con ventas: invariante lotes = posiciones tras ventas aleatorias válidas; Σ `by_lot.quantity` = `quantity` vendida; `gain_eur = proceeds_eur − cost_eur` exacto — commit `test(domain): cover sells in projection properties`
- [ ] T042 [US2] Implementar `apps/cli/src/commands/query.ts` (`positions`, `lots [asset] [--closed]`, `cash`, `gains <year> [--lots]`, `income <year>`, `check`) con tests `apps/cli/test/commands/query.test.ts` (tablas esperadas sobre un libro en memoria, `check` con error → 1) — commit `feat(cli): add position, lot, cash, gains, income and check commands`

## Fase 5: Historia 3 — Rectificar sin borrar (P2)

**Objetivo**: `reverseEvent`, `correctEvent`; CLI `edit`, `delete`.

**Prueba independiente**: escenario 2 de `quickstart.md`.

- [ ] T043 [US3] Implementar `packages/domain/src/usecases/reverse-event.ts` y `packages/domain/src/usecases/correct-event.ts` (re-proyección sin la pareja en `collectErrors`, `DependentEventsError {affected}`, `reversal` de `reversal` y de ya anulado rechazados, `priorYear` con `clock`, un solo `append`) con tests `packages/domain/test/usecases/{reverse,correct}-event.test.ts`: anular compra vendida → rechazo listando la venta; anular `transfer` cuyos lotes destino se vendieron (se completa en US4); anular `asset_created` referenciado → lista; corrección de precio deja la proyección idéntica a registrar bien; aviso de ejercicio anterior — commit `feat(domain): add reverseEvent and correctEvent use cases`
- [ ] T044 [US3] Propiedad `packages/domain/test/properties/correction.test.ts`: para cualquier libro válido y evento no consumido, `correctEvent(x → y)` seguido de `correctEvent(y → x)` deja `projectLedger` (sin `warnings`, `reversed` ni ids) idéntico al original — commit `test(domain): corrections round-trip property`
- [ ] T045 [US3] Implementar `apps/cli/src/commands/edit.ts` y `apps/cli/src/commands/delete.ts` (`--reason`, flags de sobrescritura, vista previa de ambos eventos, aviso de ejercicio anterior, tabla de dependientes → 1) con tests `apps/cli/test/commands/rectify.test.ts` — commit `feat(cli): add edit and delete commands`

## Fase 6: Historia 4 — Traspasos y seguimiento (P2)

**Objetivo**: `transfer` fiscal y de custodia, `order_*`, `transfer_request*`, `pendingOrders`, `pendingTransfers`; CLI `order`, `transfer`.

**Prueba independiente**: escenario 3 de `quickstart.md`.

- [ ] T046 [US4] Extender `project-ledger.ts` y `lots.ts` con `transfer` (fiscal: `transferable`, mismo libro, `nav_*` obligatorios, consumo FIFO, lotes destino con `acquisition_date` y coste heredados, `quantity_in` proporcional, `source_lot_id`; custodia: mismo activo, cuentas distintas, solo posiciones) con tests `packages/domain/test/projections/transfer.test.ts`: traspaso parcial de dos lotes, activo no traspasable rechazado, custodia deja lotes intactos, coste total conservado con `quantity_in ≠ quantity_out`, traspaso de custodia entre libros rechazado — commit `feat(domain): project fund transfers and custody transfers`
- [ ] T047 [US4] Implementar `packages/domain/src/projections/pending.ts` (aplicar `order_placed/updated`, `transfer_requested/request_updated`, cierre por `buy`/`sell`/`transfer`; transiciones de `data-model.md` §3.1; `pendingOrders(state, at)`, `pendingTransfers(state, at)` con días abiertos) con tests `packages/domain/test/projections/pending.test.ts` (cierre por ejecución, cancelación, cerrar dos veces → error, etapas saltadas, orden de otra cuenta rechazada) — commit `feat(domain): project pending orders and transfer requests`
- [ ] T048 [US4] Propiedades `packages/domain/test/properties/transfer.test.ts`: un `transfer` nunca añade `RealizedGain`; Σ coste de lotes destino = Σ coste consumido en origen; invariante lotes = posiciones con traspasos aleatorios; completar en `reverse-event.test.ts` el caso "anular `transfer` con lotes destino vendidos" — commit `test(domain): transfer invariants as properties`
- [ ] T049 [US4] Implementar `apps/cli/src/commands/order.ts` (`place|cancel|note|list`) y `apps/cli/src/commands/transfer.ts` (`request|update|pending`; `atlas transfers pending` como alias) y `--order`/`--request` en `add.ts`; tests `apps/cli/test/commands/tracking.test.ts` — commit `feat(cli): add order and transfer tracking commands`

## Fase 7: Historia 5 — Un fichero que sobrevive (P3)

**Objetivo**: `FileLedgerStore` con todas las garantías, fixtures, `export`.

**Prueba independiente**: escenario 4 de `quickstart.md`.

- [ ] T050 [US5] Crear fixtures sintéticas en `tests/fixtures/ledger/`: `valid-v1.jsonl` (catálogo + compras + venta + traspaso), `future-version.jsonl` (una línea `schema_version: 2`), `no-trailing-newline.jsonl`, `empty.jsonl`, `number-amount.jsonl` (importe como número JSON) — commit `test: add synthetic ledger fixtures`
- [ ] T051 [US5] Implementar `packages/adapters/src/ledger-store/file.ts` (`FileLedgerStore`: `load` tolerante a inexistente/vacío/sin `\n`, `decodeLine` por línea con número de línea en el error, `etag = sha256(bytes)`; `append`: relectura + comparación, temporal `<path>.tmp-<ulid>` en el mismo directorio, `fsync`, `rename`) y ejecutar el contrato compartido en `packages/adapters/test/file.test.ts` más los puntos 4-7 de `contracts/ports.md` (línea futura rechazada y fichero intacto, prefijo byte a byte, `\n` añadido una sola vez, conflicto tras escritura ajena, sin temporales huérfanos) — commit `feat(adapters): add atomic file LedgerStore`
- [ ] T052 [US5] Implementar `apps/cli/src/commands/export.ts` (`--format jsonl|csv`, `--out`; JSONL copia `raw`; CSV con unión de columnas y numéricos como texto) con tests `apps/cli/test/commands/export.test.ts` — commit `feat(cli): add export command`
- [ ] T053 [US5] Test de extremo a extremo `apps/cli/test/e2e.test.ts`: ejecuta `main` sobre un fichero temporal siguiendo `quickstart.md` (escenarios 1-4 abreviados) y comprueba salidas y códigos de salida — commit `test(cli): add end-to-end scenario`

## Fase 8: Cierre y transversales

- [ ] T054 Revisar cobertura: `npm run test:coverage` al 100 % en `packages/domain` (eliminar ramas inalcanzables antes que añadir tests artificiales); `npm run lint`, `typecheck`, `build` limpios — commit solo si hay cambios (`refactor(domain): …`)
- [ ] T055 [P] Escribir `README.md` (reemplaza el actual): qué es, estado, arranque (`nvm use`, `npm ci`, `npm test`, `npm run build`), ejemplo de uso de la CLI con datos inventados (extracto de `quickstart.md`), enlace a `docs/` — commit `docs: add local setup and CLI walkthrough to README`
- [ ] T056 [P] Actualizar `specs/001-ledger-core/questions.md` con cualquier duda nueva surgida al implementar y `checklists/requirements.md` con el estado final
- [ ] T057 Ejecutar `quickstart.md` completo a mano sobre `demo.jsonl` (no comprometer el fichero) y anotar desviaciones en `questions.md`
- [ ] T058 Abrir la PR `feature/001-ledger-core` → `develop` con `.github/pull_request_template.md`, checklist rellena con honestidad, descripción en inglés, sin mención a herramientas de IA; esperar CI en verde. **No fusionar.**

## Dependencias

- Fase 1 → Fase 2 → US1 → US2 → US3 → US4 → US5 → Fase 8. US3 y US4 son independientes entre sí salvo T048 (completa un test de T043); pueden intercambiarse.
- Dentro de la Fase 2: T011 → T012-T015; T016, T017, T018 en paralelo; T019 → T020 → T021 → T022 → T023 → T024; T025 → T026.
- Dentro de US1: T027-T030 en el orden dado (el estado crece); T031 los integra; T034 es independiente del dominio y puede hacerse en paralelo desde T019.

## Ejemplos de paralelismo

- Tras T011: T016, T017, T018 y T034 en paralelo con T012-T015.
- Tras T031: T032 (propiedades) en paralelo con T033 (caso de uso).
- Fase 8: T055 y T056 en paralelo.

## Estrategia

1. **MVP** = Fases 1-2 + US1 + US2 (registro y consulta con FIFO): ya cumple "si solo se construye esto, el sistema ya cumple" (`docs/specification.md` §13, Fase 1).
2. US3 y US4 completan el modelo (rectificación, traspaso); US5 endurece el fichero y añade exportación.
3. Cada fase termina con `lint`, `typecheck`, `test` en verde y commits atómicos ya hechos; nunca se acumulan cambios sin comprometer entre fases.
