# Especificación de la feature: Datos sintéticos, compactación y verificación profunda del libro (`003-synthetic-data`)

**Rama**: `feature/003-synthetic-data`

**Creada**: 2026-08-30

**Estado**: Aprobado por el usuario (2026-08-30); Q1 resuelta (a) con invariante bilateral

**Entrada**: prompt de traspaso `docs/prompts/003-synthetic-data.md` §3 (alcance), §4 (fuera de alcance) y §6 (decisiones fijadas). Deriva de `docs/data-schema.md` §1, §2, §5 y §7, ADR-0003, ADR-0005, ADR-0006 (versión por línea, migración en memoria, `compact` con archivo), ADR-0007 (puertos; `LedgerStore` gana `replace` y `lines`), ADR-0009 a ADR-0013 y la constitución I, VI y VII. Construye sobre `specs/001-ledger-core/` y `specs/002-corporate-actions/`.

## Resumen

Tercera feature de código y cierre de la Fase 1 por el lado de la **supervivencia del libro**. No añade semántica fiscal: todo lo que el libro significa quedó decidido en las features 001 y 002. Lo que añade es la capacidad de **reproducir, verificar y migrar** el libro durante veinte años:

1. **Instantánea canónica** (`snapshotOf`): una foto determinista y serializable de todo lo que exponen las proyecciones, para comparar dos proyecciones del mismo libro.
2. **Generador de libros sintéticos** (`generateLedger({ seed })` y `atlas synth`): un escenario fijo con todos los tipos de evento y los casos raros, con detalles variables por semilla, reproducible byte a byte. Su salida con semilla 1 es el *golden file* `tests/fixtures/ledger/synthetic-v1.jsonl`, congelado tras la fusión.
3. **`compact`** (`atlas compact`): la única operación que reescribe el libro; archiva los bytes originales antes, es no-op si no hay líneas antiguas y aborta si la proyección cambiaría.
4. **Esquema inyectable** (`LedgerSchema`): un esquema de prueba `v2` que solo existe en tests ejercita de verdad el cargador, el `append` y el `compact` con una migración real.
5. **Verificación profunda** (`atlas check --deep`): comprobaciones sobre las líneas crudas (ids duplicados, huellas manipuladas, líneas no canónicas, versiones antiguas, proyección no reproducible) más la referencia colgante que faltaba en `integrity`.
6. **Copia local verificada** (`atlas backup`) y dos ajustes de tooling (`tsBuildInfoFile` dentro de `dist*/` y script `clean`).

Nada fiscal ni estructural se decide aquí. Las dudas y desajustes detectados están en `questions.md` con su supuesto provisional (en particular Q1: el aviso `same_asset_two_accounts` que el propio escenario obligatorio provoca).

## Escenarios de usuario y pruebas *(obligatorio)*

### Historia 1 — Un libro sintético reproducible que sirva de *golden file* (Prioridad: P1)

El usuario (y cada feature futura) necesita un libro de ejemplo realista, con todos los tipos de evento y los casos raros que solo aparecen tras años de operativa, generado en un segundo, sin ningún dato real y **siempre idéntico** para la misma semilla. Lo obtiene con `atlas synth --out <ruta> [--seed <n>]`, y el repositorio guarda la salida de la semilla 1 junto con la instantánea de su proyección como *golden file*: cualquier cambio en la proyección que altere el resultado se detecta al instante.

**Por qué esta prioridad**: sin un libro de referencia, las features 004-005 (importadores, motor fiscal), la Ronda 7 (web en modo demo) y la Ronda 8 (copias y restauración) no tienen contra qué probar. Es el dato que hace verificables todas las demás.

**Prueba independiente**: ejecutar `atlas synth --out demo.jsonl` dos veces con la misma semilla y comparar los ficheros byte a byte; proyectarlo y comprobar que `atlas check --deep` está limpio y que el resumen impreso lista todos los tipos de evento de `docs/data-schema.md` §3.

**Escenarios de aceptación**:

1. **Dado** una semilla `n`, **cuando** se genera el libro dos veces (en procesos distintos, en máquinas distintas), **entonces** los dos ficheros son idénticos byte a byte: mismos `id` (ULID), mismos `recorded_at`, mismas huellas, mismo orden.
2. **Dado** cualquier semilla, **cuando** se proyecta el libro generado, **entonces** no hay eventos inválidos, `integrity` no tiene hallazgos, la suma de lotes abiertos coincide con la suma de posiciones físicas por activo, y los avisos presentes son exactamente los declarados por el generador: ningún código fuera de `SYNTHETIC_EXPECTED_WARNINGS` y al menos un aviso por cada código declarado (Q1: `same_asset_two_accounts` por tener el ETC en dos cuentas).
3. **Dado** cualquier semilla, **cuando** se proyecta cada prefijo del fichero (las primeras `k` líneas, para todo `k`), **entonces** ninguno tiene eventos inválidos: el libro podría haberse registrado evento a evento con `recordEvent`.
4. **Dado** cualquier semilla, **cuando** se proyecta el libro dos veces, **entonces** las dos instantáneas (`snapshotOf`) son idénticas.
5. **Dado** el libro de la semilla 1, **cuando** se compara con `tests/fixtures/ledger/synthetic-v1.jsonl`, **entonces** coinciden byte a byte, y la instantánea de su proyección coincide con `tests/fixtures/ledger/synthetic-v1.snapshot.json`.
6. **Dado** el libro generado, **cuando** se inspecciona su contenido, **entonces** contiene al menos: cuatro cuentas (dos `core` en MyInvestor y en IBKR, una segunda `core` para tener el mismo activo en dos cuentas, una `bucket`); activos de todos los `asset_type` (`fund` ×3, `money_market`, `etc` en USD, `etp`, `stock` ×3 en el cubo) más los que crean los eventos corporativos; `asset_updated` con cambio de identificador y con `active=false` tras un `delisting`; `settings_changed` inicial completo y uno posterior con otros pesos objetivo; aportaciones mensuales a fondos como `order_placed` → `buy` con `amount` y sin `unit_price` a D+2, con una orden pendiente al final y una cancelada; traspaso parcial encadenado A→B→C con `transfer_requested`/`transfer_request_updated` cerrados por el `transfer` y una solicitud pendiente al final; traspaso de custodia del ETC entre las dos cuentas `core` de IBKR; `fund_merger` con ratio no entero sobre un fondo con lotes traspasados; `share_class_change`; `reverse_split` con picos en dos cuentas; `split`; `spin_off` con picos; `merger` con picos; `delisting`; `fx_exchange` EUR→USD antes de la compra del ETC; `dividend` en USD con retención en origen y en España; `interest` con retención; `standalone_fee`; `cash_deposit` y `cash_withdrawal`; venta con pérdida en un fondo seguida de aportación mensual dentro del año; venta el 30/12 con liquidación el 02/01 de una acción del cubo; dos tesis cerradas (ganancia y pérdida) y una abierta con posición viva; un registro tardío (compra con `recorded_at` posterior a una venta de fecha fiscal más reciente que la consume); una corrección de un ejercicio anterior (`reversal` + evento con `corrects_id` registrados en el ejercicio siguiente); `valuation` a 31/12 de cada ejercicio para las cuentas extranjeras.
7. **Dado** una ruta que ya existe, **cuando** se ejecuta `atlas synth --out <ruta>`, **entonces** se rechaza sin tocar el fichero.
8. **Dado** `atlas synth`, **cuando** termina, **entonces** imprime un resumen con eventos por tipo, cuentas, activos y ejercicios cubiertos.

---

### Historia 2 — Compactar el libro sin perder el original (Prioridad: P1)

Con los años, el libro acumula líneas escritas por versiones antiguas del esquema que el cargador migra en memoria en cada arranque. Cuando esa cadena molesta, el usuario ejecuta `atlas compact`: ve cuántas líneas hay por versión y el nombre del archivo que se creará, confirma, y el sistema **archiva los bytes originales tal cual** antes de reescribir el libro entero en la versión actual. Si no hay nada que compactar, no se escribe nada; si la reescritura cambiara la proyección o hay eventos inválidos, se aborta sin escribir.

**Por qué esta prioridad**: es la única operación que reescribe el libro (ADR-0006, `data-schema.md` §5). Si se hace mal, corrompe veinte años de datos en un segundo; si se hace bien, el original sigue en `archive/` para siempre.

**Prueba independiente**: con el esquema de prueba `v2` (Historia 4) y un libro mezclado de líneas v1 y v2, ejecutar `compact` y comprobar que todas las líneas quedan en v2, que el archivo es byte a byte el original y que la instantánea no cambia; repetir y comprobar que es no-op.

**Escenarios de aceptación**:

1. **Dado** un libro con líneas por debajo de la versión actual, **cuando** el usuario confirma `atlas compact`, **entonces** el archivo `archive/ledger-<YYYY-MM-DD>-v<n>.jsonl` (fecha del día en `Europe/Madrid`, `n` = la menor versión presente) contiene los bytes originales exactos, el libro queda con todas sus líneas en la versión actual y la instantánea de la proyección es idéntica a la de antes.
2. **Dado** un libro con todas las líneas en la versión actual (o vacío), **cuando** se ejecuta `compact`, **entonces** no se escribe nada y se informa `nothing_to_compact`; las líneas no canónicas escritas por otro cliente no son motivo para compactar.
3. **Dado** un libro con algún evento inválido, **cuando** se ejecuta `compact`, **entonces** se rechaza sin escribir ni archivar, listando los eventos inválidos; código de salida 1.
4. **Dado** un libro cuya reescritura produjera otra instantánea, **cuando** se ejecuta `compact`, **entonces** se aborta sin escribir (`projection_changed`) indicando las claves de la instantánea que difieren.
5. **Dado** que el libro cambió entre la carga y la escritura (etag distinto), **cuando** `compact` intenta reemplazarlo, **entonces** se rechaza con conflicto y no se escribe ni archiva nada.
6. **Dado** que ya existe un archivo con el nombre calculado, **cuando** `compact` archiva, **entonces** nunca lo sobrescribe: usa el sufijo `-2`, `-3`… y el resultado indica el nombre real.
7. **Dado** un `compact` terminado, **cuando** se muestra el resultado, **entonces** incluye archivo, líneas antes y después, versiones encontradas (recuento por versión) y versión destino.

---

### Historia 3 — Verificar el libro a fondo (Prioridad: P2)

`atlas check` sigue comprobando la proyección (posiciones, lotes, huellas, eventos inválidos). Con `--deep`, el usuario obtiene además lo que solo se ve en las **líneas crudas**: identificadores duplicados, una huella que no corresponde a los campos del evento (línea editada a mano), líneas escritas con otro formato (otro cliente, edición manual), líneas de versiones antiguas (sugiere `compact`) y una proyección que no se reproduce al releer el texto. Y `integrity` gana la comprobación de referencias colgantes que quedó pendiente en la 001.

**Por qué esta prioridad**: es la "verificación trimestral" de la constitución I y VI. Detecta lo que rompe la reproducibilidad del libro antes de que importe (una edición manual del fichero, un cliente antiguo, un fichero copiado a medias).

**Prueba independiente**: `atlas check --deep` sobre `synthetic-v1.jsonl` está limpio (código 0); sobre una copia con una línea editada a mano (huella) o un `corrects_id` colgante devuelve 1 y muestra el hallazgo con su código.

**Escenarios de aceptación**:

1. **Dado** el libro sintético intacto, **cuando** se ejecuta `atlas check --deep`, **entonces** la salida es "libro íntegro" y el código de salida 0.
2. **Dado** un libro con dos líneas con el mismo `id`, **cuando** se ejecuta `check --deep`, **entonces** aparece `duplicate_id` (error) con los ids afectados y el código de salida es 1.
3. **Dado** una línea cuya `fingerprint` no coincide con la huella calculada de sus campos, **cuando** se ejecuta `check --deep`, **entonces** aparece `fingerprint_mismatch` (error) con el id del evento.
4. **Dado** una línea válida pero no canónica (otro orden de claves, espacios), **cuando** se ejecuta `check --deep`, **entonces** aparece `non_canonical_line` (aviso) con la posición de la línea; el código de salida no cambia por un aviso.
5. **Dado** líneas por debajo de la versión actual, **cuando** se ejecuta `check --deep`, **entonces** aparece `outdated_lines` (aviso) con el recuento por versión y la sugerencia de `compact`; tras `compact` el aviso desaparece.
6. **Dado** un libro cuyo texto, releído y proyectado, da otra instantánea, **cuando** se ejecuta `check --deep`, **entonces** aparece `projection_not_reproducible` (error).
7. **Dado** un evento con `reference_etf_id` que no existe en el catálogo, **cuando** se ejecuta `atlas check` (con o sin `--deep`), **entonces** `integrity` informa `dangling_reference` (error). Un `corrects_id` que no apunta a un evento del libro o apunta a uno no anulado ya lo rechaza la proyección (`dangling_correction`) y aparece en la misma tabla como evento inválido; no se duplica.
8. **Dado** `--json`, **cuando** se ejecuta `check --deep`, **entonces** la salida incluye los bloques `findings` (integridad), `deep` (comprobaciones profundas) y `warnings`.

---

### Historia 4 — El cargador migra de verdad: esquema de prueba v1→v2 (Prioridad: P2)

Hoy el esquema está en la versión 1 y la cadena de migraciones está vacía, así que nadie ha visto al cargador migrar una línea real. Esta historia hace inyectable el esquema (`LedgerSchema = { version, migrations }`) para que los tests carguen una fixture v1 con un esquema de prueba v2 que renombra un campo ficticio `note` a `notes`, y comprueben que el cargador migra en memoria, que `append` escribe la línea nueva en v2 sin re-serializar las antiguas, que una versión 3 se rechaza y que `compact` deja todo en v2. La versión real sigue en 1.

