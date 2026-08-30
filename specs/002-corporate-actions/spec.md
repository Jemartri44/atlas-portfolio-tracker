# Especificación de la feature: Eventos corporativos y tesis del cubo (`002-corporate-actions`)

**Rama**: `feature/002-corporate-actions`

**Creada**: 2026-08-30

**Estado**: Aprobado por el usuario (2026-08-30); Q1 resuelta (a); `ratio` admite fracción `nuevas/antiguas`

**Entrada**: prompt de traspaso `docs/prompts/002-corporate-actions.md` §3 (alcance), §4 (fuera de alcance) y §6 (decisiones fijadas). Deriva de `docs/specification.md` §4.3 y §6.2, `docs/business-rules.md` §4 (reglas 13-19), §5.3 y §6, `docs/data-schema.md` §6.2, §6.4, §6.5, §7 y §8.5, `docs/fiscal-questions.md` (7, 8, 9) y los ADR 0003, 0005, 0009, 0011, 0012 y 0013. Construye sobre `specs/001-ledger-core/`.

## Resumen

Segunda feature de código: completa el libro mayor de la Fase 1 con los tres tipos de evento que la 001 dejó reservados. (1) **Eventos corporativos** (`corporate_action`): cada uno lleva un `kind` para las personas y una lista ordenada de **cinco primitivas de lote** (`scale`, `convert`, `carve_out`, `forced_sale`, `grant`) que es lo único que el dominio sabe ejecutar; una tabla de composición por `kind` fija qué secuencias se admiten y el evento se rechaza si no encaja (ADR-0011). (2) **Tesis del cubo especulativo** (`thesis_opened`, `thesis_closed`): ninguna compra en el cubo sin tesis previa (constitución III), ventas enlazables a su tesis, y una proyección `theses` con lo que se puede derivar sin precios. (3) Proyección **`valuations(date)`** sobre las fotos de valoración ya registradas (Modelo 720). La CLI gana asistentes por `kind` que muestran el efecto sobre lotes y posiciones antes de escribir.

Esta feature **no** decide nada fiscal ni estructural: implementa lo que ya está en los documentos. Lo que no encaja se anota en `questions.md` y se resuelve con el usuario (Q1, componente en efectivo de una fusión, resuelta el 2026-08-30 a favor de "`forced_sale` es siempre una venta"; `data-schema.md` §6.5 ya lo recoge).

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — Registrar un evento corporativo y ver su efecto sobre los lotes (Prioridad: P1)

Un emisor hace un split, un contrasplit con liquidación de picos, una fusión, una escisión, una fusión de fondos, un cambio de clase de participación, una liquidación, una exclusión de cotización, un fork, una migración de token o una reestructuración. El usuario lo registra como un único evento `corporate_action` con su `kind`, la fecha de efecto, la fuente documental obligatoria y los efectos; el sistema transforma los lotes fiscales (globales por activo) y las posiciones físicas (por cuenta) de forma exacta, genera hecho imponible **solo** en las ventas forzosas, y conserva fecha de adquisición y coste allí donde la norma lo exige.

**Por qué esta prioridad**: a 20 años todos estos eventos van a ocurrir (`docs/specification.md` §4.3). Sin ellos el libro deja de cuadrar con el bróker a la primera fusión de fondos, y un apaño manual sobre los lotes rompe la fiscalidad para siempre (trampa 6 de `CLAUDE.md`).

**Prueba independiente**: sobre un lote de 10 títulos, coste 1.000 €, adquirido el 2027-01-10, registrar cada fila de la tabla `data-schema.md` §8.5 y comprobar el resultado numérico que allí se indica, a céntimo.

**Escenarios de aceptación**:

