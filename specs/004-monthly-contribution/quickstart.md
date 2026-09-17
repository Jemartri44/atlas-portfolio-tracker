# Quickstart — feature 004-monthly-contribution

Recorrido manual del ciclo mensual sobre el libro sintético, con el binario compilado. Se ejecuta al terminar la implementación y se anota el resultado en `questions.md`.

```bash
nvm use && npm ci && npm run build
export ATLAS="node apps/cli/dist/main.js"
```

## 1. Un libro con precios

```bash
$ATLAS synth --out /tmp/atlas-demo.jsonl --seed 1
export L="--ledger /tmp/atlas-demo.jsonl"
$ATLAS $L check --deep          # sin hallazgos
$ATLAS $L settings show         # wash_sale_window en la forma nueva, target_weights por asset_id
```

## 2. Ver el reparto actual

```bash
$ATLAS $L weights --date 2027-12-31
$ATLAS $L weights --date 2027-12-31 --json | head -30
```

Se comprueba: una fila por activo `core` con posición, subtotales por clase, total del núcleo, antigüedad de cada precio, y ningún activo del cubo en la tabla.

## 3. Calcular la aportación del mes

```bash
$ATLAS $L contribute --amount 1000 --date 2027-12-31
$ATLAS $L contribute --date 2027-12-31          # usa monthly_contribution_eur
```

Se comprueba: el presupuesto del cubo sale aparte, la suma de la columna de asignación es exactamente el importe del núcleo, y el `etag` del fichero no ha cambiado (`$ATLAS $L check` antes y después).

## 4. Dar la orden y registrarla (lo que la app **no** hace por ti)

```bash
$ATLAS $L order place --account acc_mi --asset ast_bonds --side buy --amount 612.19 \
    --requested-date 2028-01-03 --yes
# … cuando la plataforma ejecuta, con el VL ya conocido:
$ATLAS $L add buy --account acc_mi --asset ast_bonds --order <order_id> \
    --trade-date 2028-01-03 --value-date 2028-01-05 --quantity 6.2000 \
    --amount 612.19 --currency EUR --fx-rate 1 --fx-rate-date 2028-01-03 --fee 0 --yes
```

## 5. Simular un traspaso antes de darlo

```bash
$ATLAS $L transfer simulate --from-asset ast_world --to-asset ast_bonds --quantity 10 --date 2027-12-31
$ATLAS $L transfer simulate --from-asset ast_gold --to-asset ast_bonds --quantity 1 --date 2027-12-31
# el segundo se rechaza: ast_gold no es transferable
```

## 6. Ver lo que cuesta la cartera

```bash
$ATLAS $L costs --date 2027-12-31
```

Se comprueba: dos tablas separadas, núcleo y cubo, sin ningún total común.

## 7. Cambiar la configuración con los ojos abiertos

```bash
# Sube el umbral y silencia un aviso activo: la CLI lo lista y pregunta
$ATLAS $L settings set --deviation-threshold-pp 8

# Un cambio de regla fiscal que reinterpreta el pasado
$ATLAS $L settings set --fiscal-date-rule fund=trade_date --yes
#   → rechazado, con la lista de eventos que pasan a ser inválidos
$ATLAS $L settings set --fiscal-date-rule fund=trade_date --accept-invalid --yes
#   → escrito; a partir de aquí, toda consulta avisa
$ATLAS $L positions                 # cabecera: "N eventos inválidos; ver atlas check"
$ATLAS $L positions --json | head -3   # "invalid_count": N
$ATLAS $L add cash-in --account acc_mi --value-date 2028-01-10 --amount 100 \
    --currency EUR --fx-rate 1 --yes
#   → rechazado: las mutaciones siguen exigiendo un libro válido
```

## 8. Las validaciones nuevas

```bash
# Tipo de cambio distinto de 1 en euros
$ATLAS $L add cash-in --account acc_mi --value-date 2028-01-12 --amount 100 \
    --currency EUR --fx-rate 1.0000 --yes        # → eur_fx_rate_not_one

# Fecha de tipo de cambio en sábado
$ATLAS $L add buy --account acc_ibkr --asset ast_gold --trade-date 2028-01-15 \
    --value-date 2028-01-18 --quantity 1 --unit-price 200 --currency USD \
    --fx-rate 1.08 --fx-rate-date 2028-01-15 --fee 0 --yes   # sábado → fx_rate_date_weekend

# Dividendo con país del pagador
$ATLAS $L add dividend --account acc_bucket --asset ast_alpha --value-date 2028-01-20 \
    --gross 10 --withholding-origin 1.5 --withholding-spain 0 --currency USD \
    --fx-rate 1.08 --fx-rate-date 2028-01-20 --source-country US --yes
```

## 9. Copias fuera del repositorio

```bash
$ATLAS $L backup --to ./copias        # dentro del repo → pregunta
$ATLAS $L backup --to ~/atlas-private/backups   # fuera → no pregunta
```
