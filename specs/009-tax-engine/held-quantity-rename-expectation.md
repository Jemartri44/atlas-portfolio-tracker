# Predicción: `buy_quantity` pasa a `held_quantity` en el aviso de compra previa

**Escrita antes de tocar el código.** Si al regenerar se mueve algo que no esté aquí, **se para y se pregunta**.

## Por qué

Tras el 7a, en `wash_sale_window_prior_buy` la cifra es **lo que de la compra sigue en cartera**, y en `wash_sale_window_repurchase` es **lo comprado**. Si las dos se llaman `buy_quantity`, la misma clave significa dos cosas según el aviso: es la trampa que el punto 13 de la revisión de calidad quitó a `quantity`. El aviso de compra previa pasa a llamarla `held_quantity`. En el de recompra sigue siendo `buy_quantity`, que es exactamente lo que dice.

## Qué cambia en el código

- `packages/domain/src/projections/wash-sale.ts`: en los detalles de `wash_sale_window_prior_buy`, la clave `buy_quantity` pasa a `held_quantity`, con el mismo valor. `wash_sale_window_repurchase` no cambia.
- La CLI (`apps/cli/src/output/messages.ts`) y la web (`apps/web/src/format/messages/warnings.ts`) leen `d.held_quantity` en ese aviso. El texto que ve el usuario no cambia.
- Los tests que afirman los detalles de ese aviso cambian la clave.

## Qué se mueve en `synthetic-v1.snapshot.json`

Solo el nombre de la clave en los **cinco** avisos `wash_sale_window_prior_buy`, con el mismo valor. Como la instantánea ordena las claves y `held_quantity` cae en el mismo sitio que `buy_quantity` (después de `buy_event_id` y antes de `loss_eur`), cada cambio es una línea en su sitio:

| Compra | Activo | Valor (igual antes y después) |
|---|---|---|
| 2026-09-04 | `ast_world` | 0.0551 |
| 2026-10-06 | `ast_world` | 6.1671 |
| 2026-11-03 | `ast_world` | 6.2906 |
| 2026-12-04 | `ast_world` | 5.5913 |
| 2027-01-03 | `ast_world` | 4.9233 |

Nada más: los doce avisos de recompra conservan `buy_quantity`, y no se tocan ni los lotes, ni las posiciones, ni las ganancias, ni `synthetic-v1.tax.json`.