1. **Dado** un lote de 10 títulos con coste 1.000 € y fecha 2027-01-10, **cuando** se registra un `split` con `scale(4)`, **entonces** el lote pasa a 40 títulos, mismo coste, misma fecha y mismo identificador; la posición física de cada cuenta se multiplica por 4; no hay hecho imponible.
2. **Dado** el mismo lote, **cuando** se registra un `reverse_split` con `scale(0.25)` seguido de `forced_sale` de 0,5 títulos a 400 € en la cuenta que los tiene, **entonces** quedan 2 títulos con coste 800 €, y se registra una transmisión de 200 € con coste 200 € y ganancia 0 € (hecho imponible aunque sea cero).
3. **Dado** 10 y 7 títulos del mismo activo en dos cuentas A y B, **cuando** se registra un contrasplit 1:4 con liquidación de picos a 400 € por cuenta, **entonces** A queda con 2 títulos y vende 0,5, B queda con 1 y vende 0,75; el efectivo de cada venta entra en su cuenta; los lotes consumidos son los más antiguos del activo con independencia de la cuenta (ADR-0009).
4. **Dado** el lote de 10, **cuando** se registra un `merger` con `convert(NEW, 0.5)`, **entonces** el lote origen queda cerrado con una consumición que referencia el evento y aparece un lote de 5 títulos de `NEW` con coste 1.000 €, fecha 2027-01-10 y `source_lot_id` al origen; la posición física de `OLD` es cero en todas las cuentas y la de `NEW` es 5.
5. **Dado** el lote de 10, **cuando** se registra un `spin_off` con `carve_out(SPIN, 0.25, 0.20)`, **entonces** el lote origen conserva 10 títulos con coste 800 € y aparece un lote de 2,5 títulos de `SPIN` con coste 200 € y fecha 2027-01-10; la suma de costes sigue siendo exactamente 1.000 €.
6. **Dado** 10 participaciones de un fondo A con coste 1.000 €, **cuando** se registra un `fund_merger` con `convert(B, 1.7)`, **entonces** hay 17 participaciones de B con coste 1.000 € y fecha original; sin hecho imponible.
7. **Dado** lotes de un fondo en dos cuentas, **cuando** se registra un `fund_liquidation` con `forced_sale` de `"all"` en ambas a 120 €, **entonces** ambas posiciones quedan a cero, cada cuenta recibe su efectivo y la ganancia total es 1.200 € − 1.000 € = 200 €.
8. **Dado** un lote de 10 con coste 1.000 €, **cuando** se registra un `issuer_liquidation` con `forced_sale` de `"all"` a precio 0, **entonces** la posición queda a cero y se registra una pérdida de 1.000 €.
9. **Dado** un activo cotizado, **cuando** se registra un `delisting` con `effects: []`, **entonces** ni lotes ni posiciones cambian, el evento queda como constancia documental y la CLI recuerda que marcar `active = false` es un `asset_updated` aparte.
10. **Dado** 10 unidades de una cripto, **cuando** se registra un `crypto_fork` con `grant` de 10 unidades del activo nuevo a coste 0 con la fecha del fork, **entonces** aparece un lote de 10 con coste 0 € y esa fecha; una venta posterior tributa por el importe íntegro.
11. **Dado** cualquier `kind`, **cuando** la secuencia de `effects[]` no encaja en su fila de la tabla §8.5 (por ejemplo un `split` con `convert`, o un `effects: []` en un `kind` que exige efectos), **entonces** el evento se rechaza indicando el `kind` y la secuencia admitida.
12. **Dado** ventas ya registradas con fecha posterior, **cuando** se registra tarde un `corporate_action` con `effective_date` anterior, **entonces** la proyección cronológica lo coloca en su fecha y las ventas posteriores consumen los lotes ya transformados; si alguna venta deja de ser válida, el registro se rechaza indicando cuál.
13. **Dado** un `corporate_action` cuyos lotes resultantes ya se vendieron, **cuando** el usuario intenta anularlo, **entonces** se rechaza listando las ventas afectadas (ADR-0003).
14. **Dado** lotes de un fondo heredados de un traspaso, **cuando** ese fondo se fusiona (`convert`), **entonces** los lotes resultantes conservan la fecha de adquisición original (la anterior al traspaso), dos saltos atrás.

---

### Historia 2 — Tesis del cubo especulativo (Prioridad: P1)

Antes de abrir una posición en el cubo, el usuario escribe la tesis (hipótesis, plazo, condición de invalidación, tamaño previsto). Cada compra del cubo debe referenciar una tesis abierta, anterior en el libro, de la misma cuenta y activo; cada venta puede enlazarse a su tesis. Al cerrar la tesis, el usuario anota las conclusiones. El sistema deriva por tesis lo invertido, el resultado realizado, las comisiones acumuladas, la posición viva y los días abierta; lo que necesita precios queda para la Fase 3.

**Por qué esta prioridad**: la regla 15 del plan es un requisito funcional, no una recomendación: "el sistema no debe permitir registrar una compra en el cubo sin tesis" (constitución III). La 001 rechazaba toda compra en el cubo; sin esta historia el cubo no es usable.

**Prueba independiente**: con una cuenta y un activo del cubo, intentar una compra sin tesis (rechazo), abrir la tesis, comprar con `thesis_id` (aceptada), vender enlazando la tesis, cerrarla y comprobar que `theses` muestra invertido, resultado, comisiones, posición y días.

**Escenarios de aceptación**:

