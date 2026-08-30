# Guía rápida de verificación — `001-ledger-core`

Comprueba de extremo a extremo que la feature funciona. Datos inventados.

## Requisitos

- Node 22 vía nvm (`nvm install 22 && nvm use`), npm 10.
- Clon en `feature/001-ledger-core` con hooks: `git config core.hooksPath .githooks`.

## Arranque

```bash
nvm use
npm ci
npm run lint && npm run typecheck && npm run test:coverage && npm run build
```

Resultado esperado: todo en verde; la cobertura de `packages/domain` marca 100 % en líneas, ramas, funciones y sentencias; el test `architecture` pasa.

## Escenario 1 — Registro y consulta (Historias 1 y 2)

```bash
alias atlas='node apps/cli/dist/main.js --ledger ./demo.jsonl'

atlas account add --id acc_fund --name "Fondos" --platform myinvestor --book core --base-currency EUR --country ES --yes
atlas account add --id acc_etf --name "ETC" --platform ibkr --book core --base-currency EUR --country IE --yes
atlas asset add --id ast_world --type fund --book core --asset-class equity --name "World Index" --currency EUR --transferable --isin XX0000000001 --yes
atlas asset add --id ast_gold --type etc --book core --asset-class gold --name "Gold ETC" --currency USD --not-transferable --isin XX0000000002 --yes

atlas add buy --account acc_fund --asset ast_world --trade-date 2026-09-01 --value-date 2026-09-02 --quantity 10.123456 --amount 1000 --currency EUR --fx-rate 1 --fx-rate-date 2026-09-02 --yes
atlas add buy --account acc_etf --asset ast_gold --trade-date 2026-12-30 --value-date 2027-01-02 --quantity 5 --unit-price 200 --fee 1.5 --currency USD --fx-rate 1.0850 --fx-rate-date 2026-12-30 --yes
atlas positions
atlas lots
atlas cash
```

Esperado: `positions` muestra 10.123456 en `acc_fund|ast_world` y 5 en `acc_etf|ast_gold`; `lots` muestra un lote de `ast_world` con fecha 2026-09-02 (fondo → `value_date`) y coste 1000 EUR, y uno de `ast_gold` con fecha 2026-12-30 (ETC → `trade_date`) y coste `(1000 + 1.5) / 1.0850` EUR con 10 decimales; `cash` muestra −1000 EUR en `acc_fund` y −1001.5 USD en `acc_etf`.

```bash
atlas add sell --account acc_etf --asset ast_gold --trade-date 2026-12-31 --value-date 2027-01-04 --quantity 2 --unit-price 210 --fee 1 --currency USD --fx-rate 1.0900 --fx-rate-date 2026-12-31 --yes
atlas gains 2026
atlas gains 2027
```

Esperado: la ganancia aparece en **2026** (fecha de contratación) y `gains 2027` está vacío. Cambiar la regla y comprobar que se mueve:

```bash
atlas settings set --fiscal-date-rule etc=value_date --yes
atlas gains 2027
```

Esperado: ahora la venta (y la compra) se imputan por `value_date` y la ganancia aparece en 2027.

## Escenario 2 — Rectificar (Historia 3)

```bash
atlas add sell --account acc_etf --asset ast_gold --trade-date 2027-02-01 --value-date 2027-02-03 --quantity 3 --unit-price 190 --currency USD --fx-rate 1.08 --fx-rate-date 2027-02-01 --yes
atlas delete <id de la compra de oro> --reason "prueba"
```

Esperado: rechazo (código 1) listando las dos ventas que consumieron el lote. Luego:

```bash
atlas edit <id de la primera venta> --reason "precio mal tecleado" --unit-price 211 --yes
atlas lots --closed
atlas export --format jsonl | wc -l
```

Esperado: el libro tiene dos líneas más (`reversal` y `sell` con `corrects_id`); los lotes son idénticos a haber registrado 211 desde el principio.

## Escenario 3 — Traspaso y seguimiento (Historia 4)

```bash
atlas asset add --id ast_bonds --type fund --book core --asset-class fixed_income --name "Bond Index" --currency EUR --transferable --isin XX0000000003 --yes
atlas transfer request --from-account acc_fund --from-asset ast_world --to-account acc_fund --to-asset ast_bonds --quantity-out 4 --requested-date 2027-03-01 --yes
atlas transfer pending
atlas add transfer --request <request_id> --from-account acc_fund --from-asset ast_world --quantity-out 4 --nav-out 105 --value-date-out 2027-03-03 --to-account acc_fund --to-asset ast_bonds --quantity-in 3.5 --nav-in 120 --value-date-in 2027-03-05 --yes
atlas transfer pending
atlas lots ast_bonds
atlas gains 2027
```

Esperado: la solicitud aparece pendiente y desaparece tras el `transfer`; el lote de `ast_bonds` tiene `acquisition_date` 2026-09-02, cantidad 3.5 y coste `1000 × 4 / 10.123456` EUR; `gains 2027` no incluye el traspaso. Intentar `atlas add transfer` desde `ast_gold` a `ast_bonds` se rechaza (no traspasable).

## Escenario 4 — Fichero (Historia 5)

```bash
cp tests/fixtures/ledger/future-version.jsonl /tmp/future.jsonl
node apps/cli/dist/main.js --ledger /tmp/future.jsonl positions   # código 5, fichero intacto
head -c 100 demo.jsonl | sha256sum                                  # anotar
atlas add cash-in --account acc_fund --value-date 2027-03-10 --amount 500 --currency EUR --fx-rate 1 --yes
head -c 100 demo.jsonl | sha256sum                                  # idéntico
atlas check
```

Esperado: prefijo idéntico; `check` sin errores.
