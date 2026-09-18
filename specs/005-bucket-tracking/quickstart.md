# Quickstart — feature 005-bucket-tracking

Recorrido manual de la Fase 3 sobre el libro sintético, con el binario compilado. Se ejecuta al terminar la implementación y las desviaciones se anotan en `questions.md`.

```bash
nvm use && npm ci && npm run build
export ATLAS="node apps/cli/dist/main.js"
```

## 1. Un libro con cubo, índice y precios

```bash
$ATLAS synth --out /tmp/atlas-demo.jsonl --seed 1
export L="--ledger /tmp/atlas-demo.jsonl"
$ATLAS $L check --deep           # sin errores; avisos esperados, incluido wash_sale_window_repurchase
$ATLAS $L settings show          # bucket_benchmark_asset_id, los tres umbrales del cubo, mapas parciales
```

Se comprueba: los mapas `fiscal_date_rule` y `wash_sale_window` de la línea **no** mencionan `etf` y `settings show` lo devuelve completo con su valor por defecto (bloque 0, ADR-0018).

## 2. El cubo de un vistazo

```bash
$ATLAS $L bucket --date 2028-12-31
$ATLAS $L bucket --date 2028-12-31 --json | head -40
```

Se comprueba:

- una fila por posición viva del cubo, con coste medio, precio, valor, P&L latente, días abierta, plazo superado y **condición de invalidación visible**;
- las tesis con `equiv. índice` y `vs índice`, y las que no tienen dato dicen por qué;
- las **comisiones sobre capital operado** destacadas, con los dos importes;
- el aviso de muestra pequeña y, si procede, el de tesis excluidas por contaminación;
- ningún activo del núcleo en ninguna fila.

## 3. La misma vista un año antes

```bash
$ATLAS $L bucket --date 2027-12-31
```

Se comprueba: las cantidades son las de 2027 (no las de hoy), los precios son los últimos conocidos a esa fecha y las tesis abiertas entonces aparecen como abiertas. Es la comprobación de ADR-0016 y la que más vale la pena hacer a mano.

## 4. El patrimonio, desglosado

```bash
$ATLAS $L networth --date 2028-12-31
```

Se comprueba: los tres bloques siempre presentes, una fila por cuenta y divisa de efectivo con el tipo aplicado y **de qué fecha es**, el total marcado `(parcial)` cuando falta algo y la lista de lo que falta. Ningún número agregado sin su desglose.

## 5. El detalle de una tesis

```bash
$ATLAS $L thesis list --date 2028-12-31 --closed
$ATLAS $L thesis show th_gamma --date 2028-12-31
```

Se comprueba: `thesis list` con las columnas nuevas; `thesis show` con la hipótesis, el plazo, la invalidación, el tamaño previsto frente a lo invertido y la lista de compras y ventas con fechas e importes.

## 6. El aviso de recompra (lo que más dinero ahorra)

```bash
# Venta con pérdida ya en el libro; se recompra dentro de la ventana
$ATLAS $L add buy --account acc_bucket --asset ast_delta --thesis th_delta3 \
  --trade-date 2028-04-20 --value-date 2028-04-22 --quantity 5 --unit-price 17.50 \
  --currency EUR --fx-rate 1 --fx-rate-date 2028-04-20 --fee 1 --source manual
```

Se comprueba: **antes** de confirmar aparece `wash_sale_window_repurchase` con la venta, su pérdida y el último día de la ventana; se responde que **no** y no se escribe nada. Repitiendo con fecha posterior al último día de la ventana, el aviso no aparece.

## 7. La regla de parada avisa, no bloquea

```bash
$ATLAS $L add buy --account acc_bucket --asset ast_gamma --thesis th_gamma … --yes
```

Se comprueba: si la pérdida acumulada supera el umbral, el aviso sale **destacado** y la compra **se registra igualmente** (decisión (f)).

## 8. Un cambio de configuración que mueve una Renta

```bash
$ATLAS $L settings set --fiscal-date-rule stock=value_date
```

Se comprueba: se listan los ejercicios anteriores cuyas ganancias realizadas cambian, con la cifra antes y después, y se pide confirmación; respondiendo que no, no se escribe nada.

## 9. Nada de esto ha tocado el libro

```bash
$ATLAS $L check --deep
sha256sum /tmp/atlas-demo.jsonl        # igual que tras el paso 1 si no se confirmó ninguna escritura
```