1. **Dado** una cuenta y un activo del libro `bucket`, **cuando** se registra un `buy` sin `thesis_id`, **entonces** se rechaza con un mensaje que cita la regla 15.
2. **Dado** un `thesis_opened` anterior en el fichero para esa cuenta y activo, **cuando** se registra un `buy` con su `thesis_id`, **entonces** se acepta y la compra queda enlazada a la tesis.
3. **Dado** una tesis cerrada, una tesis de otro activo o un `thesis_id` inexistente, **cuando** se registra un `buy` que lo referencia, **entonces** se rechaza indicando el motivo (cerrada, de otro activo o cuenta, inexistente).
4. **Dado** una tesis abierta sobre (`cuenta`, `activo`), **cuando** se intenta abrir una segunda sobre el mismo par, **entonces** se rechaza; un `thesis_id` repetido también.
5. **Dado** un `thesis_opened` cuya cuenta no es del cubo o cuyo activo no es del cubo, **cuando** se registra, **entonces** se rechaza (compartimentación, ADR-0009).
6. **Dado** una tesis abierta, **cuando** se registra un `sell` del cubo con su `thesis_id`, **entonces** la venta queda enlazada y su ganancia alimenta `result_eur`; sin `thesis_id`, la venta se acepta con el aviso `sell_without_thesis`.
7. **Dado** compras enlazadas cuyo coste acumulado supera `planned_size_eur`, **cuando** se registra la compra que lo supera, **entonces** se acepta con el aviso `thesis_size_exceeded`.
8. **Dado** una tesis con posición física viva, **cuando** se registra `thesis_closed`, **entonces** se acepta con el aviso `thesis_closed_with_position`; cerrar una tesis inexistente o ya cerrada se rechaza.
9. **Dado** tesis abiertas y cerradas, **cuando** se consulta `theses`, **entonces** cada una muestra estado, fechas administrativas de apertura y cierre (`recorded_at` en `Europe/Madrid`), eventos `buy`/`sell` enlazados, invertido en EUR, `result_eur` exacto y redondeado una vez, comisiones acumuladas en EUR, posición física viva de (`cuenta`, `activo`) y `days_open` a la fecha pedida.
10. **Dado** un `thesis_opened` registrado en el fichero **después** de la compra que lo referencia, **cuando** se proyecta, **entonces** la compra se rechaza: "antes" significa antes en el fichero (decisión e del prompt).

---

### Historia 3 — Asistentes de la CLI para eventos corporativos, tesis y valoraciones (Prioridad: P2)

El usuario registra un split, un contrasplit con picos, una fusión, una escisión, una fusión de fondos, un cambio de clase, una liquidación de fondo o una exclusión de cotización con un puñado de flags sencillos; la CLI construye los `effects[]`, muestra el evento completo y una tabla **antes/después** de lotes y posiciones, y pide confirmación. Para los `kind` menos frecuentes escribe los `effects[]` a mano (`raw`) y la CLI los valida contra la tabla. También abre, cierra y lista tesis, enlaza compras y ventas con `--thesis`, y consulta valoraciones a una fecha.

**Por qué esta prioridad**: sin asistente, escribir un `forced_sale` con las fracciones exactas por cuenta a mano es la vía más corta a un error; la tabla antes/después es la comprobación que el usuario hará dentro de doce años sin recordar nada (`docs/specification.md` §4.3).

**Prueba independiente**: sobre un libro con 10 y 7 títulos en dos cuentas, ejecutar `atlas ca reverse-split --ratio 0.25 --cash-per-share 400 …` y comprobar que el evento generado lleva `scale(0.25)` y un `forced_sale` con `{A: 0.5}` y `{B: 0.75}`, que la tabla antes/después muestra 10→2 y 7→1, y que `atlas lots` y `atlas gains` muestran `reverse_split` como origen.

**Escenarios de aceptación**:

1. **Dado** un activo con posiciones, **cuando** el usuario ejecuta `atlas ca split --asset --ratio --effective-date --source-document`, **entonces** la CLI muestra el evento con `scale(ratio)`, la tabla antes/después de lotes y posiciones, y escribe solo tras confirmar.
2. **Dado** posiciones en varias cuentas, **cuando** ejecuta `atlas ca reverse-split … --cash-per-share <precio> --currency --fx-rate --fx-rate-date`, **entonces** la CLI calcula por cuenta la fracción sobrante (`posición × ratio − parte entera`) y genera el `forced_sale` con `per_account[]`; sin fracciones no genera `forced_sale`.
3. **Dado** un activo destino que no existe en el catálogo, **cuando** ejecuta `merger`, `spin-off`, `fund-merger` o `share-class-change`, **entonces** la CLI rechaza y propone el `asset add` correspondiente antes; nunca crea el activo sola.
4. **Dado** un `convert` que deja el activo origen a cero, **cuando** el evento se registra, **entonces** la CLI propone el `asset update --inactive` aparte, sin escribirlo.
5. **Dado** `atlas ca raw --kind <kind> --effects-json <fichero o cadena>` con una secuencia que no encaja en la tabla, **entonces** la CLI termina con código 1 y el motivo; con una secuencia válida, muestra la tabla antes/después y confirma.
6. **Dado** cualquier `ca`, **cuando** se registra, **entonces** la CLI recuerda al usuario que copie el documento fuente (PDF o URL) a mano: el `source_document` se guarda como cadena tal cual.
7. **Dado** una cuenta y un activo del cubo, **cuando** ejecuta `atlas thesis open --id --account --asset --hypothesis --horizon-days --invalidation --planned-size`, luego `atlas add buy … --thesis <id>` y `atlas thesis close <id> --notes`, **entonces** los tres eventos se escriben en ese orden y `atlas thesis list [--closed]` muestra la tesis con sus métricas derivadas.
8. **Dado** lotes y ganancias procedentes de un `corporate_action`, **cuando** se consultan `atlas lots` y `atlas gains`, **entonces** la columna de origen muestra el `kind` del evento.
9. **Dado** un `corporate_action` o una tesis, **cuando** el usuario ejecuta `atlas edit <id>`, **entonces** se rechaza indicando que se usa `delete` y se registra de nuevo; `atlas delete <id>` funciona con la lista de dependientes de la 001.