**Por qué esta prioridad**: el día que llegue la versión 2 de verdad, el mecanismo tiene que estar probado de extremo a extremo, no solo en una función pura (`data-schema.md` §5, hallazgo 10 del *challenge*).

**Prueba independiente**: cargar `tests/fixtures/ledger/legacy-v1-for-test-schema.jsonl` con el esquema real (carga, `note` ignorado) y con el de prueba (carga, `note` → `notes`, eventos en v2).

**Escenarios de aceptación**:

1. **Dado** la fixture con líneas v1 que llevan el campo antiguo `note`, **cuando** se carga con el esquema de prueba v2, **entonces** cada evento en memoria tiene `schema_version = 2` y `notes` con el valor de `note`; el fichero no cambia.
2. **Dado** la misma fixture, **cuando** se carga con el esquema real (v1), **entonces** carga sin error y `note` se conserva como campo desconocido, sin efecto (supuesto A11).
3. **Dado** un libro cargado con el esquema de prueba, **cuando** se hace `append` de un evento v2, **entonces** el fichero conserva los bytes originales como prefijo exacto y la línea nueva lleva `"schema_version":2`.
4. **Dado** un fichero con una línea `schema_version: 3`, **cuando** se carga con el esquema de prueba (v2), **entonces** se rechaza (`schema_too_new`) sin escribir nada.
5. **Dado** un esquema al que le falta un paso de la cadena, **cuando** se migra una línea que lo necesita, **entonces** falla ruidosamente (`missing_migration`).
6. **Dado** un libro mezclado v1/v2 bajo el esquema de prueba, **cuando** se compacta, **entonces** todas las líneas quedan en v2 con `notes`, el archivo es el original y la instantánea no cambia (Historia 2).

---

### Historia 5 — Copia local verificada del libro (Prioridad: P3)

`atlas backup --to <directorio>` copia los bytes del libro a `<directorio>/ledger-<YYYY-MM-DD>.jsonl`, vuelve a cargar la copia, comprueba que el `etag` y el número de líneas coinciden con el original e imprime ruta, líneas y `etag`. Rechaza si el destino existe. Es una operación de fichero de la CLI; la copia fuera de AWS y la prueba anual de restauración se deciden en la Ronda 8 sobre este comando.

**Por qué esta prioridad**: constitución VI ("prueba de restauración anual desde el backup") necesita al menos una copia verificada y un modo de comprobarla.

**Prueba independiente**: sobre un fichero temporal, `atlas backup --to <tmp>` crea la copia, imprime el mismo `etag` que `atlas check` calcula, y repetido el mismo día devuelve error por destino existente.

**Escenarios de aceptación**:

1. **Dado** un libro en disco, **cuando** se ejecuta `backup --to <dir>`, **entonces** existe `<dir>/ledger-<YYYY-MM-DD>.jsonl` (fecha de hoy en `Europe/Madrid`) con los mismos bytes, y la salida muestra ruta, líneas y `etag`.
2. **Dado** que el destino ya existe, **cuando** se ejecuta `backup`, **entonces** se rechaza sin sobrescribir.
3. **Dado** que la copia no se puede releer con el mismo `etag` o número de líneas, **cuando** termina la copia, **entonces** se informa como error (código 1).

---

### Historia 6 — Construir desde cero tras borrar `dist*/` (Prioridad: P3)

Al cambiar de rama, `tsc -b` falla con TS6305 porque los `.tsbuildinfo` quedan en la raíz de cada paquete y sobreviven al borrado de `dist/`. Con `tsBuildInfoFile` dentro de `dist*/` y un script raíz `clean`, `npm run clean && npm run build` deja el árbol como recién clonado y compila.

**Prueba independiente**: `npm run clean && npm run build` termina sin error y no queda ningún `.tsbuildinfo` fuera de `dist*/`.

**Escenarios de aceptación**:

1. **Dado** un árbol compilado, **cuando** se ejecuta `npm run clean`, **entonces** no queda `dist/`, `dist-test/`, `coverage/` ni `.tsbuildinfo` en ningún paquete.
2. **Dado** un árbol limpio, **cuando** se ejecuta `npm run build`, **entonces** compila sin estado incremental previo y los `.tsbuildinfo` aparecen dentro de `dist*/`.

---

### Casos límite

