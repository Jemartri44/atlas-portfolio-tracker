# Especificación de la feature: Libro mayor — núcleo y CLI (`001-ledger-core`)

**Rama**: `feature/001-ledger-core`

**Creada**: 2026-08-30

**Estado**: Aprobado por el usuario (2026-08-30); Q1-Q3 resueltas

**Entrada**: prompt de traspaso `docs/prompts/001-ledger-core.md` §3 (alcance) y §4 (fuera de alcance). Deriva de `docs/specification.md` §2-§5 y §11, `docs/business-rules.md` §1, §5.2, §5.3, §5.7, §5.10, `docs/data-schema.md` §2-§8 y los ADR 0001, 0003, 0005-0010, 0012 y 0013.

## Resumen

Primera feature de código del proyecto: el libro mayor append-only, sus proyecciones (posiciones físicas, lotes fiscales FIFO globales por activo, efectivo, órdenes y traspasos pendientes, ganancias realizadas por ejercicio) y una CLI `atlas` para operar sobre un fichero local `ledger.jsonl`. Si solo existiera esta feature, el usuario ya podría llevar el registro completo de su cartera con trazabilidad fiscal (`docs/specification.md` §13, Fase 1).

Esta feature **no** decide nada fiscal ni estructural: implementa lo que ya está en los documentos. Lo que no encaja se anota en `questions.md` y se resuelve con el usuario.

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — Registrar el catálogo y las operaciones (Prioridad: P1)

El usuario da de alta sus cuentas y activos, fija la configuración y registra cada operación (compra, venta, dividendo, interés, cambio de divisa, ingreso y retirada de efectivo, comisión suelta, valoración) en el momento de operar, con fecha, cantidad, precio o importe, comisión, divisa y tipo de cambio del BCE tal cual se publica. Antes de escribir, la CLI le muestra el evento completo y pide confirmación.

**Por qué esta prioridad**: sin registro no hay libro. Es el único dato primario del sistema; todo lo demás se deriva de él (constitución I).

**Prueba independiente**: con un libro vacío, dar de alta una cuenta y un activo, registrar una compra y comprobar que el fichero contiene tres líneas válidas más el `settings_changed` inicial, todas con `schema_version = 1`, `id` único y `recorded_at`.

**Escenarios de aceptación**:

1. **Dado** un libro vacío, **cuando** el usuario da de alta una cuenta `core` y un activo `fund` traspasable, **entonces** el libro contiene un `account_created` y un `asset_created` con todos los campos obligatorios de `data-schema.md` §6.1.
2. **Dado** un activo dado de alta en `core`, **cuando** el usuario intenta darlo de alta también en `bucket`, **entonces** la operación se rechaza con un mensaje que cita la regla (ADR-0009).
3. **Dado** una cuenta y un activo, **cuando** el usuario registra una compra con `--amount`, **entonces** el evento guarda `amount`, `unit_price` (informativo), `quantity`, `currency`, `fx_rate`, `fx_rate_date`, `fee`, `trade_date` y `value_date` como cadenas decimales y fechas `YYYY-MM-DD`, y el coste del lote resultante es `(amount + fee) / fx_rate`.
4. **Dado** cualquier evento con un importe expresado como número JSON (no cadena), **cuando** se intenta cargar o escribir, **entonces** se rechaza como error de validación (ADR-0005).
5. **Dado** un evento cuya huella (`fingerprint`) coincide con otra ya registrada, **cuando** el usuario lo registra sin `--confirm-duplicate`, **entonces** la CLI avisa y no escribe; con `--confirm-duplicate` lo escribe.
6. **Dado** una venta cuya cantidad supera la posición física de la cuenta, **cuando** se intenta registrar, **entonces** se rechaza indicando la posición disponible.
7. **Dado** un `buy` en una cuenta del libro `bucket`, **cuando** se intenta registrar, **entonces** se rechaza porque exige una tesis previa y las tesis no existen todavía en esta feature (ver `questions.md` Q2 y supuestos).

---