---

### Historia 4 — Consultar valoraciones a una fecha (Prioridad: P3)

El usuario registra fotos de valoración (`valuation`, ya existente) y consulta, para una fecha dada, la última foto por cuenta y activo con su valor en EUR, para preparar el Modelo 720.

**Por qué esta prioridad**: es puramente informativa; ningún cálculo fiscal la usa. Cierra la lista de proyecciones de `data-schema.md` §7 para la Fase 1.

**Prueba independiente**: registrar dos `valuation` del mismo par con fechas distintas y comprobar que `valuations(date)` devuelve la última con `date ≤` la pedida y su valor `quantity × unit_value / fx_rate`.

**Escenarios de aceptación**:

1. **Dado** varias `valuation` por (`cuenta`, `activo`), **cuando** se consulta `valuations(date)`, **entonces** devuelve por par la última con `date ≤` la pedida, con cantidad, valor unitario, divisa, tipo de cambio y valor en EUR a 10 decimales.
2. **Dado** un par sin ninguna `valuation` en o antes de la fecha, **cuando** se consulta, **entonces** ese par no aparece; nunca se estima (constitución V).
3. **Dado** `atlas valuations [--date YYYY-MM-DD]`, **cuando** se ejecuta, **entonces** muestra la tabla anterior; sin `--date`, a hoy en `Europe/Madrid`.

---

### Casos límite

- Contrasplit con liquidación en efectivo **en dos cuentas** (10 y 7 títulos, 1:4): A queda con 2 y vende 0,5; B con 1 y vende 0,75; cada efectivo en su cuenta (constitución VII).
- Fusión con componente en efectivo (`data-schema.md` §6.5): ver Q1 en `questions.md`; el mecanismo `forced_sale` + `convert` está soportado con la semántica de venta; el asistente no inventa la cantidad vendida.
- Escisión con picos: `carve_out` seguido de `forced_sale` sobre el activo escindido.
- Fusión de fondos con ratio no entero (1,7): cantidades exactas por multiplicación; la suma de lotes iguala la suma de posiciones.
- Ratio en fracción: `30 × "4/3"` da 40 exactos sin resto; `10 × "1/3"` da 3,3333333333 (10 decimales) y deja un pico que se liquida con `forced_sale`; con dos lotes o dos cuentas, el resto de la división va al último lote y a la última cuenta y las sumas cuadran.
- `fund_liquidation` con lotes en dos cuentas; `forced_sale` que no cubre todas las cuentas con posición se rechaza en `fund_liquidation`/`issuer_liquidation`.
- `issuer_liquidation` a cero (pérdida total); `crypto_fork` con coste cero y venta posterior (tributa todo).
- `convert` sobre lotes heredados de un traspaso: fecha original conservada dos veces.
- `corporate_action` registrado tarde con `effective_date` anterior a ventas registradas: proyección cronológica.
- `reversal` de un `corporate_action` cuyos lotes resultantes ya se vendieron: rechazo con lista.
- Secuencia de efectos que no encaja con el `kind`; `effects: []` en un `kind` que exige efectos; `effects` no vacío en `delisting`: rechazos.
- `scale`, `convert` o `carve_out` sobre un activo sin lotes abiertos en `effective_date`: rechazo (no hay nada que transformar).
- `forced_sale` con `quantity` mayor que la posición física de la cuenta: `insufficient_position`, como `sell`; con una cuenta repetida en `per_account`, o de otro libro, o inexistente: rechazo.
- Activo destino de `convert`/`carve_out`/`grant` inexistente, de otro libro o igual al origen: rechazo.
- `buy` en el cubo sin tesis, con tesis cerrada, con tesis de otro activo o cuenta: rechazos; segunda tesis abierta sobre el mismo par: rechazo; `thesis_closed` con posición viva: aviso.
- `thesis_opened` cuyo `asset_created` está más adelante en el fichero: válido (el catálogo se resuelve completo antes que las tesis).
- Corrección (`edit`) de un `buy` del cubo cuya tesis se cerró después: la compra corregida conserva la posición lógica de la original (`corrects_id`), así que sigue siendo válida (supuesto A6).
- Lotes creados por un `corporate_action` en dos activos distintos (`issuer_restructuring`): identificadores de lote únicos en todo el libro.
- `valuations(date)` con dos fotos el mismo día: manda la posición en el fichero.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Eventos nuevos y validación**

