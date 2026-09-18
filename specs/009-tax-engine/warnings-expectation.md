# Predicción: los avisos de recompra alineados con el motor (N6 y añadido de la dirección)

**Escrita antes de tocar el código**, como la del *golden* de la 008. Si al regenerar se mueve algo que no esté aquí, **se para y se pregunta**: la instantánea del libro sintético solo puede cambiar en su lista de avisos.

## Qué cambia en el código

1. **`wash_sale_window_prior_buy` deja de nombrar las compras que la venta con pérdida no deja en el patrimonio** (criterio #18): una compra de la ventana solo se nombra si le queda algún lote abierto del activo **después** de aplicar la venta. Es la misma regla con la que el motor decide qué difiere.
2. **Los dos avisos nombran la compra y la venta, sin identificadores internos, y dicen el ejercicio con número** (añadido de la dirección tras la revisión visual de la web):
   - los detalles ganan `tax_year` (el ejercicio de la venta con pérdida, un número);
   - en `wash_sale_window_repurchase`, `quantity` pasa a ser **la cantidad de la compra** (antes era la de la venta), y gana `buy_date` (la fecha fiscal de la compra); `sale_date` y `loss_eur` siguen;
   - en `wash_sale_window_prior_buy`, `quantity` ya era la de la compra; gana `sale_date` y `tax_year`;
   - el texto, en la CLI y en la web, nombra la venta por su **activo y su fecha** y la compra por su **fecha y su cantidad**; los identificadores quedan en los detalles, fuera de la frase;
   - dice «**puede** hacer que la pérdida no sea computable en 2027» y remite a `atlas tax 2027` para la cifra: una compra solo difiere la parte que cubre, y con el #19 una recompra que llega cuando la pérdida ya está cubierta no difiere nada. «No será computable» sería falso en esos casos.

## Qué se mueve en `synthetic-v1.snapshot.json`: solo `warnings`

### Desaparecen tres avisos de compra previa (#18)

Calculado recorriendo el diario de lotes hasta cada venta, sin el código nuevo:

| Venta con pérdida | Activo | Compra nombrada hoy | Fecha | Cantidad | Tras la venta |
|---|---|---|---|---|---|
| `01MBP2GS80T8F1MS8PT0M7FK2R` | `ast_world` | `01MBP2GT78JNMNGSE96ZZMH1R7` | 2026-08-28 | 2,5 | **consumida por la venta: desaparece** |
| `01MBP2GS80T8F1MS8PT0M7FK2R` | `ast_world` | `01M1PS7R5RJ4XWKK5GX24DQ2FE` | 2026-09-04 | 6,3526 | le quedan 0,0551: se queda |
| `01MBP2GS80T8F1MS8PT0M7FK2R` | `ast_world` | `01M495YN80BYC4Q2KCPDGJRBPT` | 2026-10-06 | 6,1671 | se queda |
| `01MBP2GS80T8F1MS8PT0M7FK2R` | `ast_world` | `01M6H92S80PZPKZ809HYAG101D` | 2026-11-03 | 6,2906 | se queda |
| `01MBP2GS80T8F1MS8PT0M7FK2R` | `ast_world` | `01M913D280DABTDXE2PY8XFSY8` | 2026-12-04 | 5,5913 | se queda |
| `01MBP2GS80T8F1MS8PT0M7FK2R` | `ast_world` | `01MBEBAM80K3CE5XK9JN91KKCC` | 2027-01-03 | 4,9233 | se queda |
| `01MN8FTA80DDTPKAG5TNV3Q20X` | `ast_epsilon` | `01MGBDJF80AQMY7TCNE7BB4R42` | 2027-03-05 | 40 | **consumida por la venta: desaparece** |
| `01N4F4Y58036KX1852YTTM0XD3` | `ast_delta` | `01MZJ2PA80XHBXS2XS5FZYQ1N2` | 2027-09-10 | 25 | **consumida por la venta: desaparece** |

### Los doce avisos de recompra se quedan y cambian sus detalles

`quantity` pasa de la cantidad vendida a la comprada; ganan `buy_date` y `tax_year`:

| Aviso (la compra) | Activo | `buy_date` | `quantity` antes → después | Venta | `tax_year` |
|---|---|---|---|---|---|
| `01ME3AEB80NNJANWN0AFEQT9NM` | `ast_world` | 2027-02-05 | 8,7975 → 5,0701 | 2027-01-06 | 2027 |
| `01MGGJBX80QH7D6T8TEGCQ2T7R` | `ast_world` | 2027-03-07 | 8,7975 → 5,3662 | 2027-01-06 | 2027 |
| `01MK0CP680GRT4VMCSCNE2J9M3` | `ast_world` | 2027-04-07 | 8,7975 → 6,0356 | 2027-01-06 | 2027 |
| `01MN3B0W80VF30629G9Z57MH12` | `ast_world` | 2027-05-03 | 8,7975 → 5,7609 | 2027-01-06 | 2027 |
| `01MQRA4K80BKW03GPJQ15WRAAA` | `ast_world` | 2027-06-05 | 8,7975 → 4,9088 | 2027-01-06 | 2027 |
| `01MWQYS580AQC67E90RTJSJWXG` | `ast_world` | 2027-08-06 | 8,7975 → 5,5996 | 2027-01-06 | 2027 |
| `01MZ2MA08035GFM8GTVXQKJPA0` | `ast_world` | 2027-09-04 | 8,7975 → 6,5646 | 2027-01-06 | 2027 |
| `01N1QKDQ80FXGXFWNKBY8GHRT8` | `ast_world` | 2027-10-07 | 8,7975 → 6,4488 | 2027-01-06 | 2027 |
| `01N3X45480EBH73T8KZ6NY4EVD` | `ast_world` | 2027-11-03 | 8,7975 → 4,8701 | 2027-01-06 | 2027 |
| `01N6J38V806J987G65VGRJGGDD` | `ast_world` | 2027-12-06 | 8,7975 → 4,6838 | 2027-01-06 | 2027 |
| `01N7P4TX80S2D9FXZN82KE9Z3A` | `ast_delta` | **2027-12-20** (fecha de contratación; la fecha valor es el 22) | 25 → 25 | 2027-11-10 | 2027 |
| `01N91XK48084QAF9Q2RRNGFG1F` | `ast_world` | 2028-01-06 | 8,7975 → 5,629 | 2027-01-06 | 2027 |

### Los cinco avisos de compra previa que se quedan ganan `sale_date: "2027-01-06"` y `tax_year: 2027`

### Nada más

Avisos: de **21 a 18** (el otro, `same_asset_two_accounts`, no cambia). Ni un lote, ni una ganancia, ni una posición, ni un saldo, ni una línea de `synthetic-v1.jsonl`. El informe fiscal (`synthetic-v1.tax.json`) **no se mueve**: no lee los avisos.

### Lo que este commit no arregla, y por qué

Con el #19, **diez de los doce avisos de recompra de `ast_world` no difieren nada**: el motor cubre la pérdida de −90,82 con la compra del 2027-01-03 y parte de la del 2027-02-05, las más cercanas, y las de marzo a enero de 2028 llegan con la pérdida ya cubierta. El aviso no lo puede saber sin repetir el reparto del motor, que es un recorrido del libro entero posterior a la proyección. Por eso el texto dice «**puede**» y remite a `atlas tax`, que da la cifra; dejar de emitir esos diez avisos exigiría mover el reparto a la proyección, y eso es una decisión de diseño que no toca tomar en el último commit de la feature.
