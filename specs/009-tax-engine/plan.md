# Plan de implementación: Motor fiscal (`009-tax-engine`)

**Rama**: `feature/009-tax-engine` · **Spec**: [`spec.md`](spec.md) · **Preguntas**: [`questions.md`](questions.md)

**Fecha**: 2026-09-18 · **Estado**: **aprobado por la dirección el 2026-09-18** (quince respuestas y N6 en `questions.md`; N6 añade el commit final del aviso) · **Entrada**: `docs/prompts/009-tax-engine.md`, ADR-0020, ADR-0021, ADR-0022, ADR-0013, ADR-0014, ADR-0009, ADR-0010, ADR-0011, ADR-0005, ADR-0015, ADR-0016

---

## Resumen

Cinco bloques y dos demostraciones, en este orden:

0. **Dos arreglos previos** en el dominio: el *rollback* de un `corporate_action` fallido deja adquisiciones y renta en especie fantasma (defecto vivo, **Q14**), y `income_category` gana su código de error (encargo de la dirección, **Q13**).
1. **El diario de lotes**: la proyección registra lo que el único motor FIFO hace con cada lote. No cambia ninguna cifra ni la instantánea.
2. **La regla de recompra**: recorriendo ese diario, qué se difiere, dónde viaja y cuándo se libera.
3. **El ejercicio**: categorías de renta, rendimientos, compensación del art. 49 en dos fases, arrastre con caducidad y ancla, retenciones, doble imposición.
4. **Criterios, procedencia y diferencias**: catálogo de criterios con test contra `docs/fiscal-questions.md`, criterios por cifra, apartado de dudosos con dinero en juego, diferencias con la configuración anterior.
5. **`atlas tax <año>`** y los catálogos de mensajes de las dos interfaces.

Las demostraciones: **el ejercicio a mano** (§6), escrito y comprometido **antes** del código del bloque 2, y **la prueba sin precios** (§7).

Cuatro decisiones de diseño sostienen el plan:

1. **Un solo motor de lotes; el fiscal lee su diario.** El FIFO decide qué lotes se consumen, como siempre. El motor fiscal no vuelve a decidirlo: recorre el **registro** de lo que el FIFO hizo y arrastra por él una magnitud más, la pérdida diferida. Así el diferimiento «viaja con el lote» (§8.4) sin tocar la lógica de `consume`, y no nace un segundo FIFO (constitución II, ADR-0016).
2. **El motor fiscal es una función pura del libro**, no una parte del estado proyectado. `taxYear(events, year, options)` proyecta, recorre y devuelve un informe. Nada entra en `snapshotOf`, así que la instantánea no puede moverse (R4).
3. **Las alternativas se calculan, no se estiman.** El dinero en juego de un criterio configurable es la diferencia de base al **recalcular desde el libro** con la otra lectura. Solo donde el libro no permite recalcular se da una exposición, y se dice.
4. **Un ejercicio depende de los siguientes.** La ventana posterior de una pérdida de diciembre acaba en el año siguiente, así que el recorrido cubre **el libro entero** y el informe marca lo provisional con fecha.

---

## Contexto técnico

| | |
|---|---|
| **Lenguaje** | TypeScript 7 estricto, ESM, Node 22 (`.nvmrc`) |
| **Paquetes tocados** | `packages/domain` (el grueso), `apps/cli` (comando `tax` y mensajes), `apps/web` (**solo** `src/format/messages/`) |
| **Dependencias nuevas** | **ninguna** |
| **Almacenamiento** | Sin cambios de forma salvo lo que decidan **Q3** y **Q4** (campos opcionales de `Settings`, compatibles según ADR-0018). Sigue `schema_version = 1` |
| **Tests** | Vitest. `packages/domain` al **100 %** de líneas y ramas, bloqueante |
| **Línea base medida en esta rama** | 103 ficheros de test, 1072 tests, 100 % (3284 sentencias, 1666 ramas, 721 funciones, 3159 líneas) |
| **Fixtures** | El *golden* (`synthetic-v1.jsonl` y su instantánea) **no se toca**. El ejercicio a mano se construye en el test con `LedgerBuilder` (legible y revisable línea a línea) |
| **Rendimiento** | Un informe proyecta el libro 1 + *n* veces (*n* ≤ 7: alternativas y configuración anterior). Lineal y en memoria (ADR-0002): irrelevante a esta escala |

---

## Verificación contra la constitución