- **FR-001**: El sistema DEBE soportar `corporate_action`, `thesis_opened` y `thesis_closed` como tipos de evento de pleno derecho (forma, proyección, CLI) y DEBE dejar `RESERVED_EVENT_TYPES` vacío conservando el mecanismo para features posteriores.
- **FR-002**: Un `corporate_action` DEBE llevar `kind` (uno de los trece de `data-schema.md` §8.5), `asset_id`, `effective_date`, `source_document` (cadena no vacía: clave en `documents/` o URL), `effects[]`, `notes?` y `fingerprint`; su fecha de negocio para la proyección cronológica es `effective_date`.
- **FR-003**: Cada efecto DEBE llevar `op` (`scale` | `convert` | `carve_out` | `forced_sale` | `grant`), los parámetros de `data-schema.md` §6.5 como cadenas decimales, y `asset_id?` (por defecto el del evento). `ratio` es una cadena decimal positiva (`"4"`, `"0.25"`) **o una fracción `"nuevas/antiguas"` de enteros positivos** (`"4/3"`, `"1/3"`). `forced_sale` lleva `per_account[]` de `{account_id, quantity | "all", fee?}`, `unit_price ≥ 0`, `currency`, `fx_rate`, `fx_rate_date`; `grant` lleva `per_account[]` de `{account_id, quantity}`, `unit_cost ≥ 0`, `currency`, `fx_rate`, `fx_rate_date`, `acquisition_date`; `carve_out` lleva `cost_share` en `[0, 1]`.
- **FR-004**: La huella de un `corporate_action` DEBE ser `sha256` de `["", "", "", asset_id, "corporate_action", effective_date, kind, "", ""]`; las tesis no llevan huella.
- **FR-005**: `thesis_opened` DEBE llevar `thesis_id`, `account_id`, `asset_id`, `hypothesis`, `expected_horizon_days` (entero JSON positivo), `invalidation`, `planned_size_eur` (cadena decimal); `thesis_closed` DEBE llevar `thesis_id` y `closing_notes`.

**Primitivas (ADR-0011, `data-schema.md` §6.5)**

- **FR-006**: Los efectos DEBEN aplicarse en el orden del array sobre el estado proyectado hasta `effective_date`, validando cada uno antes de mutar; un efecto inválido rechaza el evento completo sin dejar rastro.
- **FR-007**: `scale(ratio)` DEBE escalar la cantidad de cada lote abierto del activo y la posición física de cada cuenta como `quantity × nuevas / antiguas`: exacto cuando lo es (decimal, o fracción que divide sin resto); si la división no es exacta, a 10 decimales half-up (ADR-0005), calculando el total del activo **una sola vez** y asignando el resto exacto al **último lote** y a la **última cuenta** (en orden FIFO y de fichero respectivamente), de modo que Σ lotes = Σ posiciones = total; conservando `cost_eur`, `acquisition_date` e identificador del lote; sin efecto en efectivo ni hecho imponible.
- **FR-008**: `convert(to_asset_id, ratio)` DEBE cerrar cada lote abierto del activo origen con una consumición que referencia el evento y crear en el destino un lote con `quantity × ratio` (misma regla de escalado y resto que FR-007), el mismo coste total, la misma `acquisition_date`, `source_lot_id` al origen y la posición de desempate FIFO del evento origen del lote consumido; la posición física de cada cuenta pasa de `q` en el origen a `q × ratio` en el destino.
- **FR-009**: `carve_out(to_asset_id, ratio, cost_share)` DEBE crear por cada lote abierto un lote en el destino con `quantity × ratio` (misma regla de escalado y resto que FR-007), `cost_eur × cost_share`, la misma fecha, `source_lot_id` y la posición del evento origen, y dejar el origen con `cost_eur − (cost_eur × cost_share)` (resta, para que la suma sea exacta); la posición física de cada cuenta suma `q × ratio` en el destino y no cambia en el origen.
- **FR-010**: `forced_sale` DEBE producir, por cada entrada de `per_account[]`, exactamente el mismo estado que un `sell` en esa cuenta del activo del efecto: `quantity` (o la posición física de la cuenta si es `"all"`) restada de la posición física, consumo FIFO global, ganancia con `fiscal_date = effective_date`, valor de transmisión `(quantity × unit_price − fee) / fx_rate`, efectivo `+ quantity × unit_price − fee` en `currency` en esa cuenta, sin `withholding`; es hecho imponible aunque la ganancia sea cero.
- **FR-011**: `grant` DEBE crear un lote nuevo por cuenta con `cost_eur = quantity × unit_cost / fx_rate`, la `acquisition_date` dada y la posición de desempate del propio `corporate_action`, sumar `quantity` a la posición física de la cuenta y NO tocar el efectivo.
- **FR-012**: Los activos destino de `convert`, `carve_out` y `grant` DEBEN existir en el catálogo, pertenecer al mismo libro que el origen y ser distintos del origen (`convert`, `carve_out`); un `corporate_action` NUNCA crea ni desactiva activos. Las cuentas de `forced_sale` y `grant` DEBEN existir y pertenecer al libro del activo; `forced_sale` DEBE rechazar `quantity` mayor que la posición física de la cuenta (`insufficient_position`) y cuentas repetidas.
- **FR-013**: `scale`, `convert` y `carve_out` DEBEN rechazar un activo sin lotes abiertos en `effective_date`.
- **FR-014**: El sistema DEBE reutilizar el consumo FIFO, la apertura de lotes y el registro de ganancias existentes; no hay un segundo FIFO.

