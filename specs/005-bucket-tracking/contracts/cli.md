# Contrato de la CLI — feature 005-bucket-tracking

Amplía `specs/001-ledger-core/contracts/cli.md` y `specs/004-monthly-contribution/contracts/cli.md`. Mensajes en español; flags e identificadores en inglés. Códigos de salida, los ya definidos (`EXIT` en `context.ts`).

## Comandos nuevos

```
atlas bucket [--date YYYY-MM-DD] [--json]
atlas networth [--date YYYY-MM-DD] [--json]
atlas thesis show <thesis_id> [--date YYYY-MM-DD] [--json]
```

Los tres son de **solo lectura**: no abren el almacén para escribir, no piden confirmación y no cambian el `etag`. Sin `--date`, hoy en `Europe/Madrid`. Con `--date`, proyectan con `asOf` (ADR-0016). Con `--json`, sobre `{ invalid_count, data }`.

### `atlas bucket`

```
Cubo especulativo a 2028-12-31 (precios manuales; informativos, nunca fiscales).

⚠ REGLA DE PARADA: pérdida acumulada 1.842,30 EUR (34,10 % del aporte bruto de 5.400,00 EUR),
  por encima del 30 % configurado. La app no bloquea el registro: la decisión es tuya (regla 17).

Posiciones abiertas:
cuenta      activo     cantidad  coste medio  precio  divisa  precio de   antigüedad  valor EUR  P&L EUR  P&L %   tesis      días  plazo  invalidación
----------  ---------  --------  -----------  ------  ------  ----------  ----------  ---------  -------  ------  ---------  ----  -----  ----------------------
acc_bucket  ast_gamma  20        31.45        38.20   USD     2028-12-31  0           706.15     77.15    12.27   th_gamma   784   180 ⚠  Synthetic invalidation
acc_bucket  ast_delta  12        18.10        —       EUR     —           —           —          —        —       th_delta3  41    90     Cierra bajo 15 EUR

Tesis:
tesis      estado    activo     invertido  resultado  latente  equiv. índice  vs índice  días
---------  --------  ---------  ---------  ---------  -------  -------------  ---------  ----
th_alpha   cerrada   ast_alpha    412.30      98.20      0.00         441.02      69.48   487
th_beta    cerrada   ast_beta     305.10       0.00      0.00         318.77     -13.67   398
th_beta_n  cerrada   ast_beta_n     0.00    -121.40      0.00              —          —   112

Estadísticas (sobre 7 tesis cerradas; 2 ventas del cubo):
  ⚠ Muestra pequeña: por debajo de 100 operaciones no se distingue habilidad de suerte.
  ⚠ 1 tesis excluida de las medias: sus ventas consumieron lotes de otra tesis (FIFO global).

  COMISIONES SOBRE CAPITAL OPERADO:  14,00 EUR / 2.480,90 EUR = 0,56 %

  Tasa de acierto      60,00 %        Ganancia media     84,10 EUR
  Esperanza             21,45 EUR     Pérdida media     -72,30 EUR
  Máxima caída         121,40 EUR     (de 2028-03-14 a 2028-06-02)
  Resultado vs índice   55,81 EUR     (2 tesis sin dato)

Control del cubo:
  Aporte bruto      5.400,00 EUR   (neto 5.200,00 EUR)   Presupuesto previsto  5.760,00 EUR
  Tope de aporte    6.000,00 EUR   Peso sobre patrimonio 4,12 % (tope 10,00 %)

Avisos:
  bucket_stop_loss_reached  …
```

- La métrica de la regla 14 va **destacada**, no en una esquina (§3.4).
- Fila sin precio: `sin precio` en las columnas de precio y `—` en valor y P&L; el activo se lista al pie y el total del cubo se marca `(parcial)`.
- Sin índice configurado, las dos columnas de índice salen `—` y hay un aviso que dice cómo configurarlo.

### `atlas networth`

