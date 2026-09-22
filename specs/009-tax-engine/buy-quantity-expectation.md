# Predicción: `quantity` pasa a llamarse `buy_quantity` en los avisos de recompra

**Escrita antes de tocar el código** (revisión de calidad, punto 13). Si al regenerar se mueve algo que no esté aquí, **se para y se pregunta**.

## Por qué

En `wash_sale_window_repurchase`, `details.quantity` era la cantidad **vendida** hasta la alineación de los avisos (ver `warnings-expectation.md`) y desde entonces es la **comprada**, sin cambiar de nombre. Quien lea ese detalle dentro de dos años no tiene forma de saberlo. En `wash_sale_window_prior_buy` siempre fue la comprada, pero se llama igual y significa lo mismo que en el otro aviso: se renombra en los dos para que la clave diga qué es.

## Qué cambia en el código

- `packages/domain/src/projections/wash-sale.ts`: en los detalles de `wash_sale_window_repurchase` y de `wash_sale_window_prior_buy`, la clave `quantity` pasa a `buy_quantity`. El valor no cambia (la cantidad de la compra, como texto decimal). El mensaje técnico en inglés tampoco.
- La CLI (`apps/cli/src/output/messages.ts`) y la web (`apps/web/src/format/messages/warnings.ts`) leen `d.buy_quantity` en lugar de `d.quantity`. El texto que ve el usuario no cambia.
- Los tests que afirman los detalles de esos avisos cambian la clave.

## Qué se mueve en `synthetic-v1.snapshot.json`

Solo el nombre de esa clave en los **17** avisos de recompra del libro sintético: 5 `wash_sale_window_prior_buy` y 12 `wash_sale_window_repurchase`. En cada uno desaparece la línea `"quantity": "<v>",` y aparece `"buy_quantity": "<v>",` con **el mismo valor**; como la instantánea ordena las claves alfabéticamente, la nueva línea queda después de `buy_date` (y de `buy_event_id` en los avisos de compra previa), unas líneas más arriba.

| Aviso | Compra | Activo | Valor (igual antes y después) |
|---|---|---|---|
| `wash_sale_window_prior_buy` | 2026-09-04 | `ast_world` | 6.3526 |
| `wash_sale_window_prior_buy` | 2026-10-06 | `ast_world` | 6.1671 |
| `wash_sale_window_prior_buy` | 2026-11-03 | `ast_world` | 6.2906 |
| `wash_sale_window_prior_buy` | 2026-12-04 | `ast_world` | 5.5913 |
| `wash_sale_window_prior_buy` | 2027-01-03 | `ast_world` | 4.9233 |
| `wash_sale_window_repurchase` | 2027-02-05 | `ast_world` | 5.0701 |
| `wash_sale_window_repurchase` | 2027-03-07 | `ast_world` | 5.3662 |
| `wash_sale_window_repurchase` | 2027-04-07 | `ast_world` | 6.0356 |
| `wash_sale_window_repurchase` | 2027-05-03 | `ast_world` | 5.7609 |
| `wash_sale_window_repurchase` | 2027-06-05 | `ast_world` | 4.9088 |
| `wash_sale_window_repurchase` | 2027-08-06 | `ast_world` | 5.5996 |
| `wash_sale_window_repurchase` | 2027-09-04 | `ast_world` | 6.5646 |
| `wash_sale_window_repurchase` | 2027-10-07 | `ast_world` | 6.4488 |
| `wash_sale_window_repurchase` | 2027-11-03 | `ast_world` | 4.8701 |
| `wash_sale_window_repurchase` | 2027-12-06 | `ast_world` | 4.6838 |
| `wash_sale_window_repurchase` | 2027-12-20 | `ast_delta` | 25 |
| `wash_sale_window_repurchase` | 2028-01-06 | `ast_world` | 5.629 |

Nada más: ni otros avisos, ni lotes, ni posiciones, ni ganancias. Las otras 171 claves `quantity` de la instantánea (lotes, consumos, posiciones) no se tocan. `synthetic-v1.tax.json` no contiene avisos de la proyección y no se mueve.
