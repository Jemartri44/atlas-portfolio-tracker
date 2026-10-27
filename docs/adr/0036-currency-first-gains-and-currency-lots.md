# ADR-0036 — Ganancias en divisa primero en la divisa, y lotes de divisa

**Estado:** Aceptada (2026-10-27), por decisión transmitida por la coordinadora; el diseño lo aprobó Coordinación el mismo día (`specs/029-fx-currency-first/`). Acotada por la nota del 2026-10-27 al final. *Verificar con asesor.*

## Contexto

El motor calculaba la ganancia de un valor en divisa **cada pata a su tipo**: la compra al tipo del BCE del día de la compra y la venta al del día de la venta (criterio #4, en disputa). Tampoco calculaba las diferencias de cambio de la divisa: solo una nota decía que faltaban. La doctrina vinculante dice otra cosa. **V1740-17** calcula «en la moneda en que se encuentren denominadas las acciones» y convierte la diferencia al tipo del día de la alteración. **V2422-20** lo aplica con cifras: 0 en las acciones y 0 en la conversión, donde Atlas daba −123,08 €. **V0152-26** es el caso de la persona: acciones de EE. UU. en un bróker extranjero. La divisa es a su vez un elemento patrimonial, cuya diferencia se imputa cuando el cambio «se realice efectivamente» (art. 14.2.e LIRPF, V2466-08) y va a la base del ahorro en el año de la conversión (V1877-10). Tiene que estar en `develop` antes de la primera operación real en dólares.

## Opciones consideradas

1. **Seguir cada pata a su tipo y añadir solo las diferencias de cambio.** Ventajas: no mueve ninguna cifra de valores. Inconvenientes: contradice tres consultas vinculantes, y el efecto de la divisa quedaría contado dos veces.
2. **Primero en la divisa, sin lotes de divisa.** Ventajas: poco código. Inconvenientes: el efecto de la divisa desaparece del todo; ni la venta ni la conversión lo recogen.
3. **Primero en la divisa, con lotes de divisa proyectados** (elegida). Ventajas: sigue a la doctrina y, con cualquiera de los dos métodos, el total de una vuelta completa es lo que entró en euros menos lo que salió. Inconvenientes: una proyección más, y cifras de ejemplos a mano y dorados que cambian.

## Decisión

- **`Settings.fx_gain_method`**: `currency_first` por defecto, o `each_leg`. Se materializa al escribir (ADR-0022). La otra lectura del #4 se calcula volviendo a pasar la cadena con el valor contrario, como las demás alternativas.
- **Cada lote de un valor** guarda su coste en la divisa de la adquisición (`cost`) y lo que costó en euros la divisa gastada en él (`funding_eur`). Una venta devuelve a los lotes de divisa `funding_eur` más la ganancia en euros.
- **Lotes de divisa**: una proyección por divisa, con FIFO **a través de todas las cuentas** (`4:currency_fifo`). Sin esquema nuevo: todo sale de importes, divisas, tipos y fechas que ya están en el libro (ADR-0013). Si sale divisa que no hay, se abre un lote negativo al tipo del BCE, y la entrada que lo cubre imputa la diferencia; así los lotes de una divisa suman siempre su saldo. Cambiar una divisa por otra no imputa nada.
- **Se imputa** al convertir a euros, al pagar una comisión con divisa y al cubrir un lote negativo. No se aplica la regla de recompra (`4:currency_wash_sale`, certeza baja y riesgo agresivo: el art. 33.5.e) podría alcanzar la divisa como «otros elementos patrimoniales»).
- **Enmienda a ADR-0030.** `broker_settled_eur` deja de ser solo informativo: si una operación lo trae, el bróker convirtió por su cuenta. La compra se financia con esos euros, y una venta, un dividendo o una comisión imputan ese día la diferencia (`4:auto_conversion`). Lo lee un solo módulo (`projections/currency-lots.ts`), que entra en la lista cerrada del test de arquitectura. **Queda abierto** hasta ver un extracto real de IBKR: si una conversión del bróker se trata así, y cómo se refleja en `cashBalances`.

## Consecuencias

- Cambian las ganancias en dólares de los ejemplos a mano (feature 009, el libro a mano) y de los dos dorados sintéticos, cada una recalculada a mano en la PR de la 029. El #4 pasa a certeza media; el alternativo «cada pata a su tipo» queda entre los dudosos, con su cifra.
- El informe gana `capital_gains.currency_lines`, la instantánea `currency_lots` y `currency_gains`, y desaparece la nota `tax_fx_differences_not_computed`. Las diferencias de cambio van a «otros elementos patrimoniales», sin número de casilla mientras no se compruebe (`business-rules.md` §5.11).
- Un lote comprado en una divisa y vendido en otra se calcula cada pata a su tipo (`4:mixed_currency`); la diferencia de cambio de la divisa gastada en él no se imputa, y una nota lo dice.
- Relacionadas: ADR-0005, ADR-0009, ADR-0013, ADR-0022, ADR-0029 y ADR-0030.

## Nota del 2026-10-27: alcance del método «primero en la divisa» (auditoría fiscal)

Una auditoría fiscal independiente del mismo día acota la decisión:

- **«Primero en la divisa» vale para acciones y ETC/ETP** (V1740-17, V2422-20, V0152-26).
- **Para fondos, ETF y monetarios manda el método de las IIC** (V0777-21, V0207-24): cada pata a su tipo, más la diferencia de cambio de la divisa invertida, imputada en el año de la venta. Lo corrige la PR de divisas (criterio #4 de `docs/fiscal-questions.md`).
- **Un lote comprado en una divisa y vendido en otra (`mixed`)** imputa `cost_eur − funding_eur` como línea de divisa, en lugar de la nota de «no se imputa» de las Consecuencias. También lo corrige la PR de divisas.

Hasta que esa PR se funda, el código y las Consecuencias de arriba describen el estado anterior en estos dos puntos. ADR-0013 no cambia.