| Principio | Cómo lo cumple este plan |
|---|---|
| **I — el libro es la fuente de verdad** | El informe se recalcula del libro en cada consulta; no se guarda nada. El ancla de lo declarado es un **hecho** (ADR-0020), no un derivado |
| **II — lotes; fiscalidad solo del libro** | Un único FIFO. El motor sigue lotes y linaje, no posiciones. **Cero precios**: el test de arquitectura ve el motor dentro del camino fiscal y lo prohíbe alcanzar `prices.ts`, `state.valuations` y `state.fxRates`; y la salida se compara byte a byte con y sin precios. Cada conversión usa el tipo **de su operación**, con su fecha |
| **III — compartimentación** | Primera excepción, y solo ella: el informe agrega los dos libros **por contribuyente** y se etiqueta «total fiscal». Ni subtotales por libro ni ninguna otra vista toca esta agregación |
| **IV — nada codificado que deba ser configurable** | La ventana, el traspaso como adquisición, la fecha fiscal y la categoría de renta ya son `Settings`. El 25 %, los cuatro años y los tipos de convenio lo serán si la dirección confirma **Q3** y **Q4** — el plan lo recomienda precisamente por este principio |
| **V — fallo seguro, nunca silencio** | Lo que no se puede calcular se dice con código y motivo (cuota, segundo límite de la doble imposición, diferencias de cambio del efectivo, renta en especie). Un libro con eventos inválidos **no** da cifras fiscales (**Q11**). Lo provisional lleva fecha |
| **VI — supervivencia** | Cero dependencias; el informe en `--json` es texto abierto con decimales como cadenas |
| **VII — tests donde un error cuesta dinero** | Todos los casos límite obligatorios con nombre propio; el ejercicio a mano; el caso práctico de la AEAT como test de la compensación; propiedades (conservación del diferimiento, invariancia sin precios) |

**Desviaciones**: ninguna. Donde el plan se aparta de la letra del prompt, está preguntado: los tramos (**Q10**), el tipo de convenio (**Q4**) y el aviso de configuración (**Q12**).

---

## Bloque 0 — Arreglos previos

### 0.1 El *rollback* de un evento corporativo (Q14)

`applyCorporateAction` guarda y restaura lotes, posiciones, efectivo, contadores de lotes, ganancias y avisos cuando un efecto falla. **No restaura `acquisitions` ni `inKindIncome`**. Reproducido en esta rama: un `stock_dividend` con `grant` de coste 1 € e `income_eur`, seguido de una venta forzosa de más unidades de las recibidas, se rechaza (`insufficient_position`) y aun así deja **una adquisición** del activo concedido y **una entrada** en `in_kind_income` (que sí está en la instantánea).

Solo se manifiesta en modo `collectErrors` (en estricto, la proyección lanza). Pero el motor fiscal lee `acquisitions` para diferir pérdidas: un fantasma ahí sería un diferimiento fantasma. Arreglo: guardar y restaurar también esas dos listas (y el diario de lotes del bloque 1). Test que reproduce el caso y comprueba que el evento rechazado no deja rastro.

### 0.2 Código propio para `income_category` (Q13)

`checkIncomeCategory` pasa de `fail(...)` (`invalid_settings`) a `new ValidationError("invalid_income_category", ...)` para un valor desconocido de un tipo presente, con `asset_type` y `value`, igual que `invalid_wash_sale_window`. «Debe ser un objeto» sigue siendo `invalid_settings`, como en la ventana. Traducción en `apps/cli/src/output/messages.ts` y en `apps/web/src/format/messages/errors.ts` (sin importes: el valor es una palabra). Se reescribe el comentario del dominio que justificaba lo contrario.

---

## Bloque 1 — El diario de lotes

### 1.1 Qué se registra

`LedgerState` gana `lotJournal: LotJournalEntry[]`, **fuera de la instantánea** (como `acquisitions` y `fxRates`). Cinco entradas, añadidas por las funciones que ya hacen el trabajo:

| Entrada | La escribe | Campos |
|---|---|---|
| `open` | `openLot` | `lot_id`, `asset_id`, `event_id`, `quantity`, `source_lot_id?` |
| `consume` | `consume` | `lot_id`, `event_id`, `quantity`, `quantity_before`, `purpose`: `transmission` \| `transfer` \| `convert` |
| `carve` | `applyCarveOut` | `lot_id`, `into_lot_id`, `cost_share` |
| `scale` | `applyScale` | `lot_id`, `quantity_after` |
| `gain` | `recordGain` | `gain_index` (posición en `state.gains`) |

`consume` recibe un parámetro nuevo, `purpose`, en sus cinco llamadas (`sell`, `swap`, `forced_sale` → `transmission`; `transfer` → `transfer`; `convert` → `convert`). Es la única firma que cambia.

### 1.2 Por qué no es un segundo FIFO

El diario no decide nada: es el orden exacto en que la pasada B aplicó las operaciones, con los identificadores de lote que el FIFO eligió. El motor fiscal lo recorre sin volver a ordenar lotes ni elegir cuáles se consumen. Un test de propiedad lo ata: **reconstruir las cantidades abiertas recorriendo el diario da exactamente `state.lots`** en cualquier libro aleatorio.

