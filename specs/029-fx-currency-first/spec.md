# Especificación — 029 Ganancias en divisa: primero en la divisa, y lotes de divisa

Estado: **diseño aprobado por Coordinación el 2026-10-27**, con las respuestas a las cuatro preguntas al final. El cómo, en `plan.md`. Punto 2 del encargo del 26/10 (`docs/prompts/` no tiene prompt propio: el encargo es de la coordinadora, sobre la investigación fiscal del 26/10). Tiene que estar en `develop` **antes de la primera operación real en USD**.

## Por qué

Atlas calcula la ganancia de un valor en divisa convirtiendo **cada pata a su tipo**: la compra al tipo del BCE del día de la compra y la venta al del día de la venta (criterio #4). La doctrina vinculante dice otra cosa. La releí entera en PETETE el 2026-10-26:

- **DGT V1740-17** (06/07/2017): para acciones en divisa «que se liquidan en cuenta bancaria del consultante abierta en el extranjero en la referida moneda», el cálculo se hace «en la moneda en que se encuentren denominadas las acciones», y luego hay que «efectuar la conversión de la diferencia resultante a euros al tipo de cambio vigente en la fecha en la que haya tenido lugar la alteración patrimonial». Lo mismo dice, en el art. 25.2.b), del rendimiento del capital mobiliario de unos certificados en divisa.
- **DGT V2422-20** (15/07/2020) lo aplica a un caso con cifras: 1.000 € → 1.200 $ (a 1,2), compra de 10 acciones a 120 $ (el día va a 1,3), venta de las 10 a 120 $ (a 1,5) y vuelta a euros a 1,2. Resultado: **ni ganancia ni pérdida en las acciones** (0 $) **ni en la conversión** a euros.
- **DGT V0152-26** (27/01/2026), que es el caso de la persona (acciones de EE. UU. en un bróker extranjero con cuenta en dólares), repite el criterio de la V1740-17 y añade el de la divisa (V2466-08, citada). La diferencia de cambio es ganancia o pérdida patrimonial, pero «cuando lo recibido sean divisas, el resultado derivado de las diferencias de cambio no se imputará hasta el momento en que ese cambio se realice efectivamente» (art. 14.2.e LIRPF). La **V1877-10** (02/09/2010) añade que se imputa en el año de la conversión a euros y que va a la base del ahorro.

Atlas, en el caso de la V2422-20, daría **−123,08 €** en las acciones (1.200/1,3 = 923,08 frente a 1.200/1,5 = 800) y nada en la divisa, porque hoy no calcula diferencias de cambio (nota `tax_fx_differences_not_computed`). La DGT da 0 y 0. **Certeza: media-alta a favor del método de la DGT** (tres consultas vinculantes y la última es de 2026). **Si fallara: en las dos direcciones**, según suba o baje el dólar; sobre todo cambia **en qué año** aparece el efecto de la divisa.

## Qué cambia

### 1. La ganancia de un valor en divisa (criterio #4)

- **Regla.** Cuando las dos patas de un lote están en la misma divisa distinta del euro: `ganancia_divisa = transmisión_divisa − coste_divisa` (las comisiones en esa divisa, con el art. 35 o el 25.2.b, como hoy), y `ganancia_eur = ganancia_divisa / tipo_BCE(fecha fiscal de la transmisión)`. El coste en divisa ya está en el libro: cada lote guarda su coste original con su divisa (`lot.root.cost`), y `currencyFirstGain` (`tax/lines.ts`) ya lo calcula, hoy como alternativa del #4.
- **Patas en divisas distintas.** Las mismas acciones compradas en Xetra en euros y vendidas en el Nasdaq en dólares son homogéneas (V1872-25) y comparten lotes. En ese caso la ganancia en una sola divisa no existe, así que se queda la regla de hoy para ese lote: el coste en euros al tipo de su día y la transmisión al tipo de la venta. Lo dice cada línea con un criterio propio.
- **El criterio #4 cambia de lado.** El valor por defecto pasa a ser «primero en la divisa» y «cada pata a su tipo» queda como alternativa en los dudosos, con su cifra. Hace falta un **ADR nuevo** (`Propuesta`, lo decides tú), porque cambia cómo se calcula toda ganancia en divisa. No reabre ADR-0013, que trata la fecha fiscal y el tipo publicado, y eso no cambia: el tipo sigue siendo el del BCE, guardado tal cual (ADR-0013, ADR-0029).