```
Patrimonio total a 2028-12-31 (desglosado siempre; núcleo y cubo nunca se mezclan en una métrica).

Núcleo:
  [equity]         18.204,10 EUR
  [fixed_income]    7.310,55 EUR
  [gold]            1.402,00 EUR
  [crypto]            860,20 EUR
  Subtotal         27.776,85 EUR

Cubo:
  acc_bucket / ast_gamma   706,15 EUR
  acc_bucket / ast_delta        — (sin precio)
  Subtotal                 706,15 EUR   (parcial)

Efectivo:
cuenta      divisa  saldo     tipo BCE  tipo de     antigüedad  valor EUR
----------  ------  --------  --------  ----------  ----------  ---------
acc_mi      EUR     1.204,30  —         —           —           1.204,30
acc_ibkr    USD       310,45  1.0842    2028-12-29  2             286,34
acc_bucket  CHF        12,00  —         —           —           — (sin convertir)
  Subtotal                                                       1.490,64   (parcial)

TOTAL (parcial)  29.973,64 EUR
Faltan: precio de ast_delta; tipo de cambio de CHF.
```

- El total **siempre** va acompañado de su desglose y, si es parcial, de la lista de lo que falta.
- Un tipo más viejo que `stale_price_days` se marca `⚠` en la columna de antigüedad.

### `atlas thesis show`

```
Tesis th_gamma (abierta)
  cuenta            acc_bucket
  activo            ast_gamma
  hipótesis         Synthetic thesis on ast_gamma
  plazo previsto    180 días   (abierta desde hace 784 ⚠ superado)
  invalidación      Synthetic invalidation rule
  tamaño previsto   980,00 EUR    invertido 629,00 EUR
  resultado         0,00 EUR      latente 77,15 EUR
  equiv. índice     664,12 EUR    vs índice 42,03 EUR

Compras:
fecha       evento                      cantidad  importe EUR  comisión EUR
2027-07-08  01J…                        12        377,40       0,92
2028-09-12  01J…                         8        251,60       0,94

Ventas: (ninguna)
```

Con un `thesis_id` que no existe: `Error (unknown_thesis): La tesis th_x no existe.` y código de salida 1.

## Comandos modificados

```
atlas thesis list [--closed] [--date YYYY-MM-DD] [--json]
atlas settings set … [--bucket-benchmark-asset <asset_id>]
atlas add valuation … [--fx-rate-date YYYY-MM-DD]
atlas add cash-in|cash-out|fee … [--fx-rate-date YYYY-MM-DD]
```

- `thesis list` gana las columnas **vs índice** y **días** (ya existía `días`, ahora se calcula sobre la fecha pedida con la proyección cortada) y sustituye `--at` por `--date`. `--at` responde: `Error de uso: usa --date YYYY-MM-DD (la vista se proyecta a esa fecha, ADR-0016)`.
- `atlas settings set --bucket-benchmark-asset ast_world` fija el índice. No se valida contra el catálogo al escribir (el activo puede darse de alta después); el aviso llega al consultar.
- `atlas settings set` **añade** el aviso de ejercicio movido, antes de escribir y junto al de umbral silenciado:

```
Este cambio mueve ganancias realizadas de ejercicios anteriores:
ejercicio  antes      después
2027       1.204,30   980,15
2028         310,00   534,15
Puede afectar a una declaración ya presentada. ¿Continuar? [s/N]
```

  Con `--yes`, la confirmación se da por hecha. **No bloquea** el cambio.

- `atlas add buy` sobre una cuenta del cubo imprime, tras la vista previa y antes de confirmar, el aviso destacado de la regla de parada si está superada; y, en cualquier libro, el aviso de recompra si la compra cae dentro de la ventana:

```
Aviso (wash_sale_window_repurchase): la venta 01J… del 2028-03-02 tuvo una pérdida de 121,40 EUR
y la ventana de recompra de ast_delta llega hasta el 2028-05-02: esa pérdida no será computable
este ejercicio (business-rules.md §5.4). El diferimiento lo calculará el motor fiscal.
```

## `USAGE`

```
  bucket [--date]            networth [--date]         thesis show <id> [--date]
  thesis open|close <id>|list [--closed] [--date]
  settings set … --bucket-benchmark-asset <id>
```
