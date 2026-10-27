# Plan — 029 Ganancias en divisa: primero en la divisa, y lotes de divisa

Cómo se construye lo que dice `spec.md`. Las decisiones de aquí no cambian el esquema del libro: todo sale de campos que ya existen.

## 1. El método del #4 es configuración

`Settings.fx_gain_method`: `"currency_first"` (por defecto) o `"each_leg"` (lo de antes). Se lee con su valor por defecto y se materializa al escribir, como `wash_sale_transfer_counts`. Así la otra lectura se calcula como las demás de `stakes.ts`, volviendo a pasar la cadena con la configuración contraria, y su cifra incluye las líneas de divisa de esa lectura.

## 2. Cada lote guarda dos magnitudes más

`FiscalLot` gana `cost` (su coste en la divisa de la adquisición) y `funding_eur` (lo que costaron en euros las divisas que se gastaron en él). Las dos se reparten igual que `cost_eur`: proporcionales en `consume`, `carve_out`, traspasos y canjes.

| Adquisición | `cost` | `funding_eur` |
|---|---|---|
| `buy` | importe + comisión, en su divisa | el coste en euros de los lotes de divisa consumidos; si no hay, `broker_settled_eur` o el BCE |
| `grant` con coste | `unit_cost × cantidad` | `cost_eur` (no se gasta divisa) |
| `swap`, pata de entrada | el valor del art. 37.1.h | `funding_eur` de lo entregado + su ganancia en euros + el coste en euros de la comisión |

## 3. La ganancia de una transmisión

Por lote consumido, con `fx_gain_method = currency_first` y el `cost` del lote en la misma divisa que la transmisión (distinta del euro): `ganancia = (parte de la transmisión en divisa − cost) / tipo de la transmisión`, y el valor de adquisición en euros es `parte de la transmisión en euros − ganancia`: los dos al tipo de la transmisión. Si no, como hasta ahora. Una línea con un lote en otra divisa lleva el criterio `4:mixed_currency`.

## 4. Lotes de divisa

`state.currencyLots`: por divisa y a través de las cuentas, en el orden de la pasada B. Entradas y salidas como en la tabla de `spec.md`. Además:

- **Ganancia de la venta en divisa**: la divisa que entra cuesta `funding_eur` de los lotes vendidos + la ganancia en euros − la retención en euros. Con cualquiera de los dos métodos, el total en euros de una vuelta completa es lo que entró menos lo que salió.
- **Salida sin lotes** (saldo negativo): abre un lote negativo valorado en `broker_settled_eur` o, si no, al tipo del BCE. La siguiente entrada lo cubre primero y la diferencia se imputa (línea `cover`). Así, la suma de los lotes de una divisa es siempre la de sus saldos.
- **Conversión del bróker** (`broker_settled_eur` en el evento): el bróker convirtió. No pasa por los lotes de divisa: una compra se financia con esos euros, y una venta, un dividendo o un interés imputan ese día la diferencia (`auto_conversion`). El cuadre de FR-002 descuenta esas operaciones. Queda **abierto** hasta ver un extracto de IBKR (ADR-0030).
- **Retirada**: consume lotes sin imputar nada, con una nota.

`state.currencyGains`: una entrada por imputación (`conversion`, `payment`, `cover`, `auto_conversion`), con los lotes de divisa consumidos, redondeada una vez por operación (ADR-0005). La regla de recompra no se aplica.

## 5. Salidas

- **Informe** (`taxYear`): `currency_lines` con cada imputación del ejercicio; van a las ganancias y pérdidas patrimoniales de la base del ahorro. Las casillas salen por concepto, sin número, hasta comprobar la casilla. Desaparece `tax_fx_differences_not_computed`.
- **Criterios**: `4` pasa a certeza media; nuevos `4:mixed_currency`, `4:currency_fifo`, `4:currency_wash_sale` y `4:auto_conversion`.
- **Instantánea**: lotes con `cost` y `funding_eur`, `currency_lots` y `currency_gains`. El dorado se regenera en su propio commit, con cada diferencia explicada.
- **Consola y web**: las líneas de divisa en el informe, y los lotes de divisa junto a los de los valores.
- `broker_settled_eur` lo lee un módulo más, que entra en la lista cerrada del test de arquitectura (ADR-0030).

## 6. Pruebas

V2422-20 con sus cifras (0 y 0); el ejemplo de la investigación (0 y −75,76 €); ganancia y pérdida con comisiones; cobertura de un lote negativo; conversión del bróker; las dos lecturas del #4 en `stakes`; propiedad de cuadre lotes = saldos. Los cálculos a mano con dólares se recalculan, cada uno con su razonamiento.