### Historia 2 — Consultar posiciones, lotes, efectivo y ganancias (Prioridad: P1)

El usuario consulta en cualquier momento qué tiene (posición física por cuenta y activo), cómo está compuesto fiscalmente (lotes abiertos por activo, globales entre cuentas, con fecha de adquisición y coste en EUR), cuánto efectivo hay por cuenta y divisa, y qué ganancias o pérdidas ha realizado en un ejercicio. Todo se recalcula desde el libro en cada consulta; nada se almacena derivado.

**Por qué esta prioridad**: es el valor visible del registro y lo que se concilia con los brókers. Junto con la Historia 1 constituye el MVP.

**Prueba independiente**: sobre un libro con dos compras del mismo activo en dos cuentas y una venta parcial, comprobar que `positions` muestra la cantidad por cuenta, `lots` muestra el lote más antiguo consumido primero (aunque esté en otra cuenta) y `gains <año>` muestra la ganancia redondeada a céntimos una sola vez.

**Escenarios de aceptación**:

1. **Dado** compras del mismo activo en dos cuentas con fechas distintas, **cuando** se vende en la cuenta de la compra más reciente, **entonces** los lotes fiscales consumidos son los más antiguos (de la otra cuenta) y la posición física baja solo en la cuenta donde se vendió (ADR-0009).
2. **Dado** varios lotes con la misma `acquisition_date`, **cuando** se consumen, **entonces** el orden de consumo es la posición en el fichero del evento que los creó (nunca `id` ni `recorded_at`).
3. **Dado** una venta que parte un lote, **cuando** se proyecta, **entonces** el lote queda abierto con la cantidad restante y su coste proporcional exacto; la suma de lotes abiertos del activo coincide con la suma de posiciones físicas del activo.
4. **Dado** un activo cotizado (`stock`, `etc`, `etp`, `crypto`) vendido con `trade_date` 30/12 y `value_date` 02/01, **cuando** se consulta `gains` de cada ejercicio, **entonces** la ganancia se imputa al ejercicio de `trade_date`; si el activo es `fund` o `money_market`, al de `value_date` (ADR-0013).
5. **Dado** un `fx_exchange` dentro de una cuenta, **cuando** se consulta `cash`, **entonces** el saldo de la divisa vendida baja en `sold_amount`, el de la comprada sube en `bought_amount` y la comisión se resta en `fee_currency`, cuadrando con el extracto.
6. **Dado** dividendos e intereses del ejercicio, **cuando** se consulta `investmentIncome(year)`, **entonces** aparecen brutos, retenciones en origen y en España y neto, en la divisa original y en EUR al `fx_rate` registrado.
7. **Dado** cualquier libro, **cuando** se ejecuta `check`, **entonces** se informa de posiciones físicas negativas, de descuadres entre lotes fiscales y posiciones físicas por activo y de huellas repetidas.

---

### Historia 3 — Rectificar sin borrar (Prioridad: P2)

El usuario se equivoca al registrar y corrige o elimina la operación. La CLI ofrece *editar* y *eliminar*, pero por debajo solo se añaden líneas: un `reversal` y, si procede, el evento corregido enlazado con `corrects_id`. Si el evento a rectificar ya fue consumido por eventos posteriores (una venta que gastó ese lote, un traspaso que lo movió), la rectificación se rechaza listando los eventos afectados.

**Por qué esta prioridad**: en 20 años habrá erratas; corregirlas sin romper la fiscalidad histórica es la garantía central del libro append-only (ADR-0003).

**Prueba independiente**: registrar una compra con precio equivocado, editarla, y comprobar que el libro tiene tres líneas (original, `reversal`, corregida con `corrects_id`), que la proyección es idéntica a haber registrado bien desde el principio y que la antigüedad fiscal no cambia.

**Escenarios de aceptación**:

1. **Dado** una compra registrada con un precio erróneo, **cuando** el usuario la edita, **entonces** se escriben un `reversal` (`reverses_id`, `reason`) y la compra correcta con `corrects_id` y la fecha real de la operación; la proyección resultante es idéntica a la de un libro donde la compra se hubiera registrado bien.
2. **Dado** una compra cuyo lote ya fue consumido total o parcialmente por una venta, **cuando** el usuario intenta anularla, **entonces** se rechaza y el mensaje lista la venta afectada (constitución VII).
3. **Dado** un `reversal`, **cuando** se intenta anularlo, **entonces** se rechaza (se registra de nuevo el evento original).
4. **Dado** un evento con `value_date` en un ejercicio anterior al actual, **cuando** se edita o elimina, **entonces** la CLI advierte de que afecta a una declaración ya presentada antes de pedir confirmación.
5. **Dado** una corrección seguida de otra corrección que vuelve al valor original, **cuando** se proyecta, **entonces** el resultado es idéntico a no haber tocado nada (propiedad, ADR-0003).

---

### Historia 4 — Traspasos y seguimiento de operaciones en curso (Prioridad: P2)

El usuario registra un traspaso entre fondos como un único hecho contable atómico (`transfer`) que conserva fecha de adquisición y coste de los lotes origen, o un traspaso de custodia del mismo activo entre cuentas que solo mueve la posición física. Mientras el traspaso o una orden de suscripción/reembolso están en curso, los registra como eventos de seguimiento (`transfer_requested`, `order_placed`, …) sin efecto sobre lotes ni efectivo, y consulta qué hay pendiente.

**Por qué esta prioridad**: el traspaso es "el caso que hay que modelar bien" (`docs/specification.md` §4.2); el seguimiento cumple la regla 20 (registrar en el momento de operar) cuando el VL no se conoce hasta D+1/D+2.

**Prueba independiente**: sobre dos lotes de un fondo A, traspasar parcialmente a un fondo B y comprobar que los lotes de B heredan `acquisition_date` y coste total (proporcional) de los lotes de A consumidos en FIFO, sin ganancia ni pérdida, y que `pending` deja de mostrar la solicitud cuando el `transfer` final la referencia.

**Escenarios de aceptación**:

1. **Dado** dos lotes de un fondo traspasable, **cuando** se traspasa parcialmente a otro fondo traspasable, **entonces** se consumen lotes origen en FIFO y por cada uno se crea un lote destino con la misma `acquisition_date`, el mismo coste total proporcional y `source_lot_id`; `realizedGains` no registra nada.
2. **Dado** un activo no traspasable (ETC, ETP, acción), **cuando** se intenta un traspaso fiscal a otro activo, **entonces** se rechaza.
3. **Dado** un activo cualquiera en la cuenta X, **cuando** se registra un `transfer` con `from_asset_id == to_asset_id` hacia la cuenta Y, **entonces** la posición física pasa de X a Y y los lotes fiscales quedan intactos (ADR-0012).
4. **Dado** un `transfer_requested`, **cuando** se registran `transfer_request_updated` con etapas y por último el `transfer` con `request_id`, **entonces** `pendingTransfers` muestra la solicitud con su etapa y días transcurridos hasta el `transfer` final, y desaparece después; una etapa `cancelled` también la cierra.
5. **Dado** un `order_placed`, **cuando** se registra un `buy`/`sell` con `--order <id>`, **entonces** la orden deja de estar en `pendingOrders`; un `order_updated` con `stage = cancelled` también la cierra.
6. **Dado** un `transfer_requested` sin `transfer` final, **cuando** se proyecta, **entonces** no se interpreta nunca como venta ni afecta a lotes (ADR-0010).

---

### Historia 5 — Un fichero que sobrevive (Prioridad: P3)

El libro es un fichero `ledger.jsonl` legible sin la aplicación. La aplicación solo añade líneas al final y nunca reescribe las existentes; rechaza abrir un libro escrito por una versión más nueva del esquema; detecta escrituras concurrentes; y exporta el libro completo a JSONL o CSV.

**Por qué esta prioridad**: sin estas garantías, un cliente antiguo o un fallo a mitad de escritura pueden corromper 20 años de datos (constitución VI, `data-schema.md` §5). Es P3 solo porque las historias anteriores pueden probarse en memoria.

