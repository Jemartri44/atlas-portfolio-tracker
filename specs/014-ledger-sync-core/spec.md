# Especificación de la feature: Núcleo de la sincronización del libro (`014-ledger-sync-core`)

**Rama**: `feature/014-ledger-sync-core`, creada desde `origin/develop` (`57d0075`; el código es idéntico al de `523abb8`, sobre el que se escribió el encargo: `git diff --stat 523abb8..57d0075 -- packages apps tests` sale vacío)

**Creada**: 2026-09-25 (Europe/Madrid)

**Estado**: **borrador, en el alto del plan.** Espera el visto bueno de la dirección junto con [`plan.md`](plan.md) y las preguntas de [`questions.md`](questions.md). No hay código escrito.

**Entrada**: `docs/prompts/014-ledger-sync-core.md` entero (§0–§6.3) y `docs/api.md`; ADR-0026 con sus cuatro enmiendas y sus notas (manda sobre el encargo si discrepan), ADR-0032, ADR-0033 (punto 6), ADR-0015 con su nota, ADR-0003, ADR-0006, ADR-0012, ADR-0018 (enmienda), ADR-0019 (enmienda), ADR-0020, ADR-0022, ADR-0025; `docs/data-schema.md` §1, §5 y §6.3; `docs/decision-roadmap.md`, Ronda 8; constitución 1.6.1.

---

## Resumen

Dos dispositivos registran sin conexión sobre el mismo libro y, cuando el usuario lo pide, cada uno **reaplica sus líneas pendientes encima de lo que llegó del remoto**: lo que cabe sube, lo que no cabe se **retiene** con su motivo y nunca se pierde (ADR-0026, opción 2). Esta feature construye el motor entero —el dominio puro, los dos clientes sin interfaz y un remoto simulado que cumple `docs/api.md` §5 sin HTTP— y las negativas que protegen un libro sincronizado (`compact`, importar, desactivar con pendientes, `acceptInvalid`). No hay botones ni órdenes: son de la 015.

Cinco reglas atraviesan la feature (§0 del encargo):

1. **Ninguna línea se pierde.** Una línea sale de la cola solo después de releer el remoto y encontrarla dentro, byte a byte; lo retenido se escribe y se asegura en disco antes de quitarlo del libro local; un corte en cualquier punto la deja en uno o en dos sitios, nunca en ninguno.
2. **Ningún número fiscal cambia por sincronizar.** La sincronización mueve bytes y no interpreta nada; nada de `tax/` ni de `informative/` la alcanza, ni ella a ellos. Lo único que puede cambiar es el orden de dos operaciones del mismo día registradas en dos dispositivos, y la salida fiscal es entonces la del fichero reordenado.
3. **Dos clientes, uno por almacén.** La consola sincroniza su carpeta, bajo el cerrojo de la 012 y en una sola toma; la web, su IndexedDB, en una sola transacción. Ninguno escribe en el del otro.
4. **Réplicas idénticas byte a byte**, con dos operaciones nuevas del puerto que escriben líneas crudas sin volver a serializarlas.
5. **La sincronización es explícita.** Nada la dispara: ni el arranque, ni registrar, ni un temporizador, ni recuperar la conexión.

## Escenarios de usuario y pruebas

Los escenarios se prueban **sin interfaz** (no la hay en esta feature): con los clientes llamados desde los tests, contra el remoto simulado, con dos dispositivos de verdad (dos carpetas, o una carpeta y una web sobre el doble de IndexedDB).

### Historia 1 — Que sincronizar no pueda perder una línea (Prioridad: P1)

El usuario registra en el móvil y en el portátil sin conexión, sincroniza cuando quiere, y ninguna operación que escribió desaparece: está en el remoto, en la cola de un dispositivo, retenida o descartada por él.

**Por qué esta prioridad**: perder una línea del libro es lo peor que puede pasar en esta aplicación, y la sincronización es la pieza que más líneas mueve.

**Prueba independiente**: la propiedad de `fast-check` de §3 del plan (dos o tres dispositivos que registran, corrigen y anulan al azar y sincronizan en orden aleatorio, con cortes aleatorios en el paso 6): el conjunto de todas las líneas escritas es igual a la unión de remoto, colas, retenidas y descartadas, y las réplicas son idénticas byte a byte.

**Escenarios de aceptación**:

1. **Dado** una subida aceptada por el remoto cuya respuesta se pierde, **cuando** se sincroniza otra vez, **entonces** esas líneas salen de la cola en el paso 2, por sus bytes, y no se duplican.
2. **Dado** un corte en cada hueco entre las escrituras locales del paso 6 (lo retenido, el libro, el marcador), **cuando** se sincroniza otra vez, **entonces** ninguna línea está en ningún sitio menos de una vez, y una línea que está a la vez en el libro y en lo retenido sale del libro sin reaplicarse.
3. **Dado** que el libro local cambió entre la lectura del paso 1 y la escritura del paso 6 (otra consola añadió una línea), **entonces** no se escribe nada y la sincronización vuelve a empezar.
4. **Dado** una línea con el mismo `id` que una del remoto y bytes distintos, **entonces** queda retenida (el dominio la rechaza con `duplicate_id`), nunca se da por subida.

### Historia 2 — Reaplicar lo pendiente sobre lo que llegó, y retener lo que no cabe (Prioridad: P1)

Lo que el dispositivo registró sin conexión se vuelve a validar, en su orden, encima del remoto, con la misma validación que registrar; la sincronización para en la primera unidad que falla, que queda retenida con su motivo, y nada de lo que va detrás sube hasta que el usuario la resuelve.

**Por qué esta prioridad**: es la opción 2 de ADR-0026; los once casos de «Contexto» son sus escenarios.

**Prueba independiente**: un recorrido completo por caso (1 a 11), con dos dispositivos y el mismo remoto, que acaba comprobando que el remoto carga y es válido, que cada réplica es el remoto seguido de su cola, byte a byte, y que ninguna línea ha desaparecido.

**Escenarios de aceptación** (uno por caso de ADR-0026):

1. **Duplicado**: la misma operación registrada en los dos dispositivos: la segunda en sincronizar la retiene por huella repetida nueva; confirmarla la sube con `confirm_duplicate`.
2. **Consumo cruzado**: una anulación en un dispositivo y una venta que consume sus lotes en el otro: la segunda en llegar la rechaza el dominio y queda retenida.
3. **Doble rectificación**: la segunda corrección de la misma raíz queda retenida (`second_live_correction` o `already_reversed`).
4. **Fotos concurrentes**: un `settings_changed` pendiente con otro ganado por el remoto desde el prefijo queda retenido; un `asset_updated` del mismo activo, también; uno de **otro** activo sube.
5. **Aviso nuevo**: una línea que no avisaba en local y avisa sobre el remoto (huella repetida nueva, ejercicio que el otro dispositivo marcó como presentado) queda retenida; una que ya avisaba al registrarse, no.
6. **Versiones**: un cliente que no sabe cargar el remoto no sube nada y sus pendientes esperan.
7. **Remoto reescrito**: detectado por el hash del prefijo, aunque la reescritura conserve los `id`; no se sube nada, se avisa, y solo al pedir el usuario volver a descargar se retiene todo lo que el dispositivo tenía y el remoto nuevo no.
8. **Reloj**: el remoto rechaza un `recorded_at` más allá de su tolerancia; la línea queda retenida con el motivo del remoto.
9. **Presentación sin conexión**: una `tax_return_filed` pendiente nunca se reaplica sola si el remoto ganó líneas o si una pendiente anterior quedó retenida; queda retenida y se propone registrarla otra vez. El remoto rechaza con `seal_mismatch` una cuyo sello no cuadra.
10. **Corrección que ya no cabe**: si la corrección de una pareja falla, se para **antes de la anulación** y se retienen las dos juntas; la anulación nunca sube sola.
11. **Venta sobre otra base**: detrás de una pareja retenida, la venta que se registró después no sube, aunque cupiera: se queda pendiente.

Y además: la pareja se valida como la escribe la aplicación (compra de 10, venta de 10, corregir la compra a 12: **se acepta**); la cadena de correcciones de tipos sube entera o no sube; una corrección separada de su anulación se rechaza.

### Historia 3 — Resolver lo retenido (Prioridad: P1)

El usuario ve cada línea retenida con su motivo y elige: confirmarla (duplicado, ejercicio cerrado), rehacerla sobre el estado actual (foto concurrente, línea que sella) o descartarla, que es explícito y la deja en `discarded`.