**Composición por `kind` (`data-schema.md` §8.5)**

- **FR-015**: La proyección DEBE comprobar que `effects[]` encaja en la fila de `kind` y rechazar con `effects_not_allowed_for_kind` si no. La tabla DEBE ser datos (un objeto por `kind`), no lógica por tipo: `split` → `scale`; `reverse_split` → `scale` (+ `forced_sale?` sobre el mismo activo); `stock_dividend` → `scale` o `grant` (+ `forced_sale?` sobre el activo del `grant`); `merger` → `convert` (+ `forced_sale?` antes sobre el activo antiguo o después sobre el nuevo); `spin_off` → `carve_out` (+ `forced_sale?` sobre el escindido); `fund_merger`, `share_class_change`, `token_migration` → `convert`; `fund_liquidation`, `issuer_liquidation` → `forced_sale` con `"all"` en todas las cuentas con posición; `delisting` → ninguno; `crypto_fork` → `grant`; `issuer_restructuring` → cualquier secuencia no vacía de `convert` y `forced_sale`.
- **FR-016**: Cada fila de §8.5 DEBE tener un test con el ejemplo numérico (10 títulos, 1.000 €, 2027-01-10) y su resultado a céntimo.

**Tesis (`data-schema.md` §6.4, reglas 13-19)**

- **FR-017**: `thesis_opened` y `thesis_closed` DEBEN proyectarse en la pasada A, en orden de fichero, tras el catálogo y la configuración; sus fechas administrativas son `recorded_at` en `Europe/Madrid`.
- **FR-018**: `thesis_opened` DEBE exigir cuenta y activo del libro `bucket`, `thesis_id` único y como máximo una tesis abierta por (`account_id`, `asset_id`); `thesis_closed` DEBE exigir una tesis abierta con ese id.
- **FR-019**: Un `buy` en cuenta `bucket` DEBE llevar `thesis_id` de una tesis de la misma cuenta y activo, abierta **antes en el fichero** y no cerrada antes en el fichero; `sell` en `bucket` admite `thesis_id?` con la misma validación y sin él se acepta con aviso `sell_without_thesis`. Sustituye al rechazo provisional de la 001 (Q2).
- **FR-020**: `theses(state, at)` DEBE devolver por tesis: estado, fechas administrativas, eventos enlazados, invertido en EUR (suma del coste en EUR de los `buy`), `result_eur` (suma de `gain_eur` de los `sell` enlazados, exacta y redondeada una vez), comisiones acumuladas en EUR de esos eventos, posición física viva del par y `days_open` hasta el cierre o hasta `at`.
- **FR-021**: El sistema DEBE avisar (no rechazar) al cerrar una tesis con posición física viva (`thesis_closed_with_position`) y al registrar un `buy` que hace que el coste acumulado de la tesis supere `planned_size_eur` (`thesis_size_exceeded`).

**Valoraciones**

- **FR-022**: `valuations(state, date)` DEBE devolver, por (`account_id`, `asset_id`), la última `valuation` con `date ≤` la pedida, con `quantity`, `unit_value`, `currency`, `fx_rate`, `date` y el valor en EUR `quantity × unit_value / fx_rate` a 10 decimales; es informativa y ningún cálculo fiscal la usa.