- `compact` de un libro vacío: no-op (`nothing_to_compact`).
- `compact` con el archivo ya existente: nunca se sobrescribe; sufijo `-2`, `-3`…; si tras un número razonable de intentos sigue habiendo colisión, error.
- `replace` con `etag` viejo: `ConflictError`, sin archivo ni escritura.
- `replace` cuando el libro no existe todavía (fichero ausente): el archivo se crea con cero bytes solo si hay algo que reemplazar; en la práctica `compact` sobre un libro vacío nunca llama a `replace`.
- `synth --out` sobre un fichero existente: rechazo antes de generar.
- `backup` sobre un destino existente: rechazo.
- `check --deep` con una línea editada a mano (huella): `fingerprint_mismatch`; con un `corrects_id` colgante: evento inválido `dangling_correction` en la tabla y código 1; con `reference_etf_id` inexistente: `dangling_reference`.
- `check --deep` con ids duplicados: la proyección lanza incluso en modo `collectErrors`; el comando lo captura y lo presenta como hallazgo `duplicate_id` con código 1 (supuesto A9).
- Líneas antiguas (versión < actual) no se consideran no canónicas por el hecho de estar migradas: la canonicidad se evalúa sobre el texto de la línea tal cual está escrito (supuesto A8).
- El libro sintético en dos cuentas: el aviso `same_asset_two_accounts` es esperado (Q1).
- Registro tardío: la venta debe ser válida también en el prefijo que no contiene la compra tardía (hay lotes anteriores suficientes); al llegar la compra tardía, FIFO la consume primero.
- Corrección de un ejercicio anterior: el evento corregido no puede haber sido consumido (ADR-0003); el escenario corrige un evento sin dependientes (un `dividend`).
- Venta el 30/12 con liquidación el 02/01: `trade_date` y `value_date` en ejercicios distintos; la ganancia cae en el ejercicio de `trade_date` (acción, ADR-0013).
- Instantánea: nada que dependa del momento de ejecución (`days_open`, `pendingOrders(at)`) ni de la posición en el fichero como tal (`position` de lote, `opened_position` de tesis) entra en `snapshotOf`; el orden de los lotes sí, porque es parte del resultado FIFO.
- Escenario con la semilla: importes, cantidades, precios y desplazamientos de día varían dentro de rangos; el esqueleto (qué eventos, en qué orden, qué activos) es fijo, de modo que todos los casos raros aparecen con cualquier semilla.

## Requisitos *(obligatorio)*

### Requisitos funcionales

**Instantánea canónica (`snapshotOf`)**

- **FR-001**: El sistema DEBE ofrecer `snapshotOf(state)`: función pura que devuelve un objeto JSON-serializable con claves ordenadas recursivamente, `Money`/`Quantity`/`FxRate`/`Decimal` como cadenas, sin nada que dependa del momento de ejecución, y que contiene: cuentas (con historial), activos (con `identifier_history`), historial de configuración y configuración fiscal vigente, posiciones físicas, efectivo por cuenta y divisa, lotes abiertos y cerrados por activo (`id`, `acquisition_date`, cantidades, costes, `source_event_id`, `source_lot_id`, consumiciones), ganancias con `gain_eur_rounded` y detalle por lote, rendimientos, valoraciones registradas, órdenes y solicitudes de traspaso con su etapa, tesis con sus métricas, avisos (código, id, detalles) y eventos inválidos (id, tipo, código); los mensajes de texto quedan fuera para que un cambio de redacción no altere la instantánea.
- **FR-002**: Dos estados iguales DEBEN producir el mismo texto con `JSON.stringify`; proyectar el mismo libro dos veces DEBE dar instantáneas idénticas.

**Generador sintético**

