# Contrato de la CLI — feature 004-monthly-contribution

Amplía `specs/001-ledger-core/contracts/cli.md`. Mensajes en español; flags e identificadores en inglés. Códigos de salida, los ya definidos (`EXIT` en `context.ts`).

## Comandos nuevos

```
atlas weights [--date YYYY-MM-DD] [--json]
atlas contribute [--amount <eur>] [--date YYYY-MM-DD] [--json]
atlas costs [--date YYYY-MM-DD] [--json]
atlas transfer simulate --from-asset <id> --to-asset <id> (--quantity <n> | --all) [--date YYYY-MM-DD] [--json]
```

Los cuatro son de **solo lectura**: no abren el almacén para escribir, no piden confirmación y no cambian el `etag`. Sin `--date`, hoy en `Europe/Madrid`.

### `atlas weights`

```
Pesos del núcleo a 2027-12-31 (precios manuales; informativos, nunca fiscales):

activo       clase          cantidad   precio    divisa  tipo BCE  valor EUR   peso     objetivo  desv. pp  precio de    antigüedad
-----------  -------------  ---------  --------  ------  --------  ----------  -------  --------  --------  -----------  ----------
ast_world    equity         120.4500   105.20    EUR     1         12670.14    58.20 %  60.00 %   -1.80     2027-12-31   0
ast_bonds    fixed_income    45.0000    98.10    EUR     1          4414.50    20.28 %  25.00 %   -4.72     2027-12-31   0
ast_gold     gold             7.0000   214.30    USD     1.0812     1387.55     6.37 %  10.00 %   -3.63     2027-12-24 ⚠ 7
...
             TOTAL                                                 21770.19   100.00 %  100.00 %

Avisos:
  deviation_above_threshold  ast_mm se desvía 6.10 pp del objetivo (umbral 5)
  satellite_below_minimum    gold pesa 6.37 %, por debajo del mínimo de satélite (10 %)
  stale_price                ast_gold: precio de hace 7 días (máximo 5)
```

- `⚠` marca el precio caducado; la antigüedad se muestra siempre, haya o no parámetro.
- Fila sin precio: las columnas de precio y valor salen como `sin precio`, y las de peso y desviación quedan vacías **en todas las filas**, con el aviso `partial_core_total` explicándolo.
- Fila con objetivo y sin posición: cantidad y valor `0`, precio vacío, peso `0.00 %`, desviación `−objetivo`. **No** hace parcial el total.

### `atlas contribute`

```
Aportación de 1000.00 EUR a 2027-12-31 (importe de --amount):

  Presupuesto del cubo (10 %):  100.00 EUR   — se ejecuta a mano; la app no elige valores del cubo
  A repartir en el núcleo:      900.00 EUR

activo       clase          valor EUR  objetivo EUR  déficit EUR  asignación  valor tras  peso tras
-----------  -------------  ---------  ------------  -----------  ----------  ----------  ---------
ast_bonds    fixed_income    4414.50      5667.55      1253.05      612.19     5026.69     22.16 %
...
                                                                   900.00

La propuesta no se ha registrado: da las órdenes en la plataforma y regístralas con
`atlas order place` / `atlas add buy`.
```

Rechazos, con código de salida `EXIT.domain`:

| Situación | Mensaje |
|---|---|
| Sin `--amount` y sin `monthly_contribution_eur` | `falta el importe: pásalo con --amount o fíjalo con atlas settings set --monthly-contribution-eur` |
| Sin `target_weights` | `no hay pesos objetivo: fíjalos con atlas settings set --target-weights ast_x=60,ast_y=40` |
| Sin `bucket_pct_of_contribution` | `falta el porcentaje del cubo: atlas settings set --bucket-pct-of-contribution 10` |
| `--amount 0` o no decimal | error de uso (`EXIT.usage`) |
| Falta precio de un activo con posición | `faltan precios a 2027-12-31: ast_gold, ast_btc. Regístralos con atlas add valuation …` |

### `atlas costs`

Dos tablas separadas, con encabezados propios: **Núcleo** (por activo: comisiones EUR, % de lo invertido, TER, valor, coste anual estimado; y la fila de totales con el TER medio ponderado) y **Cubo** (por cuenta: comisiones acumuladas). Ningún total común. Si falta algún precio, el agregado del núcleo se marca `parcial` y se dice sobre qué parte se ha calculado.

### `atlas transfer simulate`

```
Simulación de traspaso a 2027-12-31: 10.0000 de ast_world → ast_bonds (1052.00 EUR).
Un traspaso entre fondos no es hecho imponible: conserva fecha de adquisición y coste (business-rules.md §5.2).

activo       peso antes  peso después  desv. antes  desv. después
-----------  ----------  ------------  -----------  -------------
ast_world      58.20 %      53.37 %       -1.80        -6.63
ast_bonds      20.28 %      25.11 %       -4.72         0.11
...
Nada se ha registrado.
```

## Comandos existentes que cambian

| Comando | Cambio |
|---|---|
| `atlas settings set` | `+ --target-weights ast_x=60,ast_y=40` · `+ --wash-sale-window fund=1y,stock=2m` · `− --wash-sale-window-days` (error de uso remitiendo al nuevo) · `+ --accept-invalid` · lista los avisos que el cambio silencia y pide confirmación |
| `atlas add dividend` | `+ --source-country US` |
| `atlas add transfer` | `− --fee` (error de uso: *la comisión de un traspaso de custodia se registra como `standalone_fee`*) |
| `atlas backup --to`, `atlas export --out` | confirmación si el destino cae dentro de un árbol de trabajo de git |
| Las 17 consultas de solo lectura | cabecera de aviso si hay eventos inválidos; `invalid_count` en `--json` |

### Cabecera de degradación

```
Aviso: 3 eventos inválidos en el libro; lo que sigue es una proyección parcial. Ejecuta `atlas check` para verlos.
```

Va a la salida estándar antes de la tabla, salvo en `export`, donde va al canal de error para no contaminar el fichero ni la tubería (A9). Con `--json` no aparece: la salida de todo comando de solo lectura es el sobre `{ "invalid_count": <n>, "data": <payload> }`, uniforme para los diecisiete (antes cada comando emitía su payload desnudo; el sobre es la forma estable que permite añadir el contador sin inventar una envoltura distinta por comando).

### `atlas settings set` que invalida el pasado

```
Este cambio deja inválidos 2 eventos que hoy son válidos:
  01J6…A7  sell   la venta consume lotes que a la fecha nueva aún no existen
  01J6…B2  transfer  …
Los hechos no cambian, cambia su interpretación (ADR-0015). Repite con --accept-invalid si es lo que quieres.
```

Sin `--accept-invalid`, código de salida `EXIT.domain` y nada escrito. Con el flag, se escribe y se informa de cuántos eventos quedan inválidos y de que las consultas avisarán. La confirmación interactiva **no** sustituye al flag.

### Aviso de umbral silenciado

```
Este cambio silencia avisos activos:
  deviation_above_threshold  ast_mm (desviación 6.10 pp; umbral nuevo 8)
¿Continuar? [s/N]
```

Satisfecho por `--yes`. Si no hay precios para evaluarlo: `No se han podido evaluar los avisos (faltan precios de ast_gold); se continúa.`

## `USAGE`

Se añaden las líneas de los cuatro comandos nuevos y los flags nuevos de `settings set`, `add dividend` y `add transfer`.