**Por qué esta prioridad**: lo retenido bloquea la cola; sin resolverlo, el dispositivo deja de subir.

**Prueba independiente**: los casos de uso puros de las tres resoluciones y su escritura en los dos almacenes.

**Escenarios de aceptación**:

1. **Dado** un duplicado retenido, **cuando** se confirma, **entonces** la línea vuelve a la cola en su orden y sube con `confirm_duplicate` en la sincronización siguiente; nunca antes de que el usuario lo pida.
2. **Dado** una foto concurrente retenida, **cuando** se rehace, **entonces** se registra un evento nuevo sobre el estado actual y la línea retenida pasa a `discarded` con el motivo `redone` y el `id` del nuevo.
3. **Dado** una presentación retenida que el remoto ya tiene, **entonces** no se ofrece rehacerla.
4. **Dado** una pareja retenida, **cuando** se descarta la anulación, **entonces** su corrección sigue retenida y no sube nunca sola.
5. **Dado** cualquier retenida, **entonces** no sube sola en ninguna sincronización posterior.

### Historia 4 — Iniciar, unirse y desactivar (Prioridad: P2)

El primer dispositivo inicializa el remoto con los bytes enteros de su libro; uno que se une con libro propio elige entre empezar desde el remoto o subir sus líneas como pendientes; desactivar la sincronización es explícito, se niega con pendientes y conserva lo retenido.

**Prueba independiente**: los dos caminos de inicio y la desactivación en los dos almacenes, contra el remoto simulado.

**Escenarios de aceptación**:

1. **Dado** un remoto vacío y un libro válido con una presentación de una carpeta ya compactada, **cuando** se inicializa, **entonces** sube el libro entero con la operación de líneas crudas y el sello de la presentación sigue cuadrando.
2. **Dado** un libro local inválido (un `settings_changed` registrado con `acceptInvalid` antes de activar la sincronización), **cuando** se intenta inicializar, **entonces** el cliente se niega **antes de llamar** al remoto, y dice que primero hay que repararlo.
3. **Dado** un dispositivo que se une y elige subir sus líneas, **entonces** pasan por la revalidación y la huella de duplicados delata las que ya estaban.
4. **Dado** pendientes en la cola, **cuando** se desactiva, **entonces** se niega con su motivo; **dado** lo retenido, **cuando** se desactiva, **entonces** se conserva y queda visible.

### Historia 5 — Lo que se niega sobre un libro sincronizado (Prioridad: P2)

**Escenarios de aceptación**:

1. **Dado** una carpeta sincronizada, **cuando** se ejecuta `atlas compact`, **entonces** se niega y remite a la operación de administración sobre el remoto; también con el marcador ilegible y con `sync/` sin marcador. Un mensaje por motivo.
2. **Dado** pendientes publicadas por **otro** dispositivo, **entonces** la función pura niega reescribir el remoto; **dado** solo retenidas, **entonces** no lo niega (§6.3 (V5)).
3. **Dado** una web sincronizada, **cuando** se importa un libro, **entonces** se niega, comprobado en la misma transacción que la importación, y se dice que primero hay que desactivar la sincronización.
4. **Dado** lo retenido, **cuando** se hace `atlas backup` o se exporta desde la web, **entonces** se copia aparte, rotulado como retenido, y el libro copiado sigue siendo el libro byte a byte.
5. **Dado** la sincronización configurada, **cuando** se registra un `settings_changed` con `acceptInvalid`, **entonces** se niega, en la vista previa y en el registro igual; sin sincronización configurada, ADR-0015 sigue igual.

### Casos límite

- El remoto responde `412` porque otro dispositivo ganó la carrera: se vuelve al paso 1, sin retener nada.
- Un 5xx, un fallo de red, `transport_rejected` o una credencial caducada o revocada: la sincronización para y deja todo pendiente; nunca retiene (§6.3 (V4)).
- El marcador ilegible: sincronizar lo reconstruye con el remoto (la parte común es lo sincronizado); `compact` se niega.
- El prefijo local no cuadra con el marcador (el libro local se reescribió fuera de la sincronización): la sincronización para con su propio motivo, sin subir nada.
- El remoto ya tiene eventos inválidos (un endurecimiento futuro): la sincronización para con su motivo; no es culpa de ninguna línea y no retiene nada.

## Requisitos

### Requisitos funcionales