**Prueba independiente**: crear un fichero con una línea `schema_version = 2` y comprobar que la carga falla; sobre un fichero válido, añadir un evento y comprobar que el prefijo del fichero es byte a byte el original.

**Escenarios de aceptación**:

1. **Dado** un fichero con una línea cuyo `schema_version` es mayor que el conocido, **cuando** se carga, **entonces** la carga falla con un mensaje claro y no se escribe nada.
2. **Dado** un fichero válido, **cuando** se añade un evento, **entonces** los bytes previos permanecen idénticos y solo hay una línea nueva terminada en `\n`.
3. **Dado** dos procesos que cargaron el mismo fichero, **cuando** ambos intentan añadir, **entonces** el segundo recibe un conflicto explícito y ninguna línea se pierde ni se duplica.
4. **Dado** una escritura interrumpida, **cuando** se vuelve a cargar, **entonces** el fichero es el original completo o el nuevo completo, nunca una línea a medias (escritura atómica).
5. **Dado** una línea `schema_version = 1`, **cuando** pasa por la cadena de migraciones, **entonces** sale intacta.
6. **Dado** cualquier libro, **cuando** se exporta a JSONL o CSV, **entonces** el resultado contiene todos los eventos, incluidos los anulados y sus `reversal`, con los numéricos como cadenas.

---

### Casos límite

- Varios lotes con la misma `acquisition_date` (orden por posición en el fichero).
- Compra registrada tarde con `fiscal_date` anterior a una venta ya registrada: la proyección la coloca en su fecha y la venta consume ese lote; sin aviso, registrar tarde es normal (`data-schema.md` §7.1).
- Cantidades fraccionarias con muchos decimales (cripto hasta 18); la proyección no redondea nunca.
- Venta que parte un lote; venta mayor que la posición física de la cuenta (rechazo).
- Traspaso parcial; traspaso de custodia (posición cambia de cuenta, lotes intactos).
- Anulación de una compra ya vendida (rechazo con lista); anulación de un `reversal` (rechazo).
- Venta el 30/12 con liquidación el 02/01 (ejercicio según `fiscal_date_rule` por tipo de activo).
- Efectivo en divisa que cuadra tras un `fx_exchange` con comisión en una tercera divisa.
- Libro sin ningún `settings_changed`: se aplican los valores por defecto documentados (supuesto A3).
- Evento con `recorded_at` a las 23:30 UTC del día D: para `settingsAt` cuenta como día D+1 en `Europe/Madrid` en verano.
- Fichero vacío (0 bytes) y fichero sin `\n` final: ambos se cargan; el `append` normaliza solo lo nuevo.
- `--yes` en la CLI omite la confirmación pero nunca el aviso de huella repetida ni el de ejercicio anterior.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Catálogo y configuración**

- **FR-001**: El sistema DEBE permitir registrar y actualizar cuentas (`account_created`/`account_updated`) y activos (`asset_created`/`asset_updated`) con los campos de `data-schema.md` §6.1; los `*_updated` llevan el estado completo resultante.
- **FR-002**: El sistema DEBE rechazar un activo cuyo `book` no coincida con el de un activo ya existente con el mismo `asset_id`, y DEBE rechazar operaciones cuyo activo y cuenta pertenezcan a libros distintos (ADR-0009, constitución III).
- **FR-003**: El sistema DEBE registrar la configuración como `settings_changed` con el objeto completo y DEBE derivar `settingsAt(date)` como el último `settings_changed` cuyo `recorded_at`, convertido a fecha en `Europe/Madrid`, sea ≤ `date` (fin del día).
- **FR-004**: El sistema DEBE exponer los valores por defecto documentados de `fiscal_date_rule` y `wash_sale_window_days` (ADR-0013) y usarlos cuando el libro no tenga `settings_changed`.

**Eventos y validación**