### 2. Lotes de divisa (hueco estructural #9)

La divisa que se tiene es un elemento patrimonial con su coste en euros. Con la regla 1, el efecto de la divisa ya no está dentro de la ganancia de las acciones: aparece **cuando la divisa se convierte a euros**. Para calcularlo hacen falta lotes de divisa, que son **una proyección**, como los de los valores. **No se guardan ni cambia el esquema**: todo lo que necesitan ya está en los eventos (importe, divisa, tipo y fecha).

**Entra divisa** (abre un lote, con su coste en euros):

| Evento | Coste en euros del lote |
|---|---|
| `fx_exchange` de euros a la divisa | Los euros entregados (más la comisión, si va en euros) |
| `cash_deposit` en la divisa | importe / tipo del BCE de su fecha |
| `dividend`, `interest` en la divisa | Neto recibido / tipo de su fecha (el bruto ya tributó a ese tipo) |
| `sell` de un valor en la divisa | **El coste en euros de la divisa que se gastó en comprarlo, más la ganancia en euros de la regla 1** (ver abajo) |
| `fx_exchange` de otra divisa a esta | El coste en euros de los lotes de la divisa entregada: no se imputa nada (V2466-08) |

**Sale divisa** (consume lotes por FIFO):

| Evento | Qué pasa |
|---|---|
| `fx_exchange` de la divisa a euros | **Ganancia o pérdida patrimonial**: euros recibidos (menos la comisión) − coste en euros de los lotes consumidos. Se imputa ese día (art. 14.2.e) y va a la base del ahorro (V1877-10) |
| `buy` de un valor en la divisa | Nada se imputa. El lote del valor guarda el coste en euros de la divisa que consumió (`funding_eur`), y ese coste vuelve a los lotes de divisa cuando se vende |
| `fx_exchange` a otra divisa | Nada se imputa; el coste pasa a la otra divisa |
| `cash_withdrawal` de la divisa | Nada se imputa (la divisa sigue siendo de la persona, fuera de la cuenta); el coste sale con ella y se dice |
| `standalone_fee` en la divisa | **Pregunta 3** |

**Por qué la venta devuelve «coste gastado + ganancia».** Es lo que hace cuadrar la V2422-20. Los 1.200 $ que vuelven de la venta son los mismos 1.200 $ comprados con 1.000 € (la ganancia en dólares fue 0), y al convertirlos a 1,2 no hay diferencia. Si se les diera como coste 1.200/1,5 = 800 €, la conversión daría +200 € de ganancia que la DGT dice que no existe. Con ganancia o con pérdida funciona igual: compra con 1.200 $ que costaron 1.000 €, venta por 900 $ a 1,5 (pérdida de las acciones −300 $ = −200 €). Los 900 $ entran con coste 1.000 − 200 = 800 €, y si se convierten a 1,5 (600 €) dan −200 € de divisa. En total, −400 €: los 1.000 € que entraron frente a los 600 € que salieron.

**FIFO de la divisa.** Por divisa y **a través de todas las cuentas**, como los valores (`business-rules.md` §5.3, ADR-0009). La DGT no dice qué orden usar: **pregunta 1**.

**Compra con conversión automática** (el bróker carga euros y nunca hubo dólares, ADR-0030). No hay lote de divisa que consumir. El `funding_eur` del valor es `broker_settled_eur` si el extracto lo da y, si no, `importe / tipo del BCE`. Al vender pasa lo mismo al revés. La V1740-17 parte de una cuenta «abierta en el extranjero en la referida moneda», así que este caso **sigue abierto** (ADR-0030): **pregunta 2**.

### 3. Lo que se ve