**Rectificación e integridad**

- **FR-023**: `reversal` de un `corporate_action` o de una tesis DEBE seguir la regla de la 001: re-proyección sin la pareja y rechazo con la lista de eventos que dejan de ser válidos.
- **FR-024**: `integrity` de un libro con eventos corporativos y tesis DEBE quedar limpio: Σ lotes abiertos = Σ posiciones físicas por activo tras cualquier `corporate_action` válido.
- **FR-025**: Los identificadores de lote DEBEN ser únicos en todo el libro aunque un mismo evento cree lotes en varios activos.

**CLI**

- **FR-026**: `atlas ca <kind>` DEBE ofrecer asistentes `split`, `reverse-split`, `merger`, `spin-off`, `fund-merger`, `share-class-change`, `fund-liquidation`, `delisting` y `raw` con los flags de `docs/prompts/002-corporate-actions.md` §3.6; todos aceptan `--effective-date`, `--source-document`, `--notes`, `--yes`, `--confirm-duplicate`; todos muestran el evento completo y la tabla antes/después de lotes y posiciones de los activos afectados antes de confirmar.
- **FR-027**: `reverse-split` con `--cash-per-share` DEBE calcular las fracciones por cuenta a partir de las posiciones físicas y generar `forced_sale.per_account[]`; `--fees cuenta=importe,…` reparte la comisión por cuenta.
- **FR-028**: `merger`, `spin-off`, `fund-merger` y `share-class-change` DEBEN comprobar que el activo destino existe y proponer `asset add` si no; tras un `convert` que deja el origen a cero, DEBEN proponer `asset update --inactive` sin escribirlo.
- **FR-029**: La CLI DEBE ofrecer `atlas thesis open|close|list [--closed]`, `--thesis <id>` en `atlas add buy|sell` y `atlas valuations [--date YYYY-MM-DD]`.
- **FR-030**: `atlas lots` y `atlas gains` DEBEN mostrar el origen (`kind`) de lotes y ganancias que proceden de un `corporate_action`; `atlas positions` DEBE reflejar las posiciones transformadas.
- **FR-031**: `atlas edit` DEBE rechazar `corporate_action`, `thesis_opened` y `thesis_closed` (usar `delete` y registrar de nuevo); `atlas delete` los admite.

### Entidades clave

- **CorporateAction**: evento con `kind`, activo afectado, fecha de efecto, fuente documental y lista ordenada de efectos. Inmutable; su efecto se deriva al proyectar.
- **Effect**: una de las cinco primitivas con sus parámetros y el activo sobre el que actúa.
- **KindRule**: fila de la tabla de composición: secuencias de efectos admitidas para un `kind` y, en su caso, restricciones (activo objetivo, cobertura de todas las cuentas).
- **FiscalLot** (ampliado): puede proceder de un `corporate_action` (`source_event_id`), conservar `source_lot_id` tras `convert`/`carve_out` y cerrarse por una consumición de un `corporate_action`.
- **RealizedGain** (ampliado): puede proceder de un `forced_sale`, una por cuenta, con `fiscal_date = effective_date`.
- **Thesis**: tesis del cubo: id, cuenta, activo, hipótesis, plazo, invalidación, tamaño previsto, estado, fechas administrativas, eventos enlazados y métricas derivadas sin precios.
- **ValuationAt**: última foto de valoración por (`cuenta`, `activo`) a una fecha, con su valor en EUR.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Las trece filas de `data-schema.md` §8.5 tienen cada una un test con el ejemplo numérico y su resultado a céntimo, y pasan.
- **SC-002**: Los casos límite obligatorios de `docs/prompts/002-corporate-actions.md` §3.7 tienen cada uno un test que pasa, incluido el contrasplit con liquidación en dos cuentas de la constitución VII.
- **SC-003**: Las propiedades "`scale` y `convert` conservan el coste total por activo", "`carve_out` reparte exactamente el 100 %", "`forced_sale` sobre una cuenta = `sell` equivalente", "`scale(r)` seguido de `scale(1/r)` deja cantidades y costes idénticos", "tras cualquier `corporate_action` válido Σ lotes = Σ posiciones e `integrity` limpio" y "proyectar dos veces da lo mismo" se verifican con generación aleatoria sin fallos.
- **SC-004**: `packages/domain` mantiene el 100 % de cobertura de líneas y ramas; `RESERVED_EVENT_TYPES` queda vacío; `docs/data-schema.md` no cambia.
- **SC-005**: Siguiendo solo el README, el usuario registra un split y una tesis con datos inventados en menos de 5 minutos y ve la tabla antes/después.
- **SC-006**: `lint`, `typecheck`, `test:coverage`, `build` y CI en verde sobre la PR.