- **FR-005**: El sistema DEBE soportar los tipos `account_created/updated`, `asset_created/updated`, `settings_changed`, `buy`, `sell`, `transfer`, `order_placed`, `order_updated`, `transfer_requested`, `transfer_request_updated`, `dividend`, `interest`, `fx_exchange`, `cash_deposit`, `cash_withdrawal`, `standalone_fee`, `valuation` y `reversal`, y DEBE dejar el discriminador de tipos abierto para `corporate_action`, `thesis_opened` y `thesis_closed` (feature 002) sin cambiar el envoltorio.
- **FR-006**: Cada línea DEBE llevar el envoltorio de `data-schema.md` §2: `schema_version`, `id` (ULID), `recorded_at` (ISO 8601 UTC, vía `Clock`), `type`, en `snake_case`.
- **FR-007**: El sistema DEBE validar cada evento antes de escribirlo: campos obligatorios presentes, numéricos como cadenas decimales estrictas (sin exponente ni separadores), fechas `YYYY-MM-DD` válidas, divisas ISO 4217 de tres letras, referencias (`account_id`, `asset_id`, `order_id`, `request_id`, `reverses_id`, `corrects_id`) a eventos existentes, `reversal` de `reversal` prohibido, `transfer` fiscal solo entre activos `transferable` distintos y traspaso de custodia solo con el mismo activo y cuentas distintas.
- **FR-008**: El sistema DEBE calcular `fingerprint` como `sha256:` del tuple de `data-schema.md` §4 cuando el evento no lo trae (en manual sin `broker_ref` la huella **no** incluye el `id` propio: dos registros idénticos deben avisar), DEBE detectar huellas repetidas y DEBE tratarlas como aviso con confirmación, nunca como rechazo.
- **FR-009**: El sistema DEBE tratar `amount`, cuando esté presente en `buy`/`sell`, como base de coste o de transmisión, y `quantity × unit_price` en caso contrario (ADR-0012).
- **FR-010**: El sistema DEBE guardar `fx_rate` tal cual lo publica el BCE (unidades de `currency` por EUR) y convertir con `eur = amount / fx_rate` sin redondeo intermedio (ADR-0013, ADR-0005).
- **FR-011**: El sistema DEBE derivar `fiscal_date` por `asset.type` según `Settings.fiscal_date_rule` y no almacenarla.

**Rectificación**

- **FR-012**: `reverseEvent` y `correctEvent` DEBEN re-proyectar el libro completo sin la pareja anulada y DEBEN rechazar la operación si algún evento posterior deja de ser válido, listando los eventos afectados (`data-schema.md` §6.3).
- **FR-013**: `correctEvent` DEBE escribir un `reversal` y el evento corregido con `corrects_id` en una sola operación de `append`.
- **FR-014**: El sistema DEBE advertir cuando el evento rectificado tiene fecha de negocio en un ejercicio anterior al del `Clock`.

**Proyecciones**

- **FR-015**: El sistema DEBE ofrecer las proyecciones puras `accounts`, `assets` (con `identifier_history`), `settingsAt`, `physicalPositions`, `cashBalances`, `pendingTransfers`, `pendingOrders`, `fiscalLots`, `realizedGains(year)`, `investmentIncome(year)` e `integrity`, todas recalculadas desde cero e ignorando las parejas anuladas.
- **FR-016**: `fiscalLots` DEBE aplicar FIFO global por `asset_id` entre cuentas con orden `(acquisition_date, posición en el fichero)`, coste de adquisición `((amount ?? quantity × unit_price) + fee) / fx_rate` y valor de transmisión `((amount ?? quantity × unit_price) − fee) / fx_rate`, exactos.
- **FR-017**: Un `transfer` fiscal DEBE consumir lotes origen en FIFO y crear lotes destino con la misma `acquisition_date`, el mismo coste total proporcional, `source_lot_id` y `quantity_in` repartida en proporción a la cantidad consumida de cada lote; NUNCA genera ganancia ni pérdida. Un traspaso de custodia DEBE mover solo `physicalPositions`.
- **FR-018**: `realizedGains(year)` DEBE imputar cada transmisión al ejercicio de su `fiscal_date`, calcular la ganancia exacta lote a lote, sumarla por operación y redondearla a céntimos half-up una sola vez; NO aplica la regla de recompra (queda para el motor fiscal).
- **FR-019**: `cashBalances` DEBE incluir compras, ventas (neto de comisión y `withholding`), `dividend` e `interest` (netos), `fx_exchange`, `cash_deposit`, `cash_withdrawal` y `standalone_fee`, por cuenta y divisa.
- **FR-020**: La proyección ante un estado inválido (cantidad negativa, lote insuficiente, referencia rota) DEBE fallar con error explícito; NUNCA produce cantidades negativas en silencio.
- **FR-021**: `integrity` DEBE comprobar posiciones físicas ≥ 0, suma de lotes abiertos = suma de posiciones físicas por activo, huellas únicas y referencias resueltas.

