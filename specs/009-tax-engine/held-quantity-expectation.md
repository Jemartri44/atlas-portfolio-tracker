# Predicción: el aviso de compra previa cita lo que de la compra sigue en cartera (7a)

**Escrita antes de tocar el código** (revisión fiscal, punto 7a; la dirección eligió la opción (a)). Si al regenerar se mueve algo que no esté aquí, **se para y se pregunta**.

## Por qué

`wash_sale_window_prior_buy` cita la cantidad **comprada**, en las unidades del día de la compra. Tras un contrasplit 1:4, una compra de 2 títulos de la que quedan 0,5 se cita como «2 títulos». Y cuando la propia venta con pérdida consumió parte de la compra (el caso del #18), el aviso dice que «sigue en cartera» una cantidad que ya no está.

## Qué cambia en el código

- `packages/domain/src/projections/wash-sale.ts`, `warnPriorBuys`: el aviso ya solo nombraba compras con algún lote abierto después de la venta. Ahora suma **esos lotes abiertos** (lo que de la compra sigue en cartera, en las unidades de hoy) y lo pone en `details.buy_quantity` y en el mensaje técnico. Ni la clave ni la regla de cuándo se avisa cambian.
- El mensaje técnico en inglés y los textos en español de la CLI y de la web pasan a decir «N títulos de la compra del D **siguen** en cartera» en lugar de «una compra de N títulos que sigue en cartera».
- `wash_sale_window_repurchase` no cambia: su compra es de ese mismo día y no hay nada que haya podido consumirla ni escalarla antes.

## Qué se mueve en `synthetic-v1.snapshot.json`

**Una línea.** La instantánea guarda de cada aviso el código, los detalles y el evento, pero no el mensaje. Por eso el cambio de texto no se ve en ella y solo se mueve un detalle:

| Aviso | Venta | Compra | `buy_quantity` antes → después |
|---|---|---|---|
| `wash_sale_window_prior_buy` | `01MBP2GS80T8F1MS8PT0M7FK2R` (2027-01-06) | `01M1PS7R5RJ4XWKK5GX24DQ2FE`, `ast_world`, 2026-09-04 | 6.3526 → **0.0551** |

Tras la venta del 2027-01-06, de los 6,3526 títulos de esa compra quedan en cartera 0,0551 (FIFO: es la compra más antigua de las que el aviso nombra). Las otras cuatro compras previas de esa venta (2026-10-06, 2026-11-03, 2026-12-04 y 2027-01-03) siguen enteras en cartera y conservan su cantidad. Los doce avisos de recompra no se tocan, y tampoco los lotes, las posiciones, las ganancias ni `synthetic-v1.tax.json`.
