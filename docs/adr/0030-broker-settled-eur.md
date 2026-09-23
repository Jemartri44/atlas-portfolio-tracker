# ADR-0030 — Importe en euros liquidado por el bróker, como dato informativo

**Estado:** Aceptada (2026-09-24). Ronda 8. Decisión de la dirección: **guardar el dato para que exista**. Qué cifra manda en la fiscalidad **no se decide aquí**: es parte de la disputa del criterio #4 de `docs/fiscal-questions.md`. *Verificar con asesor* lo que se haga con él.

## Contexto

Cuando un bróker convierte divisa automáticamente —el usuario compra en dólares con una cuenta en euros—, carga en euros una cifra que **no** es `amount / fx_rate`: aplica su propio cambio y, a veces, su margen. El libro guarda el importe original, su divisa y el tipo del BCE (ADR-0013), que es lo que exige la conversión fiscal que hoy aplica el motor; pero **no guarda cuántos euros salieron de verdad de la cuenta**.

Ese dato forma parte de la disputa del criterio #4 (cómo se calcula una ganancia en divisa, y si hay elemento patrimonial en divisa cuando el usuario nunca llegó a tenerla). Sin él, ninguna lectura alternativa se puede ni siquiera cuantificar, y dentro de veinte años el extracto que lo contiene puede no existir. Es la misma economía que ADR-0021: **guardarlo hoy es gratis y reconstruirlo después puede ser imposible**.

Qué dicen de esto los extractos reales de MyInvestor e IBKR **no se sabe todavía**: los importadores están bloqueados por falta de ficheros (Ronda 6). El campo se define por lo que significa, no por el sitio del extracto donde aparece.

## Opciones consideradas

1. **No guardarlo.** Sin trabajo; la disputa del #4 queda sin el dato que la haría cuantificable.
2. **Un campo opcional en las operaciones afectadas** (elegida). Barato y legible; se rellena solo cuando el extracto lo da.
3. **Guardar el cambio implícito del bróker en vez de los euros.** Es un valor derivado —euros entre importe—, pierde la cifra real que figura en el extracto e introduce un redondeo que el extracto no tiene.
4. **Un evento aparte, `broker_conversion`, enlazado con la operación.** Más flexible, pero es un tipo nuevo con referencias, así que arrastra la regla de anular lo consumido (ADR-0003) y su propia huella, para guardar un número.
5. **Escribirlo en `notes`.** No lo puede leer ninguna máquina.

## Decisión

Se añade **`broker_settled_eur?`** (decimal como cadena, ADR-0005) a `buy`, `sell`, `dividend`, `interest` y `standalone_fee`:

- **Qué es:** el movimiento total de euros que el extracto del bróker atribuye a esa operación, tal cual figura, en valor absoluto; el sentido lo da el tipo de evento. Si el extracto carga la comisión en euros por separado, **se incluye**: el campo es lo que salió o entró de la cuenta en euros por esa operación.
- **Cuándo:** solo si `currency` no es `EUR`; en euros sería redundante y se rechaza. Nunca se rellena con un valor calculado: si el extracto no lo da, el campo no está.
- **Qué no hace:** **ninguna proyección, ningún cálculo fiscal y ningún saldo lo leen.** Se enseña junto al importe convertido al tipo del BCE, y nada más. Lo vigila un test del mismo tipo que el que guarda la puerta de los precios (`packages/domain/src/projections/prices.ts`): solo una lista cerrada de módulos puede leer el campo.
- **No entra en la huella de idempotencia** (`data-schema.md` §4): la misma operación registrada a mano y después importada tiene que seguir detectándose como duplicado, lleve o no el campo.

**Compatibilidad según ADR-0018: es un cambio compatible** —añadir un campo opcional— y **no sube `schema_version`**. Ninguna línea escrita lo tiene, así que la regla de «solo en divisa» no endurece nada existente. Un cliente anterior sigue cargando la línea: los campos desconocidos no impiden la carga, y `check --deep` los señala como `unknown_field` (`packages/domain/src/projections/deep-check.ts`).

**Momento:** siendo compatible, podría añadirse en cualquier momento; pero **el dato solo se captura mientras el extracto está a mano**, así que debe estar antes de la primera operación real. Va como bloque 0 de la feature del BCE.

## Consecuencias

- `docs/data-schema.md` §6.2 gana el campo en los cinco eventos, con esta definición; `docs/fiscal-questions.md` #4 gana una nota: el dato existe y **ninguna cifra lo usa**.
- **Pregunta para la Ronda 6, no para esta:** cómo se refleja una conversión automática en `cashBalances`. Hoy una compra en dólares resta del saldo en dólares; si el bróker cargó euros, los saldos de la aplicación y los del bróker divergen salvo que la conversión se registre como `fx_exchange`. Hace falta ver un extracto real antes de decidirlo.
- La lista de eventos se puede ampliar (a `swap`, al efectivo de un `corporate_action` o de un `forced_sale`) con el mismo argumento de compatibilidad, cuando un extracto real lo pida.
- Se vuelve más fácil cuantificar la disputa del #4 cuando alguien la revise. Se vuelve más difícil nada: el campo es opcional.
- Relacionadas: ADR-0005, ADR-0012, ADR-0013, ADR-0018, ADR-0021 y ADR-0029.