**Persistencia**

- **FR-022**: El puerto `LedgerStore` DEBE ofrecer `load() → {events, etag}` y `append(events, etag)` con conflicto explícito cuando el `etag` no coincide.
- **FR-023**: El cargador DEBE rechazar cualquier línea con `schema_version` mayor que la conocida y DEBE pasar cada línea por la cadena de migraciones `migrate(line)` (vacía en v1).
- **FR-024**: `append` DEBE conservar los bytes originales del fichero y solo añadir líneas al final; la escritura DEBE ser atómica (fichero temporal + renombrado).
- **FR-025**: El orden canónico de almacenamiento DEBE ser la posición en el fichero (no `id` ni `recorded_at`). La proyección de operaciones y seguimiento DEBE ser **cronológica**: orden estable `(fecha de negocio, posición en el fichero)`, donde la fecha de negocio es `fiscal_date` en `buy`/`sell`, `value_date_out` en `transfer` y `value_date`/`date`/`requested_date` en el resto; el catálogo, la configuración y las rectificaciones se proyectan antes, en orden del fichero (`data-schema.md` §7.1).
- **FR-026**: Los adaptadores de esta feature son **memoria** y **fichero local**; S3 queda fuera.

**Dinero**

- **FR-027**: `Money`, `Quantity`, `Price` y `FxRate` DEBEN ser exactos por dentro, rechazar operar entre divisas distintas, serializar como cadena decimal sin exponente, rechazar `number` al parsear y ofrecer `roundToCents()` half-up explícito que solo se invoca en salida.

**CLI**

- **FR-028**: La CLI `atlas` DEBE ofrecer los comandos de `docs/prompts/001-ledger-core.md` §3.5 sobre `--ledger <ruta>` (por defecto `./ledger.jsonl`), mostrar cada evento antes de escribir y pedir confirmación salvo `--yes`, y presentar la salida en tablas de texto con mensajes en español.
- **FR-029**: `atlas export --format jsonl|csv` DEBE volcar el libro completo, incluidos los eventos anulados.

### Entidades clave