- Las líneas de transmisión de un valor en divisa dicen con qué método se calcularon (criterio #4 o el de patas en divisas distintas) y, en dudosos, la cifra de la otra lectura, como hoy.
- **Línea nueva de divisa** en ganancias patrimoniales: una por `fx_exchange` hacia euros, con los lotes de divisa consumidos (fecha y coste) y su resultado. Desaparece la nota `tax_fx_differences_not_computed`.
- **Casillas:** la conversión de divisa no es la transmisión de un valor. Su casilla del Modelo 100 hay que comprobarla en la tabla del ejercicio (`business-rules.md` §5.11): mientras no esté comprobada, sale **por concepto y sin número**, como manda la regla de las casillas.
- La consola (`atlas tax`, `atlas lots`) y la web enseñan los lotes de divisa en la misma tabla que los de los valores, con su divisa.

### 4. Cifras que se moverán (se recalculan a mano, como en #235)

Los cálculos a mano con operaciones en dólares (ejercicio de la feature 009, E5 y E21; libro a mano, U3), su consola y el dorado `synthetic-v1.tax.json`. Los dudosos del #4 cambiarán de signo, porque la lectura alternativa pasa a ser la de hoy. Cada cifra irá con su razonamiento y la PR llevará la tabla del antes y el después.

## Requisitos

- **FR-001** La ganancia de un lote con las dos patas en la misma divisa extranjera se calcula en esa divisa y se convierte al tipo de la transmisión. El caso V2422-20 da 0 en las acciones (test con sus cifras).
- **FR-002** Proyección de lotes de divisa por divisa, FIFO a través de las cuentas, desde los eventos de la tabla. Cuadre: la suma de los lotes de una divisa es la suma de sus saldos (`cashBalances`) en todas las cuentas, en cualquier fecha (prueba de propiedades).
- **FR-003** Un `fx_exchange` hacia euros produce una línea de ganancia o pérdida de divisa. El caso V2422-20 da 0 en la conversión; el ejemplo de la investigación (1.000 $ comprados a 1,10, vendidos a 1,20 y convertidos el mismo día) da 0 en las acciones y −75,76 € en la divisa.
- **FR-004** Una venta en divisa devuelve a los lotes de divisa el coste en euros de la divisa gastada más la ganancia en euros; una compra lo lleva en el lote del valor, también a través de traspasos, canjes y acciones corporativas.
- **FR-005** El criterio #4 cambia de lado en `docs/fiscal-questions.md`, en el catálogo y en el ADR nuevo; criterio nuevo para el FIFO de la divisa.
- **FR-006** `docs/business-rules.md` §5.7 (divisas) y `docs/data-schema.md` §8 describen los lotes de divisa. ADR-0030 gana una nota sobre la conversión automática.
- **FR-007** Ningún precio de mercado entra en el cálculo; importes decimales, redondeo una vez por operación (ADR-0005).

## Fuera de alcance

Permutas de cripto por cripto (otro elemento, otro caso). Rellenar las casillas que nadie ha comprobado. Que un cambio de divisa active la regla de recompra (pregunta 4).

## Respuestas de Coordinación (2026-10-27)

1. **FIFO por divisa a través de todas las cuentas**, escrito como criterio con su certeza (`4:currency_fifo`, media, en las dos direcciones).
2. **`broker_settled_eur` si lo hay y, si no, el BCE.** La conversión automática del bróker se cierra cuando haya un extracto real de IBKR; queda anotada en el ADR y en ADR-0030.
3. **La diferencia de cambio de una comisión pagada en divisa se imputa**, al tipo del día de la comisión.
4. **La regla de recompra no se aplica a la divisa**, pero como criterio de certeza **baja** y riesgo **agresivo** (`4:currency_wash_sale`), citando que el art. 33.5.e) podría alcanzarla como «otros elementos patrimoniales» (un año posterior). Va a la lista de la auditoría fiscal independiente.

ADR nuevo en `Propuesta`; la PR espera el visto bueno de Coordinación con la tabla del antes y el después de cada cifra recalculada a mano.