- **FR-003**: El sistema DEBE ofrecer `generateLedger({ seed }) → LedgerEvent[]` en `packages/domain/src/synth/`, exportado por `@atlas/domain`, con un generador pseudoaleatorio propio (`seededRandom(seed)`, que implementa `RandomSource`) y un reloj sintético que avanza desde una fecha fija; con la misma semilla la salida DEBE ser idéntica byte a byte (ids, `recorded_at`, huellas). Ningún módulo del dominio fuera de `synth/` DEBE importar de `synth/` (test de arquitectura).
- **FR-004**: El escenario DEBE ser un esqueleto fijo que garantice, para cualquier semilla, el contenido mínimo del escenario de aceptación 6 de la Historia 1; la semilla solo varía importes, cantidades, precios y desplazamientos de fecha dentro de rangos plausibles. Todo dato es sintético: ids `acc_*`/`ast_*`, ISIN `XX…`, nombres inventados, importes redondos.
- **FR-005**: Para cualquier semilla, el libro generado DEBE cumplir: cada prefijo proyecta sin eventos inválidos; `integrity` sin hallazgos; avisos bilateralmente iguales a los declarados (ningún código fuera de `SYNTHETIC_EXPECTED_WARNINGS`, al menos uno por código declarado; Q1); Σ lotes abiertos = Σ posiciones físicas por activo; proyectar dos veces da el mismo `snapshotOf`.
- **FR-006**: `atlas synth --out <ruta> [--seed <n>]` (semilla por defecto 1) DEBE escribir el libro con `FileLedgerStore.append` sobre un fichero inexistente, rechazar si la ruta existe, e imprimir un resumen (eventos por tipo, cuentas, activos, ejercicios).
- **FR-007**: El repositorio DEBE contener `tests/fixtures/ledger/synthetic-v1.jsonl` (salida de la semilla 1 tal cual la escribe la CLI) y `tests/fixtures/ledger/synthetic-v1.snapshot.json` (`snapshotOf` de su proyección), con tests que comprueben (i) reproducción byte a byte, (ii) coincidencia de la instantánea, (iii) los invariantes de FR-005 sobre al menos veinte semillas con `fast-check`. Una vez fusionada, la fixture se congela: solo se regenera en un commit propio y justificado, y se conserva como fixture de migración cuando exista la v2.

**`compact` y el puerto `LedgerStore`**

- **FR-008**: `LedgerStore` DEBE ganar `replace(events, etag, archiveName) → { etag }`: sustituye el contenido completo por `events` serializados canónicamente, solo tras guardar los bytes originales tal cual con el nombre `archiveName`; `etag` viejo → `ConflictError`; archivo ya existente → error (`archive_exists`), nunca se sobrescribe. `LoadedLedger` DEBE ganar `lines: readonly string[]` (líneas crudas, sin salto final, en orden de fichero).
- **FR-009**: `FileLedgerStore.replace` DEBE escribir el archivo en el directorio `archive/` junto al libro (creándolo), con `fsync`, y después el nuevo contenido con temporal + `rename`. `MemoryLedgerStore` DEBE guardar los archivos en un mapa consultable. El contrato del puerto DEBE cubrir `replace` y `lines` en ambos adaptadores.
- **FR-010**: `planCompact(deps)` DEBE cargar, proyectar en modo `collectErrors` y rechazar si hay eventos inválidos, y devolver el plan (etag, líneas por versión, versión destino, `archiveName = ledger-<YYYY-MM-DD>-v<n>.jsonl` con el día en `Europe/Madrid` y `n` = menor versión presente). `compactLedger(deps, plan)` DEBE: volver a cargar y rechazar con conflicto si el etag cambió; devolver `nothing_to_compact` sin escribir si ninguna línea está por debajo de la versión del esquema; si no, serializar los eventos migrados, volver a decodificar el texto resultante, proyectar y comparar `snapshotOf` antes y después, abortando sin escribir (`projection_changed`, con las claves que difieren) si no coinciden; ante `archive_exists`, reintentar con sufijo `-2`, `-3`…; devolver archivo real, líneas antes y después, versiones encontradas y versión destino.
- **FR-011**: `atlas compact [--yes]` DEBE mostrar líneas por `schema_version` y el nombre del archivo, pedir confirmación, e imprimir el resultado; código 1 en rechazo.

**Esquema inyectable**

- **FR-012**: El sistema DEBE definir `LedgerSchema = { version, migrations }` con valor por defecto `CURRENT_LEDGER_SCHEMA` (`version = 1`, cadena vacía), aceptado opcionalmente por `decodeLine`, por la comprobación del envoltorio de `validateShape`, por los constructores de los dos `LedgerStore` y, a través del `store`, por `compactLedger` y `deepCheck`. `CURRENT_SCHEMA_VERSION` NO cambia; `RESERVED_EVENT_TYPES` se conserva tal cual.
- **FR-013**: Los tests del dominio DEBEN definir `TEST_SCHEMA_V2` (`version = 2`, paso `1 → 2` que renombra `note` a `notes`) y el repositorio la fixture `tests/fixtures/ledger/legacy-v1-for-test-schema.jsonl`, compartida por dominio y adaptadores, con los escenarios de la Historia 4. `migrations.test.ts` y `reserved-types.test.ts` siguen verificando lo mismo.

**Verificación profunda**