- **LedgerEvent**: una línea del libro; envoltorio + campos por `type`. Inmutable, ordenada por posición.
- **Account / Asset**: estado actual proyectado del catálogo; `Asset` conserva `identifier_history`.
- **Settings**: configuración completa vigente en una fecha (`business-rules.md` §7); en esta feature solo se consumen `fiscal_date_rule` y `wash_sale_window_days` (esta última se guarda pero no se aplica).
- **PhysicalPosition**: cantidad por (`account_id`, `asset_id`). Lo que muestra cada bróker.
- **FiscalLot**: lote global por `asset_id`: `id`, `acquisition_date`, `quantity` (abierta), `original_quantity`, `cost_eur` total, `source_event_id`, `source_lot_id?`, `closed`. Nunca almacenado.
- **RealizedGain**: por operación de transmisión y por lote consumido: valor de transmisión, coste, ganancia exacta y redondeada, `fiscal_date`, ejercicio.
- **CashBalance**: importe por (`account_id`, `currency`).
- **PendingTransfer / PendingOrder**: solicitud u orden abierta con su etapa y días transcurridos.
- **IntegrityReport**: lista de hallazgos con severidad y evento(s) implicados.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: Los casos límite obligatorios de la constitución VII que aplican a esta feature (misma fecha, fracciones, venta que parte lote, traspaso parcial, custodia, venta mayor que la posición, anulación de compra vendida, 30/12–02/01, efectivo tras `fx_exchange`) tienen cada uno un test que pasa.
- **SC-002**: Las propiedades "suma de lotes abiertos = posición física por activo", "proyectar dos veces da lo mismo", "corregir y volver al original deja la proyección idéntica" y "un `transfer` nunca genera ganancia" se verifican con generación aleatoria de libros (cientos de casos) sin fallos.
- **SC-003**: El paquete de dominio alcanza el 100 % de cobertura de líneas y ramas, y no importa nada fuera de sí mismo salvo `vendor/`.
- **SC-004**: Un fichero con una línea de esquema futuro nunca se modifica; tras cualquier `append`, el prefijo del fichero es byte a byte el original.
- **SC-005**: El usuario puede, siguiendo solo el README, arrancar en local y registrar una cuenta, un activo, una compra y consultar posiciones en menos de 10 minutos con datos inventados.
- **SC-006**: `lint`, `typecheck`, `test:coverage` y `build` pasan en local y en CI sobre la PR.

## Supuestos

Decisiones de detalle tomadas con los valores por defecto documentados. Las tres dudas Q1-Q3 de `questions.md` las resolvió el usuario el 2026-08-30; A1-A3 recogen la respuesta.

- **A1** (Q1, resuelta: **proyección cronológica**): el catálogo y la configuración se proyectan en orden del fichero; las operaciones y el seguimiento, por `(fecha de negocio, posición)`. Una compra registrada tarde con fecha anterior a una venta se coloca en su fecha y la venta la consume; registrar tarde es normal y no genera aviso. El fichero conserva el orden de registro y sigue siendo el desempate (`data-schema.md` §7.1).
- **A2** (Q2, resuelta): compras en el libro `bucket` se **rechazan** en esta feature porque exigen `thesis_id` y los eventos de tesis llegan en la 002. No se admite `thesis_id` sin validar.
- **A3** (Q3, resuelta): `fiscal_date` se deriva con la configuración **vigente al final del libro** (último `settings_changed`, o los valores por defecto de ADR-0013), pasada como parámetro a la proyección para que el criterio sea local y cambiar la regla recalcule el pasado sin migración.
- **A4**: `withholding` de un `sell` reduce el efectivo recibido pero no altera el valor de transmisión; se conserva para la salida fiscal futura.
- **A5**: `fee?` de un `transfer` es informativo: no altera el coste heredado ni el efectivo (el evento no lleva `currency`).
- **A6**: Los campos de `Settings` marcados "Pendiente" en `business-rules.md` §7 son opcionales en el tipo; solo `fiscal_date_rule` y `wash_sale_window_days` tienen valores por defecto en el dominio.
- **A7**: Los nombres de campo del fichero son los de `data-schema.md` (`reverses_id`, `corrects_id`), no los de ADR-0003 (`reverses_transaction_id`); el esquema es la referencia viva del formato.
- **A8**: `FiscalLot` no lleva `account_id` (ADR-0009: lotes globales); la entidad `Lot` de `docs/specification.md` §4.1 es anterior a ese ADR.
- **A9**: `atlas edit <id>` recibe los campos a cambiar como flags y copia el resto del evento original; `atlas delete <id>` exige `--reason`.
- **A10**: El tipo de cambio no se consulta a ninguna fuente: siempre llega en el evento (`--fx-rate`, `--fx-rate-date`); para EUR es `"1"`.
- **A11**: `valuation` se guarda y se exporta pero no tiene proyección propia en esta feature (`valuations(date)` llega con el Modelo 720).
- **A12**: Node 22 (prompt), no 24 (ADR-0007 lo admitía si estaba disponible).