### 1.3 Instantánea

`snapshotOf` elige campos a mano; no ve `lotJournal`. El test del *golden* (`synthetic-v1.snapshot.json`) sigue verde **sin regenerar**. Si se moviera un byte, se para y se pregunta.

---

## Bloque 2 — La regla de recompra

`packages/domain/src/tax/wash-sale.ts`. Un recorrido del diario, en orden, con este estado por lote: cantidad actual, diferimientos que lleva (importe exacto y transmisión de origen) y fracción ya «usada» como recompra.

### 2.1 El recorrido

- **`open`**: crea el lote. Si viene de un lote consumido en el mismo evento (`transfer`, `convert`) o de una escisión, recibe lo que estaba **en tránsito** desde su origen. Si su evento es una adquisición a la que una pérdida **anterior** ya asignó diferimiento (recompra posterior a la venta), lo recibe ahora, repartido por cantidad entre los lotes del evento.
- **`consume`**: la parte `quantity / quantity_before` de cada diferimiento del lote sale de él (exacta: lo que queda es la resta, así la suma se conserva al céntimo diezmilésimo). Si es transmisión, va al **liberado** de la ganancia siguiente; si es traspaso o canje, queda en tránsito hacia el lote descendiente.
- **`carve`**: la parte `cost_share` de cada diferimiento pasa en tránsito al lote escindido; el resto se queda.
- **`scale`**: cambia la cantidad; el diferimiento se queda. Y anota el activo para la nota de A12.
- **`gain`**: la transmisión `g = state.gains[i]`. `total = g.gain_eur + liberado`. Si `total < 0`, se busca recompra (2.2). Se cierra la línea: propio, liberado (con sus orígenes), diferido (con sus portadores), computable = `total − diferido`.

### 2.2 El reparto de una pérdida (con los supuestos A1)

Para una transmisión de `q` unidades del activo `A` con fecha fiscal `d` y ventana `W`:

1. **Candidatas**: las adquisiciones de `A` (`state.acquisitions`, que ya dice qué cuenta) con fecha en `[d − W, d + W]`.
2. **Disponibles**: si los lotes de la adquisición **ya existen** (anterior en la pasada B), las unidades que siguen abiertas tras esta misma venta y no usadas por otra pérdida: `Σ cantidad × (1 − fracción usada)`. Si **aún no existen** (posterior), su cantidad menos lo ya asignado a pérdidas anteriores.
3. **Orden**: por distancia en días a `d`, y a igual distancia por orden de la pasada B (`data-schema.md` §8.4: «los más cercanos en fecha primero»).
4. **Diferido**: `u = min(Σ disponibles, q)`; importe `total × u / q`; repartido entre candidatas por unidades, la última con el resto exacto.
5. **Asignación**: a los lotes existentes, por cantidad disponible (sube su fracción usada); a las posteriores, queda pendiente hasta su `open`.
6. **Provisional** si `d + W` es posterior a `options.today`.

### 2.3 Categoría de lo liberado

Lo liberado conserva la **categoría de la pérdida de origen** (FR-015): su naturaleza (art. 33 o art. 25.2) se fija al nacer. La reaplicación de la regla sobre el total (A1-d) se hace cuando las dos categorías coinciden; si no —solo posible con un canje entre tipos de activo de categoría distinta—, lo liberado se integra sin reaplicar y se anota (`tax_release_category_differs`).

### 2.4 Tests de este bloque

Los cuatro bordes de la ventana (`"2m"` y `"1y"`, incluido fin de mes y 29-02); la adquisición consumida por la propia venta; dos pérdidas y una recompra; recompra parcial; varios lotes recomprados con la misma fecha; traspaso parcial del portador; tres saltos; `convert` y `carve_out` del portador (con `cost_share`); liberación en otro ejercicio; liberación que convierte en pérdida una ganancia; `forced_sale` con pérdida en dos cuentas; `swap` en las dos patas; traspaso entrante con `wash_sale_transfer_counts` `true` y `false`; provisionalidad. Y una **propiedad**: para todo libro aleatorio, `Σ diferido = Σ liberado + Σ pendiente` al céntimo diezmilésimo, y con ventanas de `"1d"` el informe no difiere nada que la regla no alcance.

---

## Bloque 3 — El ejercicio

`packages/domain/src/tax/`:

| Fichero | Qué hace |
|---|---|
| `lines.ts` | Transmisiones → líneas con categoría (`incomeCategoryOf`), importes originales y en euros, lotes y linaje (`lineage.ts`). Dividendos e intereses brutos. Comisiones sueltas deducibles (si **Q5**). Retenciones |
| `lineage.ts` | Linaje de un lote hasta su adquisición original, con fecha, importe original, divisa, tipo y fecha del tipo del evento raíz |
| `compensation.ts` | Art. 49 en dos fases, función pura sobre importes en céntimos |
| `carryforward.ts` | Encadena ejercicios, aplica el ancla, calcula caducidades |
| `double-taxation.ts` | Primer límite por dividendo, si hay tipo de convenio (**Q4**) |
| `year.ts` | `taxYear(events, year, options)`: proyecta, recorre, compone el informe |

### 3.1 Redondeo

Una vez por operación (criterio #6, ADR-0005): la cifra de una transmisión es `round(propio + liberado − diferido)`. Sin diferimiento ni liberación coincide con el `gain_eur_rounded` de hoy (R4). Dividendos e intereses, `round(bruto_eur)` por evento. Los saldos y la compensación operan sobre esas cifras redondeadas; el límite del 25 % se redondea half-up a céntimos (**Q2**, punto 3).

### 3.2 Compensación (A2, verificado contra el manual práctico de la AEAT, **Q2**)

Para el ejercicio `Y`, con `GP` y `RCM` los saldos del ejercicio:

1. **Fase 1**: si un saldo es negativo y el otro positivo, el negativo se compensa con el positivo hasta el **25 % de ese saldo positivo**. Lo que sobra queda pendiente con origen `Y`.
2. **Fase 2**, pendientes de `Y − 4 … Y − 1`, **los más antiguos primero**:
   1. contra el saldo positivo restante **de su misma categoría**, sin límite;
   2. contra el saldo positivo restante **de la otra categoría**, con el límite del 25 % **conjunto** con la fase 1.
3. Lo pendiente con origen `Y − 4` que quede **caduca** al cierre de `Y`.
4. Base del ahorro = parte positiva de los dos saldos finales.

El caso práctico del manual de 2025 (4.000 de ganancias netas, −800 de rendimientos del ejercicio, pendientes de 700 y 2.100 de ganancias y 500 de rendimientos; base 200) entra **tal cual** como test.

### 3.3 Arrastre y ancla

El recorrido empieza en el primer ejercicio con cifras fiscales y encadena hasta `year`. Si `options.filed` trae lo declarado de un ejercicio, lo pendiente tras ese ejercicio sale de ahí y el informe muestra la diferencia con lo calculado. La forma del ancla la fija **Q9**; la feature 010 la alimentará desde `tax_return_filed`.

### 3.4 Lo que el informe dice siempre

Que es la base y no la cuota; que el segundo límite de la doble imposición no es calculable y el exceso se pierde; que las diferencias de cambio del efectivo no se calculan (con los `fx_exchange` y movimientos en divisa del ejercicio); la renta en especie registrada y no integrada; las contradicciones de `neutrality_regime`; las pérdidas que caducan; los valores de configuración tomados del código y no del libro (ADR-0022).

---

## Bloque 4 — Criterios, dudosos y diferencias

### 4.1 Catálogo

`tax/criteria.ts`: `FISCAL_CRITERIA`, un registro por criterio de `docs/fiscal-questions.md` con identificador (`"1"`, `"2"`, `"2b"`, … `"17"`), certeza (`high` \| `medium` \| `low` \| `disputed`), dirección del riesgo (`conservative` \| `aggressive` \| `both`) y, en el #2, la variante cripto. Más `"etc_etp_category"` (la cuestión de ETC y ETP, que la revisión llama «el hallazgo de mayor cuantía» y no tiene número) y los criterios nuevos que la dirección numere tras **Q1**, **Q2** y **Q5**.

**Test anti-deriva** (`tests/fiscal-criteria.test.ts`, en la raíz, como `messages.test.ts`): lee la tabla de `docs/fiscal-questions.md` y falla si un identificador falta en un lado, o si la primera certeza o la primera dirección de la fila no coinciden con el catálogo. Así, cuando la dirección añada los criterios nuevos al documento, el código tendrá que seguirle.

### 4.2 Dinero en juego (A8, **Q8**)

| Criterio | Cuándo lo declara una cifra | Dinero en juego | Dirección |
|---|---|---|---|
| **#1** fecha fiscal (media) | Toda transmisión | **Diferencia**: recálculo con la regla invertida | Por el signo |
| **#2** cotizados (en disputa) | Pérdida de `stock`/`etf`/`etc`/`etp` con ventana `"2m"` | **Diferencia**: recálculo con `"1y"` para esos tipos | Por el signo (esperada: agresiva) |
| **#2** cripto (baja) | Pérdida de `crypto` con `"1y"` | **Diferencia**: recálculo con `"2m"` | Por el signo (esperada: conservadora) |
| **#2b** (media) | Diferimiento causado por un traspaso entrante | **Diferencia**: recálculo con `false` | Por el signo |
| **#4** método (en disputa) | Transmisión en divisa | **Diferencia** por el método «primero en divisa, luego al tipo de la transmisión» cuando todo el linaje tiene coste en la divisa de la venta; si no, exposición | Por el signo |
| **#4** efectivo (en disputa) | Cambios de divisa del ejercicio | **No calculado**; se listan | Ambas |
| **#5** (media) | `fx_rate_date` anterior a la fecha fiscal | Exposición: el importe convertido. Sin la tabla del BCE no hay diferencia calculable | Conservadora |
| **#7** (en disputa) | Lote con `carve_out` en su linaje; `carve_out` del ejercicio | Exposición: el coste llegado por `cost_share`. El canje sin régimen no es cuantificable sin valor de mercado, **y el motor no lo lee** | Agresiva |
| **#8** (en disputa) | `grant` de coste cero de un `crypto_fork` y la venta de sus lotes | Exposición: `income_eur` si está registrado; si no, «no cuantificable desde el libro» | Agresiva |
| **#13** (en disputa) | Venta forzosa previa a un `convert` en `merger`/`issuer_restructuring` | Exposición: su resultado computado | «Conservador en el año, incorrecto en la base» |
| **#7/#13** régimen ausente | `convert`/`carve_out` del ejercicio sin `neutrality_regime` | Exposición: coste de los lotes canjeados | Agresiva |
| **#15** (en disputa) | Liberado o pendiente que ha viajado | Exposición: liberado tras viajar + pendiente a 31/12 | Conservadora |
| **#17** (media) | Permuta con comisión | La comisión en euros | **Agresiva en el momento** |
| **Categoría ETC/ETP** | Transmisiones de `etc`/`etp` | **Diferencia**: recálculo con `movable_capital` | Por el signo |
| **Nuevos** (Q1, Q2, Q5) | Según su regla | Diferencia donde haya alternativa implementada; si no, exposición | La que fije la dirección |

«Por el signo»: si la lectura alternativa da **más** base, la vigente declara de menos → si la vigente está mal, **agresiva**; si da menos, **conservadora**. Se informa la diferencia de la base del ejercicio **y** la de lo pendiente a 31/12, porque un criterio puede no mover el año y sí el arrastre.

### 4.3 Diferencias con la configuración anterior (A15)

Si el libro tiene algún `settings_changed`, el informe se recalcula también con la configuración anterior al último (o con los valores por defecto si solo hay uno) y lista: operaciones que entran o salen del ejercicio, que cambian de categoría o de diferimiento, y el movimiento de base y pendientes.

### 4.4 Qué criterios lleva cada cifra

Una función por tipo de cifra, con la tabla de FR-031. Test: en el ejercicio a mano, la lista de criterios de cada línea se comprueba entera (no «contiene»).

---

## Bloque 5 — `atlas tax <año>`

`apps/cli/src/commands/tax.ts`: `atlas tax <año> [--lots] [--json]`. Carga con `loadAndProject` y llama a `taxYear` con `today = todayInMadrid(clock)`; solo formatea. Apartados en el orden de la Historia 5. Cabecera fija: **«TOTAL FISCAL <año> — núcleo y cubo agregados por contribuyente. Esto es la BASE del ahorro, no la cuota.»**

Mensajes: los códigos nuevos (tabla de abajo) en `apps/cli/src/output/messages.ts` y en `apps/web/src/format/messages/{errors,warnings}.ts`, con todo importe por `f.money` y toda cantidad por `f.quantity`. El test anti-deriva y el de privacidad ya existentes obligan a las dos cosas.

| Código | Tipo | Detalles con importe |
|---|---|---|
| `invalid_income_category` | error | — |
| `tax_ledger_invalid` | error | — |
| `tax_year_unsupported` | error | — |
| `tax_quota_not_computed` | nota | — |
| `tax_double_taxation_partial` | nota | `foreign_tax_eur` |
| `tax_treaty_rate_missing` | nota | `foreign_tax_eur` |
| `tax_dividend_without_country` | nota | `foreign_tax_eur` |
| `tax_fx_differences_not_computed` | nota | — |
| `tax_in_kind_income_not_integrated` | nota | `income_eur` |
| `tax_window_open` | nota | `loss_eur` |
| `tax_neutrality_contradiction` | nota | — |
| `tax_scale_in_window` | nota | — |
| `tax_loss_expires` | nota | `amount_eur` |
| `tax_release_category_differs` | nota | `amount_eur` |
| `tax_settings_default_used` | nota | — |

La lista final depende de las respuestas (Q3/Q4 pueden añadir validaciones de `Settings`).

---

## §6 — El ejercicio calculado a mano

### Método

1. **Diseño** del libro (abajo), con importes redondos elegidos para que cada paso se pueda hacer con papel.
2. **Cálculo a mano**, escrito en `questions.md` operación por operación: conversión, lotes consumidos, resultado propio, diferimiento generado y liberado, categoría, criterios, redondeo; después saldos, compensación en sus dos fases, pendientes, base, retenciones, doble imposición y el dinero en juego de #2, #4, #17 y la categoría del ETC, cada alternativa recalculada también a mano.
3. **Commit del cálculo a mano antes que el código del bloque 2.** La historia de git es la prueba de que las cifras no se copiaron del motor.
4. **Test** (`packages/domain/test/tax/exercise.test.ts`) que construye el libro con `LedgerBuilder` y compara **cada** cifra del informe con la escrita a mano, como literales. El test codifica el cálculo a mano, no la salida del motor.
5. **Contraste.** Toda discrepancia se investiga y se documenta en `questions.md` (quién tenía razón y por qué), sin tocar el literal hasta saberlo.

### Diseño provisional

Tres cuentas (MyInvestor núcleo, IBKR núcleo, IBKR cubo), dos ejercicios (2027 origen de un arrastre; **2028 el ejercicio calculado entero**). Importes definitivos tras las respuestas, porque Q1, Q2 y Q5 cambian cifras.

| # | Fecha | Operación | Qué ejercita |
|---|---|---|---|
| 1 | 2027-02-01 | Compra 100 participaciones de un fondo, 1.000 € | Lote antiguo que después se traspasa |
| 2 | 2027-03-01 | Compra 10 acciones USA en el cubo, 100 USD + 1 USD de comisión, tipo 1,10 | Coste en divisa con comisión (#3, #4) |
| 3 | 2027-05-03 | Compra 10 ETC de oro, 700 € | Lote que consumirá la venta con pérdida del ETC |
| 4 | 2027-06-01 | Compra 10 acciones EUR en el cubo, 200 € | Para el contrasplit de 2028 |
| 5 | 2027-09-01 | Venta de las 10 acciones USA, 80 USD − 1 USD, tipo 1,25 | Pérdida computable de 2027 (−270,80) |
| 6 | 2027-10-01 | Interés 40 €, retención 7,60 € | Rendimiento de 2027: fase 1 con el 25 % |
| 7 | 2028-01-10 | Compra 5 ETC, 250 € | Recompra **exactamente** en `d − 2m` |
| 8 | 2028-02-01 | Compra 10 acciones USA, 100 USD + 1 USD, tipo 1,10 | Lote de la ganancia en divisa |
| 9 | 2028-02-10 | Compra de 1 unidad de cripto X, 1.000 € | Pata entregada de la permuta |
| 10 | 2028-03-01 | Reembolso de 40 participaciones del fondo, 320 € | Pérdida de fondo (ventana de un año) |
| 11 | 2028-03-10 | Venta de 10 ETC, 550 € | Pérdida diferida a medias por la compra 7 |
| 12 | 2028-05-02 | Contrasplit 1:4 con pico de 0,5 a 90 € | Pico en efectivo, transmisión |
| 13 | 2028-05-11 | Compra 5 ETC | Recompra en `d + 2m + 1`: **no** difiere |
| 14 | 2028-06-01 | Suscripción de 20 participaciones del fondo, 180 € | Recompra posterior: difiere la mitad del reembolso 10 |
| 15 | 2028-06-15 | Dividendo 20 USD, retención en origen 3 USD, EE. UU., tipo 1,25 | Rendimiento en divisa y doble imposición (#16) |
| 16 | 2028-07-03 | Permuta: 1 X por 10 Y, valor entregado 1.200, recibido 1.190, comisión 10 | Art. 37.1.h y **#17** |
| 17 | 2028-09-01 | Traspaso de todo el fondo a otro fondo, 80 → 160 | El diferimiento viaja (#15) |
| 18 | 2028-11-02 | Venta de 5 ETC, 300 € | Libera el diferimiento de la 11; el total pasa a pérdida (A1-d) |
| 19 | 2028-11-15 | Reembolso de 150 participaciones del fondo destino, 900 € | Libera 3/4 del diferimiento viajado; queda 1/4 pendiente |
| 20 | 2028-12-01 | Venta de las 10 acciones USA, 130 USD − 1 USD, tipo 1,20 | Ganancia en divisa y su alternativa del #4 |
| 21 | 2028-12-29 | Interés 60 €, retención 11,40 € | Rendimiento y retención |
| 22 | 2028-12-29 | Comisión de custodia 12 € (`fee_kind: custody`) | Art. 26.1.a, si **Q5** |
| 23 | 2028-12-31 | Valoraciones a 31/12 de todo | Solo para la prueba sin precios: no deben mover nada |

Con los supuestos recomendados, el cálculo previo da para 2028: ganancias patrimoniales **+362,50**, rendimientos **+64,00**, compensación del pendiente de 2027 (−260,80) en fase 2, **base del ahorro 165,70**, pérdida diferida pendiente a 31/12 de **−10,00**, y dinero en juego de **+65,00** en el #2 (agresiva: con ventana de un año la venta 11 se difiere entera, **y además** la pérdida de 2027 de las acciones USA se difiere a la compra 8 y se libera en la venta 20, lo que sube la base de 2027 en 10,00 y deja 2028 sin pendiente que compensar), **+75,83** en el #4 (agresiva), **10,00** en el #17 y **0,00** en la categoría del ETC (el cruce del 25 % lo absorbe este año). **Son cifras de diseño, no el cálculo a mano**: la primera versión de este párrafo daba +75,00 en el #2 porque olvidé que la alternativa alcanza también a las acciones, que es exactamente el tipo de error que el cálculo completo existe para cazar. Ese cálculo se hace entero, paso a paso, después de las respuestas.

---

## §7 — Demostración de que ninguna cifra del IRPF depende de un precio

Tres pruebas independientes, porque una sola se puede engañar:

1. **Estructural (arquitectura).** El test transitivo que ya protege `project-ledger.ts` gana como raíces **todos** los ficheros de `tax/`: nada que alcancen puede alcanzar `prices.ts`, a ninguna profundidad. Y un test textual prohíbe en `tax/` leer `state.valuations` o `state.fxRates` (el motor convierte con el tipo **de cada operación**). La firma de `taxYear` no acepta precios.
2. **Por borrado (la del prompt).** Una función de test `withoutPrices(events)` elimina **todo lo que es precio o cotización y no contraprestación**: los eventos `valuation`; el `unit_price` donde hay `amount` (es informativo, ADR-0012); los `nav_out`/`nav_in` de los traspasos; el `per_unit` de los dividendos. Para el libro sintético (todos sus ejercicios), el del ejercicio a mano y el de los casos límite, el informe **serializado** con y sin precios es **idéntico byte a byte**.
3. **Por propiedad.** Con `fast-check`, 200 libros aleatorios (los generadores de `test/properties/`) + valoraciones aleatorias insertadas en fechas aleatorias: el informe no cambia. Y en sentido contrario, el de (2).

Lo que **no** se borra y por qué: el `amount`/`unit_price` que es base de coste o de transmisión, el `unit_price` de una venta forzosa, los `market_value_*` de una permuta (el art. 37.1.h **es** la contraprestación) y el `unit_cost` de un `grant`. Son hechos de la operación, no cotizaciones de mercado. El `income_eur` de un `grant` solo alimenta una **exposición** del apartado de dudosos, nunca una cifra de la base; la prueba (2) lo borra también y comprueba que la base no se mueve.

---

## §8 — Demostración de que los valores por defecto no cambian nada

1. `synthetic-v1.snapshot.json` **sin regenerar** y su test verde.
2. Los tests existentes de `gains`, `income`, `lots` y `check` (dominio, CLI y e2e) **sin tocar** y verdes.
3. Test nuevo: en el libro sintético, con la configuración por defecto, **toda** transmisión es `capital_gain` y su resultado propio es su `gain_eur_rounded`; `income_category` ausente, explícito en `capital_gain` para todos y `DEFAULT_SETTINGS` dan el **mismo informe** byte a byte.
4. Lo que el informe añade (diferido, liberado, compensado) es cifra nueva por definición: se enumera, no se «compara con develop».
5. Para detectar regresiones futuras, el informe de cada ejercicio del libro sintético se guarda como **instantánea nueva y aparte** (`tests/fixtures/ledger/synthetic-v1.tax.json`), sin tocar la del libro. Una vez revisada a mano en sus cifras gruesas —el reembolso con pérdida de `ast_world` de 2027 con aportaciones mensuales tiene que salir diferido—, cualquier cambio posterior del motor que la mueva tendrá que explicarse.

---

## Orden de trabajo y commits

| # | Commit | Bloque |
|---|---|---|
| 1 | `docs(009): spec, plan and questions for the tax engine` | artefactos |
| 2 | `fix(corporate): roll back acquisitions and in-kind income of a failed action` | 0.1 |
| 3 | `feat(settings): give the income category its own error code` | 0.2 |
| 4 | `docs(009): hand-computed tax year` | §6, **antes del motor** |
| 5 | `feat(projections): journal every lot the FIFO opens, consumes or transforms` | 1 |
| 6 | `feat(tax): defer and release wash-sale losses along the lot lineage` | 2 |
| 7 | `feat(tax): classify transmissions and income of a tax year` | 3 |
| 8 | `feat(tax): offset and carry forward the savings base` | 3 |
| 9 | `feat(tax): report withholdings and the double taxation deduction` | 3 |
| 10 | `feat(tax): tag every figure with its fiscal criteria` | 4 |
| 11 | `feat(tax): measure what each doubtful criterion puts at stake` | 4 |
| 12 | `feat(tax): compare the tax year with the previous settings` | 4 |
| 13 | `feat(cli): add atlas tax with its messages in both interfaces` | 5 |
| 14 | `test(tax): check the hand-computed year against the engine` | §6 |
| 15 | `test(tax): prove no tax figure reads a price` | §7 |
| 16 | `test(tax): prove the defaults change nothing` | §8 |
| 17 | `fix(projections): stop warning about purchases the loss sale itself consumed` | N6, **último**, con predicción escrita antes |

Si Q3/Q4/Q12 se confirman, entran como commits propios del bloque 3 (configuración) y del 4 (aviso). `npm run lint` verde **antes de cada commit** y como último paso antes de entregar. Nunca `git push`.

---

## Estrategia de test

| Qué | Dónde |
|---|---|
| Rollback completo de un evento corporativo fallido | `test/projections/corporate-actions.test.ts` |
| Reconstrucción de `state.lots` desde el diario (propiedad) | `test/properties/journal.test.ts` |
| Los cuatro bordes de la ventana, `"2m"` y `"1y"`, fin de mes | `test/tax/wash-sale-window.test.ts` |
| Casos límite obligatorios, uno por test con su nombre | `test/tax/edge-cases.test.ts` |
| Conservación del diferimiento (propiedad) | `test/properties/tax.test.ts` |
| Compensación: los ocho cuadrantes de signos, el 25 % conjunto, antigüedad, caducidad; **el caso práctico de la AEAT** | `test/tax/compensation.test.ts` |
| Ancla: lo declarado sustituye a lo calculado y se muestra la diferencia | `test/tax/carryforward.test.ts` |
| Doble imposición: con tipo, sin tipo, sin país | `test/tax/double-taxation.test.ts` |
| Criterios por cifra, dudosos y alternativas | `test/tax/criteria.test.ts` |
| Diferencias con la configuración anterior | `test/tax/settings-diff.test.ts` |
| **Ejercicio a mano** | `test/tax/exercise.test.ts` |
| **Sin precios** (borrado y propiedad) | `test/tax/no-prices.test.ts` |
| **Valores por defecto** | `test/tax/defaults.test.ts` |
| Instantánea del informe fiscal del libro sintético | `test/tax/synthetic.test.ts` + `tests/fixtures/ledger/synthetic-v1.tax.json` |
| Catálogo contra `docs/fiscal-questions.md` | `tests/fiscal-criteria.test.ts` |
| El motor dentro del camino fiscal; ni `valuations` ni `fxRates` | `tests/architecture.test.ts` |
| `atlas tax`: texto, `--lots`, `--json`, errores | `apps/cli/test/commands/tax.test.ts`, `e2e.test.ts` |
| Mensajes nuevos en las dos interfaces y enmascarados | `tests/messages.test.ts`, `tests/architecture.test.ts` (existentes) |

---

## Riesgos

| Riesgo | Mitigación |
|---|---|
| **Una cifra plausible y falsa.** Es el riesgo de la feature | El ejercicio a mano comprometido antes del código; el caso práctico de la AEAT como test; propiedades de conservación; cada criterio dudoso con su dinero en juego |
| El diario de lotes se desincroniza del FIFO en un cambio futuro | La propiedad de reconstrucción de `state.lots` falla en cuanto una función mueve un lote sin anotarlo |
| El diario mueve la instantánea | No se serializa; el *golden* sin regenerar es el detector. Si se mueve, se para |
| Un criterio nuevo (Q1, Q2, Q5) se cuela sin marcar, como pasó con el #17 | Van en `questions.md` con su ficha (certeza y dirección propuestas) para que la dirección los numere en `docs/fiscal-questions.md`; el test anti-deriva obligará al código a seguirle |
| El aviso de `settings set` calla ante cambios que mueven la base | **Q12** |
| Conflicto con el agente de la web | Solo se tocan `apps/web/src/format/messages/errors.ts` y `warnings.ts`, añadiendo entradas. Nada más de `apps/web` |
| Alternativas que invalidan eventos (invertir la fecha fiscal puede reordenar una compra tras su venta) | El recálculo alternativo proyecta en modo degradado; si deja inválidos, el dudoso dice «no cuantificable: con la otra lectura, N eventos serían inválidos» |

---

## Entregables

```text
specs/009-tax-engine/
├── spec.md          # qué y por qué
├── plan.md          # este fichero
├── questions.md     # lo que no resuelvo por mi cuenta, y el cálculo a mano (commit 4)
└── tasks.md         # tras el visto bueno
```