- **FR-014**: `integrity(state)` DEBE añadir `dangling_reference` (error) para las referencias que la proyección no rechaza; como mínimo `reference_etf_id` de un activo que no existe en el catálogo. Las referencias que la proyección ya rechaza (`corrects_id`, `reverses_id`, `order_id`, `request_id`, `thesis_id`, cuentas y activos) NO se duplican; `plan.md` documenta la tabla "referencia → dónde se comprueba".
- **FR-015**: `deepCheck(lines, events, state) → IntegrityFinding[]` DEBE informar: `duplicate_id` (error), `fingerprint_mismatch` (error: huella almacenada ≠ `fingerprintOf(event)`), `non_canonical_line` (aviso: la línea no coincide con su forma canónica), `outdated_lines` (aviso: líneas por debajo de la versión del esquema, con recuento por versión y sugerencia de `compact`), `unknown_field` (aviso: campo de primer nivel que el tipo del evento no define), `projection_not_reproducible` (error: releer el texto y proyectar da otro `snapshotOf`).
- **FR-016**: `atlas check` sigue igual; `atlas check --deep` DEBE añadir `deepCheck` en la misma tabla, con código 1 si hay algún error; `--json` incluye ambos bloques.

**Copia local**

- **FR-017**: `atlas backup --to <directorio>` DEBE copiar los bytes del libro a `<directorio>/ledger-<YYYY-MM-DD>.jsonl` (hoy en `Europe/Madrid`), rechazar si el destino existe, releer la copia con un segundo `FileLedgerStore`, comprobar `etag` y número de líneas, e imprimir ruta, líneas y `etag`. No toca el puerto ni el dominio.

**Tooling**

- **FR-018**: Cada `tsconfig` de compilación y de test DEBE fijar `tsBuildInfoFile` dentro de su `dist*/` (`dist/tsconfig.tsbuildinfo`, `dist-test/tsconfig.test.tsbuildinfo`; `tests/tsconfig.json` dentro de su `dist/`); el script raíz `clean` DEBE borrar `dist`, `dist-test` y `coverage` de todos los paquetes; el README lo documenta junto al arranque. Sin herramientas nuevas.

**Calidad**

- **FR-019**: `packages/domain` DEBE mantener el 100 % de cobertura de líneas y ramas, incluido `synth/`; Biome limpio; `docs/data-schema.md` sin cambios; sin dependencias nuevas.

### Entidades clave

- **Snapshot**: instantánea canónica de la proyección; objeto JSON con claves ordenadas y decimales como texto. Se compara por igualdad textual.
- **LedgerSchema**: versión del esquema y cadena de migraciones (`v → v+1`) que un cargador aplica en memoria. El real es `CURRENT_LEDGER_SCHEMA`; el de prueba, `TEST_SCHEMA_V2`.
- **LoadedLedger** (ampliado): eventos migrados, `etag` y líneas crudas.
- **Archive**: copia intacta del libro anterior a una compactación, nombrada `ledger-<fecha>-v<n>[-k].jsonl`, nunca sobrescrita.
- **CompactResult**: `compacted` (archivo, líneas antes/después, versiones, destino) o `nothing_to_compact`; los rechazos (`invalid_events`, `projection_changed`, `conflict`) son errores.
- **IntegrityFinding** (reutilizado): severidad, código, mensaje, ids; `deepCheck` añade los códigos sobre líneas crudas.
- **SyntheticScenario**: esqueleto fijo de cuentas, activos y bloques de eventos; los detalles numéricos y de fecha salen del PRNG con la semilla.

## Criterios de éxito *(obligatorio)*

### Resultados medibles

- **SC-001**: `atlas synth` con la misma semilla produce ficheros idénticos byte a byte en ejecuciones y máquinas distintas; el test de reproducción de `synthetic-v1.jsonl` pasa.
- **SC-002**: Los invariantes de FR-005 se verifican sin fallo sobre al menos veinte semillas y sobre todos los prefijos de la semilla 1.
- **SC-003**: `atlas check --deep` sobre `synthetic-v1.jsonl` devuelve 0 sin hallazgos; cada código de `deepCheck` e `integrity` tiene un test con una fixture o línea manipulada que lo dispara.
- **SC-004**: `compact` sobre un libro mezclado bajo el esquema de prueba deja todas las líneas en v2, archivo byte a byte igual al original, instantánea idéntica; el segundo `compact` es no-op; con evento inválido, `etag` viejo o archivo existente, el fichero no cambia.
- **SC-005**: El escenario 6 de la Historia 1 se verifica con un test que cuenta tipos de evento, cuentas, activos y casos raros sobre la fixture.
- **SC-006**: `npm run clean && npm run build` funciona desde cero; `lint`, `typecheck`, `test:coverage` (100 % en `domain`), `build` y CI en verde.
- **SC-007**: Siguiendo solo el README, el usuario genera un libro de demostración, lo compacta, lo verifica en profundidad y hace una copia en menos de 5 minutos.

