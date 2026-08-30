# Guía rápida de verificación — `002-corporate-actions`

Comprueba de extremo a extremo que la feature funciona. Datos inventados.

## Arranque

```bash
nvm use && npm ci
npm run lint && npm run typecheck && npm run test:coverage && npm run build
alias atlas='node apps/cli/dist/main.js --ledger ./demo.jsonl'
```

Esperado: todo en verde; cobertura de `packages/domain` al 100 %.

## Escenario 1 — Split y contrasplit con picos en dos cuentas (Historias 1 y 3)

```bash
atlas account add --id acc_a --name "Bróker A" --platform ibkr --book core --base-currency EUR --country IE --yes
atlas account add --id acc_b --name "Bróker B" --platform ibkr --book core --base-currency EUR --country IE --yes
atlas asset add --id ast_old --type stock --book core --asset-class equity --name "Old Corp" --currency EUR --not-transferable --isin XX0000000010 --yes
atlas add buy --account acc_a --asset ast_old --trade-date 2027-01-10 --value-date 2027-01-12 --quantity 10 --unit-price 100 --currency EUR --fx-rate 1 --fx-rate-date 2027-01-10 --yes
atlas add buy --account acc_b --asset ast_old --trade-date 2027-02-10 --value-date 2027-02-12 --quantity 7 --unit-price 110 --currency EUR --fx-rate 1 --fx-rate-date 2027-02-10 --yes

atlas ca split --asset ast_old --ratio 4 --effective-date 2027-03-01 --source-document https://issuer.example/split.pdf
```

Esperado: la vista previa muestra posiciones 10→40 y 7→28 y los dos lotes con cantidad ×4 y coste intacto; tras confirmar, `atlas lots` muestra 40 (coste 1000) y 28 (coste 770), origen `buy`.

```bash
atlas ca reverse-split --asset ast_old --ratio 0.0625 --effective-date 2027-04-01 --source-document https://issuer.example/reverse.pdf \
  --cash-per-share 400 --currency EUR --fx-rate 1 --fx-rate-date 2027-04-01 --yes
atlas positions
atlas gains 2027
atlas lots
```

Esperado (1:4 sobre el split anterior, es decir 40→10→2,5 en A y 28→7→1,75 en B): el evento lleva `scale(0.0625)` y `forced_sale` con `{acc_a: 0.5}` y `{acc_b: 0.75}`; posiciones finales 2 y 1; dos ganancias con fecha 2027-04-01, origen `corporate_action:reverse_split`, la primera de 200 € de transmisión y 200 € de coste (ganancia 0); efectivo +200 en `acc_a` y +300 en `acc_b`.

## Escenario 2 — Fusión y escisión (Historia 1)

```bash
atlas asset add --id ast_new --type stock --book core --asset-class equity --name "New Corp" --currency EUR --not-transferable --isin XX0000000011 --yes
atlas ca merger --asset ast_old --to-asset ast_new --ratio 0.5 --effective-date 2027-05-01 --source-document documents/merger/prospectus.pdf --yes
atlas lots --closed
atlas positions
```

Esperado: los lotes de `ast_old` cerrados con consumición del evento; lotes de `ast_new` con cantidad 1 y 0,5, mismas fechas de adquisición (2027-01-10, 2027-02-10) y coste heredado; la CLI propone `atlas asset update ast_old --inactive`.

```bash
atlas asset add --id ast_spin --type stock --book core --asset-class equity --name "Spin Co" --currency EUR --not-transferable --isin XX0000000012 --yes
atlas ca spin-off --asset ast_new --to-asset ast_spin --ratio 1 --cost-share 0.2 --effective-date 2027-06-01 --source-document documents/spin/form.pdf --yes
atlas lots
```

Esperado: cada lote de `ast_new` conserva su cantidad con el 80 % del coste; aparece un lote de `ast_spin` por cada uno con el 20 %; la suma de costes por lote origen no cambia.

## Escenario 3 — Tesis del cubo (Historia 2)

```bash
atlas account add --id acc_bucket --name "Cubo" --platform ibkr --book bucket --base-currency EUR --country IE --yes
atlas asset add --id ast_spec --type stock --book bucket --name "Spec Inc" --currency USD --not-transferable --yes
atlas add buy --account acc_bucket --asset ast_spec --trade-date 2027-07-01 --value-date 2027-07-03 --quantity 10 --unit-price 50 --currency USD --fx-rate 1.1 --fx-rate-date 2027-07-01 --yes
```

Esperado: rechazo (código 1) citando la regla 15.

```bash
atlas thesis open --id th_spec_1 --account acc_bucket --asset ast_spec --hypothesis "Resultados Q3 por encima del consenso" --horizon-days 90 --invalidation "Guidance recortada" --planned-size 500 --yes
atlas add buy --account acc_bucket --asset ast_spec --trade-date 2027-07-01 --value-date 2027-07-03 --quantity 10 --unit-price 50 --fee 1 --currency USD --fx-rate 1.1 --fx-rate-date 2027-07-01 --thesis th_spec_1 --yes
atlas add sell --account acc_bucket --asset ast_spec --trade-date 2027-09-01 --value-date 2027-09-03 --quantity 10 --unit-price 60 --fee 1 --currency USD --fx-rate 1.1 --fx-rate-date 2027-09-01 --thesis th_spec_1 --yes
atlas thesis close th_spec_1 --notes "Cumplida" --yes
atlas thesis list --closed
```

Esperado: la tesis aparece cerrada, con invertido `(500 + 1) / 1.1`, resultado `(599 − 501) / 1.1` redondeado a céntimos, comisiones `2 / 1.1`, posición 0 y los días entre apertura y cierre (fechas de `recorded_at` en Madrid). Cerrar con posición viva habría mostrado el aviso `thesis_closed_with_position`.

## Escenario 4 — Valoraciones y rectificación (Historias 1 y 4)

```bash
atlas add valuation --account acc_a --asset ast_spin --date 2027-12-31 --quantity 1 --unit-value 20 --currency EUR --fx-rate 1 --yes
atlas valuations --date 2028-01-15
atlas delete <id del merger> --reason "prueba"
```

Esperado: `valuations` muestra la foto de `ast_spin` con valor 20 EUR; el `delete` del `merger` se rechaza listando el `spin_off` (y las ventas, si las hubiera) que dependen de sus lotes.

```bash
atlas ca raw --asset ast_new --kind split --effects-json '[{"op":"convert","to_asset_id":"ast_spin","ratio":"1"}]' --effective-date 2027-12-01 --source-document x --yes
atlas check
```

Esperado: `raw` termina con código 1 (`effects_not_allowed_for_kind`); `check` sin hallazgos de error.