- **FR-001** El puerto `LedgerStore` gana dos operaciones que escriben **líneas crudas** tal cual —añadir al final, y reemplazar archivando antes el original— con los mismos etag, archivo y rechazos que `append` y `replace`, que validan antes de escribir lo que el cargador exigiría al leer, y que cumplen los tres adaptadores existentes con los mismos tests de contrato.
- **FR-002** `MemoryLedgerStore.replace` valida el nombre del archivo como los otros dos (§6.3 (V13)).
- **FR-003** El dominio gana, detrás de una puerta propia fuera del barril, **un solo caso de uso** de reaplicación de una cola sobre un libro, que usan el cliente y el remoto, con todas las reglas de la tabla del bloque 3 del encargo.
- **FR-004** Cada cliente orquesta los siete pasos de ADR-0026 sobre su almacén y un puerto del remoto, sin interfaz; la consola bajo una sola toma del cerrojo para el paso 6, la web en una sola transacción `durability: "strict"`.
- **FR-005** El estado del dispositivo vive fuera del libro: el marcador, lo retenido y lo descartado, en `sync/` de la carpeta y en claves propias del almacén `ledger` de IndexedDB, sin subir `DB_VERSION`.
- **FR-006** Un puerto del remoto en el dominio y dos remotos simulados (memoria y directorio) que cumplen `docs/api.md` §5 sin HTTP, con costuras de prueba para el `412`, la respuesta perdida y la reescritura.
- **FR-007** Las resoluciones de lo retenido (confirmar, rehacer, descartar), puras en el dominio y escritas en los dos almacenes.
- **FR-008** La función pura que decide si se puede reescribir el remoto o compactar la carpeta, y la negativa de `atlas compact` en una carpeta sincronizada.
- **FR-009** La negativa a importar en una web sincronizada; lo retenido dentro de `atlas backup` y de la exportación de la web; desactivar la sincronización, que se niega con pendientes y conserva lo retenido.
- **FR-010** Con la sincronización configurada, `acceptInvalid` se niega en `checkInvalid`.
- **FR-011** Cada código nuevo de retención, rechazo, parada y negativa, con su literal y traducido en las dos interfaces.
- **FR-012** Ningún número fiscal cambia: la salida de `tax`, `gains`, `income`, `m720`, `m721` y `filed`, byte a byte con y sin `sync/`, y el *golden* intacto.

### Entidades

- **Marcador** (`sync/state.json`, clave `sync:state`): cuántas líneas y qué hash tiene el prefijo sincronizado, si la sincronización está activa o desactivada, y las confirmaciones dadas al resolver.
- **Registro de lo retenido** (`sync/held.jsonl`, clave `sync:held`): cada línea retenida tal cual, con su motivo, la unidad a la que pertenece y, después, cómo se resolvió.
- **Registro de lo descartado** (`sync/discarded.jsonl`, clave `sync:discarded`): la línea tal cual y su motivo.
- **Unidad**: una línea, una pareja de anulación y corrección, o una cadena de parejas; cuenta como una sola línea para la regla de parada.
- **Estado publicado del dispositivo** (`sync/devices/<device_id>.json` del remoto): pendientes, retenidas y última sincronización; el dispositivo lo pone el remoto.

## Criterios de éxito

- **SC-001** La propiedad de «ninguna línea se pierde» pasa con cortes aleatorios en el paso 6, y los once recorridos de ADR-0026 acaban con remoto válido, réplicas idénticas y ninguna línea desaparecida.
- **SC-002** La salida fiscal es idéntica byte a byte con y sin `sync/`, sobre el sintético y sobre un libro reordenado por un recorrido.
- **SC-003** `packages/domain` al 100 % de líneas y ramas; cada mutante de §5 del encargo, visto morir.
- **SC-004** El paquete web dentro de sus techos, o parado y dicho con la medida trozo a trozo (ver `questions.md` §3: **el arranque no cabe con lo que el encargo exige**).

## Supuestos

- En la 014 nada configura la sincronización en producción: la negativa de `acceptInvalid`, la de importar y la de `compact` quedan **inertes** hasta la 015, y se prueban enteras con el estado creado por los tests.
- La tolerancia del reloj del remoto es un parámetro; su valor lo fija la 015.
- El identificador del dispositivo lo da el remoto simulado; cómo lo liga la web a su sesión es de la 015 (`docs/api.md` §5.4).