## Supuestos

Decisiones de detalle tomadas con los valores por defecto documentados. Ninguna es fiscal ni estructural; las dudas de ese tipo están en `questions.md`.

- **A1 — `forced_sale` es una venta, literalmente** (Q1 resuelta (a) el 2026-08-30; `data-schema.md` §6.5 y `docs/fiscal-questions.md` #13 lo recogen). Consume posición física y lotes FIFO como un `sell`. El componente en efectivo de una fusión se registra como venta **parcial** de las antiguas antes del `convert`, con cantidad y precio fijados por el usuario y el asesor, vía `raw`. El asistente `merger --cash-per-share` genera el `forced_sale` **después** del `convert`, sobre el activo nuevo, para los picos (misma mecánica que `reverse-split`); el componente en efectivo por acción antigua se registra con `raw` cuando el usuario y el asesor fijen cantidad y precio.
- **A2 — Escalado con resto exacto.** `ratio` decimal: `quantity × ratio` es una multiplicación exacta y no hay resto. `ratio` en fracción `n/d`: `quantity × n / d`; si la división es exacta (30 × 4/3 = 40) no hay resto; si no lo es (10 × 1/3), va a 10 decimales half-up y el total escalado del activo se calcula una vez, cada lote y cada cuenta reciben su parte redondeada y el último lote (orden FIFO) y la última cuenta (orden de fichero de su primera aparición) reciben `total − Σ resto`, como ya hace `applyTransfer`. `cost_eur × cost_share` es exacto (sin división). Las divisiones por `fx_rate` van a 10 decimales half-up (ADR-0005).
- **A3 — `asset_id?` en todos los efectos**, también en `grant`: por defecto el del evento. En `crypto_fork` y en los derechos de un `stock_dividend` el usuario indica el activo nuevo.
- **A4 — Tabla de composición con restricción de activo.** Cada paso admitido indica sobre qué activo actúa: el del evento (`scale`, `convert`, `carve_out`, `forced_sale` de picos de contrasplit, `forced_sale` previo de una fusión) o el destino del paso anterior (`forced_sale` tras `convert`, `carve_out` o `grant`). `fund_liquidation` e `issuer_liquidation` exigen `"all"` en exactamente las cuentas con posición.
- **A5 — Tesis tras el catálogo.** En la pasada A se aplican primero catálogo y configuración y después las tesis, ambos en orden de fichero, para que un `asset_created` registrado más tarde siga siendo válido (`data-schema.md` §7.1).
- **A6 — "Antes en el fichero" con rectificación.** La ventana de validez de una tesis para un `buy`/`sell` se evalúa con la posición en el fichero del evento; un evento con `corrects_id` usa la posición del evento que corrige, de modo que corregir una compra tras cerrar su tesis sigue siendo posible. El desempate FIFO del lote no cambia (posición real, como en la 001).
- **A7 — Aviso `thesis_closed_with_position`** se evalúa al final de la proyección: tesis cerrada, posición física del par mayor que cero y ninguna tesis posterior abierta sobre el mismo par. Las tesis no tienen fecha de negocio, así que "posición al cerrar" no está definida de otra forma.
- **A8 — Métricas de tesis.** Invertido = Σ `cost_eur` de los `buy` enlazados (incluye comisión, como el lote); comisiones = Σ `fee / fx_rate` de compras y ventas enlazadas; `result_eur` = Σ `gain_eur` de las ventas enlazadas; posición = posición física del par al final del libro; `days_open` = días entre la fecha administrativa de apertura y la de cierre o `at`.
- **A9 — `source_document` sin `DocumentStore`.** Se guarda la cadena; la CLI recuerda copiar el documento a mano. El puerto `DocumentStore` no se crea en esta feature.
- **A10 — `unit_price` y `unit_cost` admiten cero** (`issuer_liquidation`, `crypto_fork`, derechos); `ratio` y `fx_rate` deben ser positivos; `cost_share` en `[0, 1]`.
- **A11 — Avisos de la 001 reutilizados.** `forced_sale` y `grant` emiten `currency_mismatch` y `fx_rate_date_after_fiscal_date` como `buy`/`sell`; `convert`, `carve_out` y `grant` emiten `same_asset_two_accounts` cuando procede.
- **A12 — Preguntas 7, 8 y 9 de `docs/fiscal-questions.md`** siguen abiertas: `cost_share`, el coste del `grant` y el precio de la `forced_sale` son entradas del usuario; el código no fija ningún criterio.
- **A13 — `expected_horizon_days`** es el único campo numérico entero (no importe) del esquema junto a `stale_price_days` y `transfer_max_days`; se valida como entero positivo.