## Supuestos

Decisiones de detalle tomadas con los valores por defecto documentados. Ninguna es fiscal ni estructural; las dudas de ese tipo están en `questions.md`.

- **A1 — Avisos declarados (Q1, resuelta (a) el 2026-08-30).** El escenario obligatorio pone el ETC en dos cuentas, y la proyección avisa `same_asset_two_accounts` (ADR-0009: "en dos cuentas del mismo libro se permite con aviso"). El invariante es bilateral: ningún aviso fuera de `SYNTHETIC_EXPECTED_WARNINGS` y al menos un aviso por cada código declarado.
- **A2 — Tercera cuenta `core`.** Es una segunda cuenta de IBKR (`acc_ibkr2`): así el traspaso de custodia del ETC es "entre las dos cuentas `core` de IBKR" y el contrasplit liquida picos en dos cuentas. El prompt también la llama "otra plataforma"; se prioriza la frase del traspaso de custodia.
- **A3 — Eventos corporativos del cubo.** `split`, `spin_off` con picos, `merger` con picos y `delisting` actúan sobre las acciones del cubo (única cuenta `bucket`, picos en esa cuenta); `reverse_split` con picos en dos cuentas actúa sobre el ETC del núcleo tras el traspaso de custodia parcial. Una tesis cuyo activo se convierte por `merger` se cierra y se abre otra sobre el activo nuevo antes de vender con pérdida (así ninguna venta queda sin tesis y no hay avisos).
- **A4 — Corrección de ejercicio anterior** sobre un `dividend` (retención mal tecleada): un evento sin dependientes, de modo que ADR-0003 la admite. Se registra en el ejercicio siguiente al del `value_date` corregido.
- **A5 — Registro tardío** sobre un fondo: una compra con fecha valor anterior a una venta ya registrada, que la venta consume por FIFO; en el prefijo sin la compra tardía la venta sigue cubierta por lotes anteriores.
- **A6 — Ratio no entero** del `fund_merger`: decimal (`"1.7"`), multiplicación exacta; el resto exacto de una fracción ya lo cubre la 002.
- **A7 — Instantánea.** Excluye `position`/`opened_position`/`closed_position` (desempates internos), `days_open` y cualquier `at`; incluye el orden de los lotes abiertos (resultado FIFO) y las etapas de órdenes y solicitudes (no solo las pendientes). Se define en `contracts/domain.md`.
- **A8 — Canonicidad de línea** = el texto coincide con la forma canónica del **objeto tal cual está escrito** (claves del envoltorio primero, después las demás en su orden, `JSON.stringify` sin espacios), sin aplicar migraciones; así una línea antigua bien escrita no es "no canónica" (eso lo dice `outdated_lines`).
- **A9 — Ids duplicados.** `projectLedger` lanza `duplicate_id` incluso con `collectErrors` (decisión de la 001); `atlas check --deep` captura ese error y lo presenta como hallazgo con código 1, y `deepCheck` también lo detecta sobre las líneas para el caso en que se le pase un estado parcial.
- **A10 — Colisión de archivo.** El puerto falla con `archive_exists`; el caso de uso reintenta con `-2`, `-3`… hasta un límite (99) y después falla. La CLI muestra el nombre base al confirmar y el nombre real al terminar.
- **A11 — Campos desconocidos.** `validateShape` ignora los campos que no están en las reglas del tipo (comportamiento actual de la 001); por eso la fixture legacy carga también con el esquema real. Se anota en `questions.md` por si el usuario prefiere rechazarlos (sería otra feature).
- **A12 — `LedgerSchema` sustituye a `MigrationChain`/`MIGRATIONS`** (`target`/`steps` → `version`/`migrations`); los tests existentes se adaptan a los nombres nuevos conservando lo que verifican.
- **A13 — Tests con ficheros.** Los tests que leen fixtures del disco (golden file, fixture legacy) viven en `packages/domain/test`, activando los tipos de Node solo en el `tsconfig` de test del dominio; `src` sigue sin `node:` (su propio `tsconfig` con `types: []` y el test de arquitectura). La cobertura del 100 % de `synth/` sale de los tests del dominio.
- **A14 — Coste de la propiedad de prefijos.** Proyectar todos los prefijos de un libro de varios cientos de eventos por semilla es costoso; se hace exhaustivo para la semilla 1 y, si el tiempo lo exige, por bloques del escenario para el resto de semillas (decisión en `plan.md`, con la medida).
- **A15 — `backup` y `synth` usan la ruta y el reloj de la CLI**; el `etag` es el SHA-256 de los bytes, el mismo que calcula `FileLedgerStore`.
