# Plan de implementación: `014-ledger-sync-core`

**Rama**: `feature/014-ledger-sync-core` | **Fecha**: 2026-09-25 (Europe/Madrid) | **Especificación**: [`spec.md`](spec.md) | **Bloque 0 y preguntas**: [`questions.md`](questions.md)

**Estado**: **propuesta, en el alto.** Nada de código escrito. Lo que la dirección tiene que confirmar está marcado **[CONFIRMAR]** y numerado en `questions.md` §5; lo que **para** la feature, en `questions.md` §3 (el arranque del paquete web).

## Contexto técnico

| | |
|---|---|
| Lenguaje | TypeScript estricto, ESM, Node 22.23.2 (`.nvmrc` = 22) |
| Dependencias nuevas | **Ninguna.** `fast-check` ya está en `devDependencies`. Chromium de Playwright (`~/.cache/ms-playwright/chromium-1234`, *Chrome for Testing* 151.0.7922.34) conducido desde el *scratchpad* por el protocolo DevTools, sin paquete |
| Red | **Ninguna petición.** El remoto simulado es un objeto en memoria o un directorio detrás de un puerto |
| Tests | vitest; `packages/domain` al 100 % de líneas y ramas; los remotos simulados y los recorridos en `tests/sync/` |
| Paquete web, partida | medida con `npm run build` sobre `57d0075`: **arranque 75.703 bytes gzip, techo 75.725 (22 de margen)**; **total 276.111, techo 276.480 (369 de margen)**. Idéntica a la del encargo |

## Comprobación contra la constitución

| Principio | Cómo lo cumple el plan | Estado |
|---|---|---|
| I. El libro es la fuente de verdad | El estado de la sincronización vive fuera del libro; ningún campo ni tipo nuevo; `schema_version` no se toca | Sí |
| II. Append-only | Las operaciones de líneas crudas **reemplazan archivando antes** y nunca sobrescriben un archivo; `held.jsonl` y `discarded.jsonl` también son de solo añadir (§5) | Sí |
| II. Fiscalidad solo del libro | Guardianes por alcance antes del motor (§3); test de salida fiscal idéntica con y sin `sync/` | Sí |
| III. Compartimentación | La sincronización no interpreta libros: mueve bytes | Sí |
| IV. Nada configurable en el código | La tolerancia del reloj es un parámetro del remoto; los reintentos ante un `412`, una constante con nombre del cliente **[CONFIRMAR, Q9]** | Sí |
| V. Fallo seguro | Marcador ilegible: `compact` se niega y V7 lo trata como configurado; todo fallo que no es un rechazo de línea para y deja todo pendiente | Sí |
| VI. Veinte años | Ficheros JSON y JSON Lines legibles; la línea del libro, dentro, como cadena JSON (bytes verificados en el bloque 0.4) | Sí |
| VII. Tests primero | La tabla de §4 y los mutantes de §5 del encargo, cada uno visto morir | Previsto |
| Seguridad: validación en el backend | El remoto simulado valida con **el mismo** caso de uso que el cliente (§4) | Sí |

## 1. Dónde vive cada cosa

| Qué | Dónde | Puerta |
|---|---|---|
| **El dominio de la sincronización** | `packages/domain/src/sync/` (nueva): `lines.ts` (hash de un prefijo, partir en líneas), `marker.ts` (el marcador y su reconstrucción), `units.ts` (línea, pareja, cadena; contigüidad P7), `seal.ts` (la clasificación cerrada de los 26 tipos y el sello del remoto), `concurrent.ts` (fotos concurrentes), `confirmations.ts` (avisos que piden confirmación), `evaluate.ts` (la validación de una unidad sobre una base, compartida), `reapply.ts` (**el caso de uso**: el cliente y el remoto), `remote.ts` (la aceptación de `docs/api.md` §5.2 y §5.5), `rewrite.ts` (detección por hash y clasificación por `event_id` y forma canónica), `resolve.ts` (confirmar, rehacer, descartar), `permission.ts` (reescribir el remoto, compactar la carpeta, desactivar, importar), `held.ts` (formato de lo retenido y lo descartado), `reasons.ts` (los literales) | **`@atlas/domain/sync`** (`packages/domain/src/sync.ts`), **nunca** en el barril |
| El puerto del remoto | `packages/domain/src/ports/remote-ledger.ts` (`RemoteLedger`) | por `@atlas/domain/sync` |
| Las operaciones de líneas crudas | `packages/domain/src/ports/ledger-store.ts` (el puerto) y los tres adaptadores | el barril, como el puerto hoy |
| La orquestación de los siete pasos, común | `packages/adapters/src/sync/client.ts`: sin Node y sin DOM; recibe el almacén de estado del dispositivo y el remoto | subruta `./sync-client` (la importa la web; perezosa) |
| **El cliente de la consola** | `packages/adapters/src/sync/folder-store.ts`: el marcador, lo retenido y lo descartado en `sync/`, el paso 6 bajo **una** toma del cerrojo, con las operaciones de fichero **inyectadas** (§6) | barril `"."` de Node |
| **El cliente de la web** | `packages/adapters/src/ledger-store/browser/sync-store.ts`: las claves `sync:*` del almacén `ledger`, el paso 6 en **una** transacción `strict` | subruta nueva **`./sync`**; en `LAZY_ONLY` desde su primer commit |
| Los remotos simulados | `tests/support/sync/simulated-remote.ts` (memoria) y `tests/support/sync/simulated-remote-directory.ts` (directorio: `ledger/ledger.jsonl`, `sync/devices/`) | **solo tests**. *Motivo*: nada del producto puede apuntar a ellos; la 015 reutiliza **el caso de uso del dominio**, no estos objetos, y si sus tests de cliente HTTP los necesitan, los importan de aquí igual. Su nombre y su comentario dicen que no son un adaptador de producción |
| Los recorridos y la propiedad | `tests/sync/` | — |

La orquestación común vive en adaptadores porque el encargo la saca del dominio (§3, bloque 4) y porque es la misma para los dos clientes: lo único que cambia es el almacén de estado, y cada cliente trae el suyo. Así la regla «un cliente por almacén» se ata en el grafo: el cliente de la web es `sync-store.ts` + `client.ts`, y ninguno alcanza `file.ts`, `folder-lock.ts` ni `folder-store.ts`; el de la consola es `folder-store.ts` + `client.ts`, y no alcanza nada de `browser/`.

## 2. Bloque 1 — las operaciones de líneas crudas

**Nombres**: `appendLines(lines: readonly string[], etag: string): Promise<{ etag: string }>` y `replaceLines(lines: readonly string[], etag: string, archiveName: string): Promise<{ etag: string }>`.

- **Escriben los bytes tal cual**: `line + "\n"` por línea, sin `decodeLine`/`encodeLine` para escribir. Mismo separador que `append` si el fichero no acaba en salto.
- **Validan antes de escribir**, todas las líneas antes de tocar nada: cada una con `decodeLine(line, this.schema)` —así una versión más nueva sale con `SchemaTooNewError` (`schema_too_new`) y una ilegible con su `ValidationError` del dominio, reetiquetados con `line N` como hace `load`—, y **una línea con `"\n"` o `"\r"` dentro** con un código propio, **`raw_line_break`**. El `"\r"` se rechaza también, igual que `docs/api.md` §5.2 lo rechaza en `line`: el remoto simulado escribe con esta misma operación y un almacén no puede aceptar lo que el remoto no aceptaría **[CONFIRMAR, Q10]**.
- **Mismos rechazos que `append` y `replace`**: `ConflictError` con un etag viejo, `ArchiveExistsError` con un archivo existente, `invalid_archive_name` con `/` o `\`; nada escrito en ninguno.
- **Memoria**: `MemoryLedgerStore.replace` gana la validación del nombre (V13). **Fichero**: bajo el cerrojo, temporal, `sync`, `assertOwned`, renombrado. **`BlobLedgerStore`**: por `LedgerBlob.update`.
- **El test que las distingue de `append`** (mutante 1): una línea **no canónica** (claves en otro orden, espacios, una `ñ` escrita como secuencia de escape `\u00f1`) se escribe y se relee idéntica; con `append`, la misma línea saldría reserializada. En los tres adaptadores, por el contrato.

### 2.1 El cerrojo no reentrante: cómo va el paso 6 en una sola toma

Hoy `FileLedgerStore.append` y `replace` toman el cerrojo **dentro** (`withFolderLock` → `acquireFolderLock` → `open(…, "wx")`), así que un cliente que ya lo tiene y llama al puerto se bloquea contra sí mismo (`LedgerLockedError`). La solución no toca `folder-lock.ts`:

- `FileLedgerStore` separa **la toma** de **la escritura**. Cada operación que escribe pasa a ser `withFolderLock(folder, (lock) => this.writer(lock).<op>(…))`, y gana un método público **`underLock(fn: (writer: LockedLedgerWriter, lock: HeldLock) => Promise<T>)`** que toma el cerrojo **una vez** y entrega un escritor cuyas operaciones (`bytes()`, `appendLines`, `replaceLines`) **no toman el cerrojo**: exigen el `HeldLock` que se les da, y comprueban `assertOwned` antes de cada renombrado como hoy.
- El almacén de estado de la consola (`folder-store.ts`) escribe `sync/held.jsonl` y `sync/state.json` con **el mismo `HeldLock`**, dentro del mismo `underLock`. Toda la secuencia del paso 6 —comparar el etag leído en el paso 1, comparar `held.jsonl` y `state.json` con lo leído, escribir lo retenido, reescribir el libro, escribir el marcador— ocurre dentro de **una** llamada a `underLock`.
- **Qué lo ata**:
  - *tomar el cerrojo dos veces* (llamar al `replaceLines` público dentro de `underLock`): el test del paso 6 se rompe con `LedgerLockedError` contra sí mismo;
  - *escribir parte de la secuencia fuera*: el sistema de ficheros inyectado (§6) comprueba en **cada** `open` para escribir, `rename` y `rm` dentro de la carpeta que `ledger.lock` existe y lleva **nuestro** testigo; una escritura fuera lo pone rojo;
  - *llamar al remoto con el cerrojo tomado*: el remoto de los tests comprueba en cada llamada que `ledger.lock` **no** existe.

## 3. Bloque 2 — los guardianes, antes que el motor

En `tests/architecture.test.ts`, con los ayudantes que ya tiene (`importGraph`, `reachableFrom`), y con un módulo vacío `sync/reapply.ts` para verlos fallar antes de escribir nada:

1. **Nada fiscal alcanza la sincronización, ni al revés**: desde cada fichero de `tax/`, de `informative/` y desde `project-ledger.ts`, a cualquier profundidad, ningún fichero bajo `sync/` ni `sync.ts`; y desde cualquier fichero de `sync/`, nada de `tax/` ni de `informative/`. Leído del grafo y de la carpeta, no de una lista.
2. **Explícita**: desde los casos de uso que escriben (`record-event.ts`, `rectify.ts`, `compact.ts`, `ecb/rule-change.ts`, `ecb/drafts.ts`) y desde el arranque de la web (`apps/web/src/main.tsx` y lo que alcanza estáticamente) no se alcanza el motor (`sync/reapply.ts`, `adapters/src/sync/`, `browser/sync-store.ts`). En los módulos de sincronización no aparece `setInterval`, `setTimeout`, `addEventListener("online"…)` ni `visibilitychange`.
3. **Un cliente por almacén**: `browser/sync-store.ts` no alcanza `file.ts`, `folder-lock.ts` ni `sync/folder-store.ts`, y `folder-store.ts` no alcanza nada de `ledger-store/browser/`. El test «never writes in a folder of the disk from the browser» queda **sin tocar** y `sync-store.ts` cae en lo que mira (vive en `ledger-store/browser/`): se comprueba con un mutante que escribe en la carpeta desde él.
4. **Puerta fuera del barril**: «keeps the sync engine out of index.ts», como el del BCE.
5. **Fuera del arranque**: `LAZY_ONLY` gana `/packages/domain/src/sync/`, `/packages/domain/src/sync.ts`, `/packages/adapters/src/sync/` y `/packages/adapters/src/ledger-store/browser/sync-store.ts` en el primer commit de cada uno.

Mutantes que se ven morir aquí (§5, 2): importar `sync/` desde `tax/`, desde `informative/`, desde `project-ledger.ts` y desde `record-event.ts`; un `setInterval` en un módulo de sincronización; el barril que reexporta `sync.ts`; y una importación estática desde el arranque (tiene que parar el *build*).

## 4. Bloque 3 — el núcleo puro

### 4.1 El caso de uso, uno para los dos lados

- **`evaluateUnit(base, unit, context)`** (`evaluate.ts`): la validación **compartida** de una unidad encima de una base (líneas crudas y eventos ya proyectables). Decodifica las líneas; proyecta `base + unidad` **entera** con `collectErrors` (una pareja o una cadena, **todos sus miembros juntos**, como `checkCandidate`); separa el fallo propio de un miembro (`member: reversal | correction`, `member_index` en una cadena) de lo que la unidad rompe en otros eventos (`member: "other"` con `affected`); aplica `checkIsinUnique`; calcula las huellas repetidas de cada miembro sobre esa base. Una base que **ya** tiene eventos inválidos no es culpa de la unidad: devuelve `base_invalid` y el llamador para **[CONFIRMAR, Q11]**.
- **`reapplyQueue(base, units, rules)`** (`reapply.ts`): recorre las unidades en orden, **para en la primera que falla** y devuelve cuántas se aceptan y el motivo de la primera que no. Las reglas de cada lado se inyectan como datos, no como ramas escondidas: `clientRules` (fotos concurrentes, avisos nuevos, lo que sella, lo retenido que bloquea) y `remoteRules` (declaraciones, reloj, `confirm_duplicate`, sello, renuncia).
- **`planSync(...)`** (lado del cliente, pasos 1 a 3) y **`acceptAppend(...)` / `acceptInit(...)`** (lado del remoto, `docs/api.md` §5.2 y §5.5) son las dos entradas; las dos llaman a `reapplyQueue`, que llama a `evaluateUnit`. La Lambda de la 015 llamará a `acceptAppend` y `acceptInit`.

### 4.2 La tabla de reglas: el índice de la feature

Una fila por regla de ADR-0026. «Test» nombra el caso que la ata; «mutante», el que lo mata (numeración de §5 del encargo). Los tests del dominio van en `packages/domain/test/sync/`; los de los clientes, en `packages/adapters/test/sync/`; los recorridos, en `tests/sync/`.

| # | Regla | Lado | Test que la ata | Mutante que la rompe |
|---|---|---|---|---|
| R1 | Cola = líneas después del prefijo del marcador (cuántas y hash de sus bytes) | Cliente | `marker.test`: con marcador `n`, la cola empieza en `n`; con el prefijo local que no da el hash, para con `local_prefix_changed` | 4a: tomar la cola desde otra posición |
| R2 | Reescritura detectada **por el hash de los bytes del prefijo**; no se sube nada; solo se vuelve a descargar a petición | Cliente | `rewrite.test`: compactación que **conserva los `id`** y cambia un byte → detectada; `client.test`: tras detectarla, cero llamadas a `append`; `redownload` solo al llamarlo | 11a por identificadores; 11b subir algo; 11c volver a descargar solo |
| R3 | Al volver a descargar, se retiene **todo** lo que el dispositivo tenía y el remoto nuevo no, pendiente o sincronizado, **por `event_id` y forma canónica** sin `tax_return_filed.ledger_fingerprint` | Cliente | `rewrite.test`: sincronizada ausente → retenida; mismo `id` y contenido distinto → retenida; presentación resellada por `compact` → **no** retenida; compactación → nada retenido | 11d solo lo pendiente; 17bis-V2 por bytes; V15 quitar el campo de la lista, ignorar otro campo |
| R4 | Lo que el remoto ya tiene sale de la cola, **por bytes exactos** (paso 2) | Cliente | respuesta perdida: la siguiente quita esas líneas y no duplica; misma `id` y otros bytes → retenida (`duplicate_id`), no quitada | 4b quitar por `id`; 10a quitar con la respuesta de la subida |
| R5 | Revalidación unidad a unidad, en orden local, **encima del remoto**, con la validación de registrar | Los dos | caso 2 y 3: rechazo del dominio → retenida con `domain_rejected` y `domain_code` | 5a sobre la base local; 5b no retener un rechazo |
| R6 | Aviso nuevo que pide confirmación (caso 5): comparar sobre la base local y sobre el remoto; la lista, §8 | Cliente | huella repetida nueva → `new_duplicate`; ejercicio presentado nuevo → `new_closed_year`; uno que ya estaba al registrarse → sube (con `confirm_duplicate` si es huella) | 5c no retener el nuevo; 5d retener el que ya estaba |
| R7 | Foto concurrente (caso 4): `settings_changed` si el remoto ganó **cualquier** `settings_changed` desde el prefijo; `account_updated`/`asset_updated` si el remoto cambió **esa** cuenta o **ese** activo | Cliente | los tres, y uno de **otro** activo que sube | 6a, 6b, 6c |
| R8 | Lo que sella no se mueve (caso 9): `tax_return_filed` y `filing_fingerprint_waived` se retienen si el prefijo sobre el que caerían no es, byte a byte, el local que tenían delante (el remoto ganó líneas, o una pendiente anterior quedó retenida). **El remoto** rechaza con `seal_mismatch` la `tax_return_filed` cuyo `ledger_fingerprint` no cuadra | Los dos | clasificación **cerrada** `SEALING: Record<SupportedEventType, boolean>` (el compilador exige las 26 claves) y un test que recorre `SUPPORTED_EVENT_TYPES` y `RESERVED_EVENT_TYPES`; remoto con sello roto → `seal_mismatch` | 7a reaplicar con el remoto crecido; 7b detrás de una retenida; 7c quitar un tipo; 7d tipo nuevo sin clasificar; P6 el remoto acepta un sello roto |
| R9 | La pareja es una unidad en los dos sentidos, **validada junta** como la escribe la aplicación; si falla, se para **antes de la anulación**; cuenta como una línea; un tercer evento roto se nombra (`member: "other"`, `affected`) | Los dos | caso 10; compra 10, venta 10, corregir a 12 → **aceptada**; tercer evento → `pair_rejected` con `member: "other"` | 8a–8f; V1 validar la anulación sola; V1 no nombrar el tercero |
| R10 | La cadena de correcciones de tipos es **una** unidad (P1): cómo se reconoce, §9 | Los dos | cadena de tres parejas con la segunda corrección rota → se retienen las tres, en la anulación de la primera; en el remoto, `chain_continues` y `pair_incomplete` | P1 subir la mitad; P1 partirla entre dos subidas |
| R11 | La corrección va **justo detrás** de su anulación (P7) | Los dos | corrección separada por otra línea → retenida con `pair_not_contiguous`; en el remoto, el mismo código en el índice de la anulación o de la corrección suelta | P7 aceptar una separada |
| R12 | Parar en la primera que falla; las anteriores suben | Los dos | tres unidades, la segunda rota: sube la primera, la segunda retenida, la tercera **pendiente** | 9a seguir después |
| R13 | La cola no avanza detrás de algo retenido, **también en la sincronización siguiente** | Cliente | con una retenida sin resolver, la sincronización siguiente sube **cero** líneas aunque cupieran; lo de detrás sigue **pendiente**, no retenido | 9b subir lo de detrás; 9c convertirlo en retenido; 17ter subir sola una retenida |
| R14 | Rechazos del remoto (paso 4): **solo** `rejected.code` retiene, con el motivo del remoto; `412` vuelve al paso 1; todo lo demás para y deja todo pendiente | Cliente | un test por código de `docs/api.md` §5.2 y por clase de fallo (5xx, red, `transport_rejected`, `session_invalid`, `device_token_expired`, `device_token_revoked`) | 17ter retener tras un `412`; 17ter no retener un `rejected.code`; V4 retener un 5xx, la red o una credencial |
| R15 | Versiones (caso 6): un remoto que no se sabe cargar → no se sube nada | Cliente | remoto con `schema_version` 2 → parada `remote_schema_too_new`, cero subidas, cola intacta | 17ter subir algo |
| R16 | El primer dispositivo inicializa con los **bytes enteros**; uno que se une **elige**; el remoto inicializa solo sobre vacío, con confirmación de duplicados deducida y tolerancia del reloj; una renuncia por la ruta de añadir se rechaza; el cliente se niega a inicializar un libro inválido **antes de llamar** | Los dos | presentación de carpeta compactada que sigue cuadrando tras inicializar; `init` sobre remoto no vacío → `412`; `confirm_duplicate_ids` deducidos; `recorded_at` futuro → `init_rejected`; libro inválido → negativa sin llamada | V6 línea a línea; V6 sobre no vacío; V6 renuncia por añadir; V17 sin duplicados o sin reloj; V7 inicializar inválido o llamar antes de negarse; 17ter fusionar sin elegir; 17ter subir las del que se une sin revalidar |
| R17 | `acceptInvalid` con la sincronización configurada se niega **en `checkInvalid`** | Cliente y casos de uso | vista previa y registro fallan igual con `accept_invalid_while_synced`; sin configurar, ADR-0015 igual | V7 admitirlo; negarlo sin sincronización; negarlo solo en el registro |
| R18 | Resolver: confirmar, rehacer, descartar; nunca rehacer una presentación que el remoto tiene; descartar una anulación retiene su corrección | Cliente | §10 | 8e descartar la anulación sin retener la corrección; V16 ofrecer rehacer |
| R19 | El remoto (`docs/api.md` §5.2): `If-Match` obligatorio, `412` sin escribir, tramo válido hasta la primera rechazada, `confirm_duplicate` por línea, declaraciones de pareja y cadena, tolerancia del reloj, versiones, `duplicate_id` como `domain_rejected` | Remoto | `remote.test` fila a fila de la tabla de §5.2, en su orden | 13a–13e; V8 `duplicate_id` como `line_invalid`; caso 8 aceptar un reloj adelantado |
| R20 | El dispositivo del estado publicado **lo pone el remoto** | Remoto | un `device_id` en el cuerpo → `body_invalid`; el fichero lleva el de la credencial simulada | 13f publicar con el del cuerpo |
| R21 | El remoto nunca recibe un libro inválido; lo retenido nunca sube solo | Los dos | la propiedad de `fast-check` (§7) comprueba tras cada paso que el remoto carga y es válido | 10c perder una línea en un hueco |

## 5. Los formatos, como contrato

### 5.1 `sync/state.json` (consola) y la clave `sync:state` (web): el marcador

Un objeto JSON, el mismo en los dos almacenes:

```json
{
  "sync_format": 1,
  "status": "enabled",
  "synced_lines": 1234,
  "synced_sha256": "<sha256 hex de los bytes de las primeras synced_lines líneas, cada una con su \n>",
  "remote_etag": "<etag del remoto en la última sincronización>",
  "last_sync_at": "2026-10-01T10:00:00Z",
  "confirmations": [
    { "line_sha256": "<sha256 de los bytes de la línea>", "duplicates": ["<id>"], "closed": ["<filing_id>"], "confirmed_at": "…" }
  ]
}
```

- `synced_sha256` es el SHA-256 del **prefijo del fichero**: `lines[0..n)` unidas con `"\n"` detrás de cada una. Es el mismo número para el libro local y para el remoto, porque los dos son, en ese tramo, los mismos bytes.
- `status`: `enabled` o **`disabled`** (§12.4). Un fichero ilegible, con un `sync_format` más nuevo o sin los campos es **ilegible** a todos los efectos: `compact` se niega, V7 lo trata como configurado, y sincronizar lo reconstruye.
- **Reconstruirlo** (segunda enmienda: «para sincronizar se puede reconstruir») es puro: `rebuildMarker(local, remote)` = el prefijo común más largo, **por bytes**, de las líneas locales y las remotas. Nada más hace falta guardar para eso.
- `confirmations`: dónde se recuerda una confirmación dada al resolver (§10.1). Se vacía de cada línea en cuanto el paso 5 la encuentra en el remoto.

### 5.2 `sync/held.jsonl` y `sync/discarded.jsonl` (consola), `sync:held` y `sync:discarded` (web): de solo añadir

`docs/data-schema.md` §1 los retiene **para siempre**, así que **nunca se reescriben**: resolver una retenida **añade** un registro, no borra el anterior. Un registro por línea de JSON Lines; **la línea del libro va dentro como cadena JSON** en `line`, de modo que se separa de sus metadatos sin tocar sus bytes (`JSON.parse(record).line` devuelve exactamente la cadena original: bloque 0, punto 4).

```jsonl
{"held_format":1,"kind":"held","at":"…","unit":"<sha256 de la primera línea de la unidad>","member":0,"members":2,"origin":"client","reason":{"code":"pair_rejected","details":{…}},"line":"<la línea exacta>"}
{"held_format":1,"kind":"redo_started","at":"…","line_sha256":"…","event_id":"<ULID del evento que la rehará>"}
{"held_format":1,"kind":"resolved","at":"…","line_sha256":"…","resolution":"confirmed|redone|discarded","event_id?":"…"}
```

- **Retenida sin resolver** = un registro `held` sin un `resolved` posterior con el mismo `line_sha256` (SHA-256 de los bytes de la línea).
- `origin`: `client` (paso 3), `remote` (paso 4, `reason.code` = el `rejected.code` del remoto, tal cual), `rewrite` (al volver a descargar) o `join` (§11.2). Cada `reason.code` es un literal propio (§13).
- `discarded.jsonl`: `{"discarded_format":1,"at":"…","reason":{"code":"discarded_by_user|redone|…"},"replaced_by?":"<id>","line":"…"}`.
- En IndexedDB, cada clave guarda **el mismo texto** que el fichero; añadir es leer, concatenar y escribir **dentro de la transacción** del paso 6 o de la resolución.

### 5.3 Los nombres

- **Claves de IndexedDB**: `sync:state`, `sync:held`, `sync:discarded`. Un test comprueba que no chocan con `CURRENT_KEY`, `META_KEY`, el prefijo `archive/` ni las claves de precios y del BCE **leídas de las constantes de los adaptadores** (hoy `KEY` es privada en `prices.ts` y `reference.ts`: se exporta, sin cambiar su valor).
- **Archivo de una sincronización que reordena** (`docs/data-schema.md` §1 no lo nombra): **`archive/pre-sync-<YYYY-MM-DD>T<HHmmss>-<los 12 primeros hex del etag archivado>.jsonl`**, fecha y hora en `Europe/Madrid`. Nunca se sobrescribe; si existiera, el paso 6 para con `ArchiveExistsError` y no escribe nada. También `archive/pre-join-…` para empezar desde el remoto y `archive/pre-redownload-…` al volver a descargar (§11) **[CONFIRMAR, Q12]**.
- **`sync/devices/<device_id>.json`** en el remoto simulado de directorio: `{ "device_format": 1, "device_id", "pending", "held", "last_sync_at", "published_at" }`, con el `device_id` de la credencial simulada que el test le da al construirlo.
- **La copia de lo retenido**: `atlas backup` escribe `ledger-<fecha>.held.jsonl` junto a `ledger-<fecha>.jsonl`, copia byte a byte de `sync/held.jsonl` verificada como la del libro; la web exporta `ledger.held.jsonl` como segunda descarga. **Sin retenidas sin resolver, no se escribe** y la salida lo dice **[CONFIRMAR, Q13]**.

## 6. El paso 6: orden de las escrituras locales y sus cortes

**Consola**, dentro de **una** llamada a `underLock` (§2.1):

| Paso | Qué | Si el proceso muere **antes** de este paso |
|---|---|---|
| 6.0 | Leer el libro, `held.jsonl` y `state.json`; comparar con lo leído en el paso 1. Si algo cambió: nada escrito, `ConflictError`, vuelta al paso 1 | Nada ha cambiado. La siguiente sincronización rehace todo; lo subido en el paso 4 sale de la cola en el paso 2, por bytes |
| 6.1 | **Añadir a `held.jsonl`** los registros nuevos: temporal `"wx"`, escribir, **`sync()` del manejador**, `assertOwned`, renombrar, `sync()` de `sync/` | Igual que arriba |
| 6.2 | **Reescribir el libro**: `appendLines` si solo llegó cola del remoto (el libro local es prefijo del nuevo); si no, `replaceLines` **archivando antes** los bytes locales | La línea retenida está **en los dos sitios**: en `held.jsonl` y en el libro. La siguiente la reconoce **por bytes** (línea de la cola que está en una retenida sin resolver): no la reaplica y la quita del libro |
| 6.3 | **Escribir el marcador** (`state.json`): temporal `"wx"`, `sync()`, `assertOwned`, renombrar | El libro ya es el remoto más su cola, con el marcador viejo. La siguiente calcula la cola desde el prefijo viejo, que sigue cuadrando con el remoto, y el paso 2 quita por bytes las líneas remotas que ya están |

- **Las operaciones inyectadas** (§6.3 (V9)): `FileLedgerStore` y `folder-store.ts` reciben un `FileOps` (`open`, `rename`, `rm`, `readFile`, `mkdir`, `fsyncDir`), por defecto el de `node:fs/promises`. El test envuelve el real sobre una carpeta temporal y **registra** `write`, `sync`, `rename` y `rm` con su ruta; **falla si el `sync()` del manejador de `held.jsonl` no aparece antes del primer `open` del temporal del libro**. Con la misma envoltura se comprueba el cerrojo en cada escritura (§2.1).
- **El test de cada hueco**: la envoltura lanza en el punto elegido (antes de 6.1, entre 6.1 y 6.2, entre 6.2 y 6.3, y dentro de 6.2 entre archivar y renombrar); después se sincroniza otra vez y se comprueba que ninguna línea está en ningún sitio menos de una vez y que la línea que quedó en los dos sitios sale del libro sin reaplicarse.

**Web**: 6.0 a 6.3 son **una** transacción de lectura y escritura sobre el almacén `ledger`, **`{ durability: "strict" }`** (bloque 0, punto 1), abierta en `sync-store.ts` y no en `transact` de `indexeddb.ts` (que está en el arranque: una opción más allí son bytes del arranque). Lee `current`, `sync:state` y `sync:held`, compara con lo leído en el paso 1, y escribe el archivo (`add`, que falla si existe, **sin** `preventDefault` que deje seguir la transacción), `sync:held`, `current` y `sync:state`. No hay huecos: el test estructural cuenta **una** transacción `readwrite` con `strict` (el doble de IndexedDB gana registrar las opciones), y el de aborto a mitad comprueba que no queda nada. La atomicidad y la durabilidad en Chromium de verdad están verificadas en el bloque 0.

## 7. La propiedad de «ninguna línea se pierde»

Con `fast-check` sobre el sintético: dos o tres dispositivos (consola sobre carpeta temporal y web sobre `fake-idb`) que registran, corrigen y anulan al azar, y sincronizan en orden aleatorio contra el remoto simulado de directorio, con cortes aleatorios en los huecos de §6 (y el `412` y la respuesta perdida de las costuras). Al final: el remoto carga y es válido; cada réplica es el remoto seguido de su cola, byte a byte; y **el conjunto de todas las líneas escritas = remoto ∪ colas ∪ retenidas sin resolver ∪ descartadas ∪ resueltas que volvieron a la cola**. Se ejecuta con un número de corridas acotado para que la suite no pase de un minuto; la semilla, fija y escrita.

## 8. Qué avisos «piden confirmación» (caso 5), leídos del código

Enumerados leyendo `packages/domain`, `apps/cli` y `apps/web` (detalle con `fichero:línea` en `questions.md` §4). **Propuesta**:

| Aviso | Dónde se emite | Depende de | Propuesta |
|---|---|---|---|
| **Huella repetida** (`DuplicateFingerprintError`, ADR-0012) | `usecases/record-event.ts:209-212`, `rectify.ts:170-173`; consola `--confirm-duplicate`; web `DuplicateDialog.tsx` | Solo el libro | **Entra** (`new_duplicate`). Nuevo = el conjunto de `id` repetidos sobre el remoto tiene alguno que no estaba sobre la base local (o en la confirmación guardada, §10.1). Si ya estaba, sube con `confirm_duplicate` |
| **Ejercicio cerrado** (`closedYearsTouched`, ADR-0020) | `filings/touched.ts:121-139`; la consola lo imprime antes de la pregunta general; la web, `ClosedYearNotice` | El libro y el día de hoy | **Entra** (`new_closed_year`), aunque hoy ninguna interfaz lo pregunta aparte (es un aviso delante del «¿Registrar?»): ADR-0026 lo pone de ejemplo. Se compara con **el mismo** «hoy» sobre las dos bases, así que solo lo mueve el libro. No usa el motor fiscal |
| `newly_invalid_events` (`acceptInvalid`, ADR-0015) | `record-event.ts:187-190` | Solo el libro | **No es un aviso**: con la sincronización configurada es una negativa (V7), y sobre el remoto es un rechazo del dominio (`domain_rejected`) |
| Tipo del BCE tecleado distinto del oficial (`rateConfirmations`) | `ecb/propose.ts:119-134`; consola `--confirm-fx-rate`; web `RateNotes` | **El histórico del BCE del dispositivo**, no el libro | **No entra**: lo que se confirmó es un tipo frente al histórico, y ninguna línea del remoto lo cambia salvo un cambio de `fiscal_date_rule`, cuyo flujo propio (ADR-0029) ya propone la cadena de correcciones; y `check --deep` señala siempre un tipo que no es el oficial. El remoto no tiene por qué tener el histórico del dispositivo |
| Silenciar avisos de umbral (`silencedWarnings`) | `projections/settings-impact.ts:116-133`; solo interfaces | El libro, **el reloj y los precios** | **No entra** |
| Tipos tras un cambio de regla (`ruleChangeRates`) | `ecb/rule-change.ts:108-159`; solo interfaces | El libro y el histórico del BCE | **No entra** |
| Ejercicios que mueve un cambio de configuración (`movedFiscalYears`, `movedTaxYears`) | `settings-impact.ts:83-103` y **`tax/year.ts:187-240`** | El libro y **el motor fiscal** | **No entra**: el guardián de §3 prohíbe a la sincronización alcanzar `tax/` |

Los cuatro que no entran afectan solo a un `settings_changed` pendiente. **Alternativa conservadora** para la dirección: retener **todo** `settings_changed` pendiente si el remoto ganó **cualquier** línea desde el prefijo (no solo otro `settings_changed`), porque su efecto depende del libro entero **[CONFIRMAR, Q3]**.

## 9. Cómo se reconoce en la cola una cadena de correcciones de tipos (§6.2 P1)

**Propuesta: una cadena es toda secuencia contigua y maximal de dos o más parejas en la cola**, donde pareja = una `reversal` seguida **inmediatamente** de la línea cuyo `corrects_id` es su `reverses_id`. Se evalúa entera (todos sus miembros añadidos juntos, como `rule-change.ts:270-275`), se sube entera con `chain_continues: true` en la corrección de cada pareja salvo la última, y si falla cualquier miembro se retiene entera en la anulación de la primera.

- **El caso que no distingue**: dos correcciones **independientes** que el usuario hizo una detrás de otra sin registrar nada entre medias (corregir A, después corregir B) son, en la cola, indistinguibles de una cadena de dos parejas. Se tratan como una.
- **En qué dirección se equivoca**: **retiene de más, nunca parte una cadena**. Si falla B, A se retiene con ella aunque cupiera; el usuario la confirma o la rehace. Una cadena real nunca se parte, porque `writeRateCorrections` escribe sus parejas contiguas en una sola escritura (`rule-change.ts:280-283`) y nada puede colarse entre ellas.
- **Lo que no se usa, y por qué**: los `id` consecutivos y `recorded_at` (cada `completeDraft` lee el reloj por su cuenta: dos miembros de una cadena pueden caer en milisegundos distintos, y un generador nuevo de ULID no garantiza continuidad); el `reason` de la anulación, que en una cadena es el mismo en todas las parejas (`prepareRateCorrections` recibe un solo `reason`), pero exigirlo **ata la regla a un detalle de implementación** que un cambio futuro rompería en silencio, y entonces **sí** partiría una cadena. Lo propongo solo como refinamiento si la dirección quiere retener menos **[CONFIRMAR, Q2]**.
- **Sin campo nuevo**: no hace falta tocar el esquema.

## 10. Resolver lo retenido

### 10.1 Dónde se recuerda una confirmación

Una línea del libro no guarda que se confirmó. **Propuesta**: confirmar una retenida la **devuelve a la cola** —al libro local, justo detrás del prefijo sincronizado y delante de lo que siga pendiente, que es su orden local— y guarda en el marcador una **confirmación** con el SHA-256 de sus bytes y lo que se confirmó (los `id` repetidos, los ejercicios cerrados). En la reaplicación siguiente, un aviso «nuevo» cubierto por esa confirmación no retiene, y la línea sube con `confirm_duplicate`; si sobre el remoto aparece un aviso **distinto** del confirmado (otro `id` repetido, otro ejercicio), se retiene otra vez. La confirmación se borra del marcador cuando el paso 5 encuentra la línea en el remoto. Todo en una escritura: `replaceLines` (archivando) + registro `resolved` en `held.jsonl` + marcador, bajo una toma o en una transacción.

### 10.2 Rehacer

Para una foto concurrente, una línea que sella o una retenida tras volver a descargar. El dominio devuelve **el borrador** (la línea sin sobre, sin huella y sin `corrects_id`; una pareja se rehace como corrección nueva del mismo objetivo) para que la interfaz de la 015 lo precargue. Para no repetir el defecto de §11.1 de la 012, rehacer usa **el identificador sellado antes**, como los borradores del BCE: (1) se añade `redo_started` con el `event_id` que tendrá el evento nuevo; (2) se registra con ese `id` por el caso de uso normal; (3) se añaden `resolved: redone` y el registro de `discarded` con `reason: redone` y `replaced_by`. Tras un corte, solo un evento con **exactamente** ese `id` cuenta como «ya rehecho». **Nunca se ofrece rehacer una `tax_return_filed` cuyo `event_id` tiene el remoto** (V16): la función que lista las resoluciones posibles no la incluye y el caso de uso la rechaza (`redo_filing_in_remote`).

### 10.3 Descartar

Explícito: la línea pasa a `discarded.jsonl` con `discarded_by_user` y se añade `resolved: discarded`. **Descartar la anulación de una pareja retenida deja su corrección retenida**, con el motivo añadido `partner_discarded`: nunca vuelve sola a la cola (la subiría suelta). Descartar la unidad entera descarta todos sus miembros.

### 10.4 Lo retenido que bloquea

Toda retenida sin resolver —de cualquier origen, también las de una reescritura— bloquea la subida de **toda** la cola: todo lo pendiente se registró después de ella en el orden local **[CONFIRMAR, Q4]**. Y una consecuencia que la ADR no dice y que quiero que la dirección vea antes de construir: al retener una pareja, **lo que va detrás se queda en el libro local**, y el libro local puede quedar **inválido** (caso 11: sin la corrección de la compra a 20, la venta de 15 que sigue pendiente vende más de lo que hay). Las consultas degradan (ADR-0015) y las mutaciones se niegan hasta resolver **[PREGUNTA, Q1]**.

## 11. Los dos clientes, paso a paso

`client.ts` recibe el almacén de estado (`SyncStateStore`: leer la foto del paso 1, escribir el paso 6, resolver, iniciar, desactivar) y el `RemoteLedger`, y devuelve un resultado con su motivo; **nunca lanza por un rechazo de línea**.

1. Leer la foto local (libro, etag, marcador, retenidas, confirmaciones). **Sin el cerrojo**, descargar el remoto. Comprobar el prefijo local contra el marcador (`local_prefix_changed`), el remoto contra el marcador (`remote_rewritten`) y que el remoto carga (`remote_schema_too_new`, `remote_unreadable`). Marcador ilegible: se reconstruye.
2. Quitar de la cola lo que la cola del remoto ya tiene, por bytes; y lo que ya está en una retenida sin resolver (corte entre 6.1 y 6.2).
3. Si hay retenidas sin resolver: no se reaplica nada. Si no: `planSync` → las unidades aceptadas, la primera retenida y lo que queda pendiente.
4. Subir las aceptadas con `If-Match`. `412` → paso 1, hasta `MAX_CONTENTION_RETRIES` (propuesta: 3) y después para con `remote_contention`. `rejected` → esa unidad se retiene con `origin: remote`; lo de detrás, pendiente. Cualquier otro fallo → para, **sin escribir nada local**.
5. Releer el remoto y quitar de la cola **solo** lo que está dentro, byte a byte.
6. §6.
7. Publicar `{ pending, held, last_sync_at }`. Si falla, la sincronización ya está escrita en local: se dice (`publish_failed`) y la siguiente lo vuelve a publicar.

### 11.1 Iniciar

- **Primer dispositivo** (`initRemote`): el cliente comprueba **antes de llamar** que el libro proyecta sin inválidos (`init_refused_invalid_ledger`); deduce `confirm_duplicate_ids` (los `id` de todo evento cuya huella repite la de uno **anterior en el fichero**, la misma regla que aplica el remoto); llama a `init` con `If-Match` = SHA-256 de cero bytes; y escribe el marcador con todo el libro sincronizado.
- **El remoto** (`acceptInit`): solo sobre cero bytes (`412` si no); carga con su esquema, proyecta válido, tolerancia del reloj en cada línea, toda huella repetida en `confirm_duplicate_ids`; cualquier fallo, `init_rejected` con el código y la línea; escribe con `appendLines` sobre el etag de cero bytes: es un añadido sobre nada, como dice la nota de ADR-0026, y no archiva nada.

### 11.2 Unirse con libro propio: el usuario elige

- **Empezar desde el remoto** (`joinFromRemote`): el libro local se sustituye por el remoto con `replaceLines`, **archivando antes** los bytes locales, y **se retiene** —con la clasificación de R3, `origin: join`— lo que el libro local tenía y el remoto no. Nada desaparece de la vista del usuario **[CONFIRMAR, Q5]**.
- **Subir mis líneas como pendientes** (`joinWithMine`): el libro local pasa a ser el remoto seguido de **todas** sus líneas, en su orden; el marcador, el remoto. La sincronización siguiente las revalida (la huella delata las que ya estaban). Si el libro local tiene un `settings_changed` que deja inválidos (registrado con `acceptInvalid` antes de activar), la función de unirse **lo avisa**, y al reaplicarse queda retenido con `settings_leave_invalid`.

## 12. Bloque 6

### 12.1 La función pura de las negativas (`permission.ts`)

`rewritePermission({ local, marker, devices })` y `compactPermission({ marker })` devuelven `allowed` o **un** motivo con su literal, en este orden de comprobación:

| Motivo | Cuándo |
|---|---|
| `marker_unreadable` | `sync/` existe y `state.json` no se lee, o tiene un `sync_format` más nuevo |
| `marker_missing` | `sync/` existe y no hay `state.json` |
| `folder_synced` | el marcador dice `enabled` (solo para compactar la carpeta: siempre se niega y remite a la administración del remoto) |
| `pending_in_this_folder` | la cola local no está vacía (para reescribir el remoto) |
| `pending_in_devices` | algún `sync/devices/*.json` publica `pending > 0`, con la lista de dispositivos. **`held` no bloquea** (V5) |

### 12.2 `atlas compact`

Antes de planificar: el adaptador lee el estado de la carpeta (`folderSyncStatus`) y llama a `compactPermission`; si niega, `DomainError` con el literal (`compact_refused_folder_synced`, `compact_refused_marker_unreadable`, `compact_refused_marker_missing`), un mensaje por motivo en las dos interfaces. Sin `sync/`, o con el marcador `disabled`, `compact` sigue como hoy.

### 12.3 Importar en una web sincronizada

`replaceLedgerText` lee `sync:state` **en su misma transacción** y, si está `enabled` o ilegible, falla con `import_refused_synced` sin escribir nada. El texto de la web remite a desactivar la sincronización (el botón es de la 015).

### 12.4 Desactivar, y qué queda

`deactivateSync`: se niega con pendientes (`deactivate_refused_pending`) y con el marcador ilegible (`deactivate_refused_marker_unreadable`: primero hay que sincronizar, que lo reconstruye). Si procede, **reescribe el marcador con `status: "disabled"`** y `disabled_at`, y **no toca** `held.jsonl` ni `discarded.jsonl`. Con eso:

- `compact` y la importación **vuelven a admitirse** (marcador legible y `disabled`);
- la regla «`sync/` sin marcador → se niega» sigue en pie, porque el marcador sigue ahí;
- lo retenido se queda en `sync/`, visible y revisable.

**Esto obliga a precisar la definición de V7** («sincronización configurada» = que exista `sync/`): con lo retenido dentro de `sync/` tras desactivar, esa letra dejaría `acceptInvalid` negado para siempre, cuando la propia nota de ADR-0015 da desactivar como remedio. **Propuesta**: configurada = existe `sync/` **y** el marcador no dice `disabled` (ilegible o ausente cuentan como configurada: fallo seguro); en la web, existe `sync:state` y no dice `disabled` **[PREGUNTA, Q6]**.

### 12.5 `acceptInvalid` (V7)

- `RecordOptions` pasa a ser, en los tipos, `{ acceptInvalid?: false } | { acceptInvalid: true; syncConfigured: boolean }`: nadie puede pasar `acceptInvalid` sin decir si la sincronización está configurada, y el compilador lo exige a cada llamador. Cero bytes.
- En `checkInvalid`: con eventos que quedarían inválidos, se niega si `acceptInvalid !== true` (como hoy, `newly_invalid_events`) **o** si `syncConfigured !== false` (nuevo, `accept_invalid_while_synced`, con los mismos `affected`). Un llamador en JavaScript que no lo pase queda negado: fallo seguro.
- Lo leen los adaptadores: la consola, con `folderSyncStatus` en `shared.ts`; la web, leyendo `sync:state` en `write.ts` (perezoso).

## 13. Los literales nuevos

Todos en `sync/reasons.ts` o en su error, cada uno en su propia llamada, traducidos en `apps/cli/src/output/messages.ts` y en `apps/web/src/format/messages/errors.ts`, con `tests/messages.test.ts` extendido para que los vea.

- **Retención del cliente**: `pair_not_contiguous`, `seals_prefix`, `concurrent_settings`, `concurrent_account`, `concurrent_asset`, `domain_rejected`, `pair_rejected`, `new_duplicate`, `new_closed_year`, `settings_leave_invalid`, `partner_discarded`.
- **Retención del remoto** (`origin: remote`, el código tal cual): los doce de `docs/api.md` §7.
- **Retención por reescritura o al unirse**: `absent_after_rewrite`, `differs_after_rewrite`, `absent_at_join`, `differs_at_join`.
- **Parada**: `local_prefix_changed`, `remote_rewritten`, `remote_schema_too_new`, `remote_unreadable`, `remote_ledger_invalid`, `remote_contention`, `remote_unavailable`, `transport_rejected`, y los de credencial de `docs/api.md` §7 tal cual; `local_changed` (el paso 6 perdió tres veces); `publish_failed`.
- **Negativa**: `compact_refused_folder_synced`, `compact_refused_marker_unreadable`, `compact_refused_marker_missing`, `rewrite_refused_pending_here`, `rewrite_refused_pending_devices`, `rewrite_refused_marker_unreadable`, `rewrite_refused_marker_missing`, `import_refused_synced`, `deactivate_refused_pending`, `deactivate_refused_marker_unreadable`, `init_refused_invalid_ledger`, `accept_invalid_while_synced`, `redo_filing_in_remote`, `raw_line_break`.
- **Descarte**: `discarded_by_user`, `redone`.

## 14. El paquete web

**Partida** (medida hoy, §Contexto): arranque 75.703 / 75.725; total 276.111 / 276.480.

**Estimación trozo a trozo**, con las dos primeras **medidas** con un prototipo en el árbol de trabajo, construido y **deshecho** (`git checkout -- packages`; ningún commit):

| Trozo | Dónde | Arranque | Total |
|---|---|---|---|
| `appendLines` y `replaceLines` en `BlobLedgerStore`, compartiendo el cuerpo con `append` y `replace` | `blob.ts`, **en el arranque** | **+94 medido** | +34 medido |
| La negativa V7 en `checkInvalid` y su código en `DependentEventsError` | `record-event.ts` y `errors.ts`, **en el arranque** | **+32 medido** | +110 medido (acumulado +144) |
| El cliente de la web, la orquestación y el dominio de la sincronización | perezosos; **en la 014 nada del marco los importa**, así que ni siquiera entran en el paquete | 0 | 0 |
| P2 y P3 en `transfer.ts` (negativa en la transacción, lo retenido en la exportación) | perezoso | 0 | +150 a +250 estimado |
| V7 en la web (`write.ts` lee `sync:state`) | perezoso | 0 | +40 a +80 estimado |
| Los mensajes nuevos en `format/messages/errors.ts` (unos 45 códigos) | perezoso | 0 | **+1.500 a +2.500** estimado |

**Conclusión: el arranque no cabe** (+126 medido contra 22 de margen), y el total tampoco (+1,8 a +3 KB contra 369 bytes). El total sube con la regla de siempre, en su propio commit. **El arranque es una decisión de la dirección**: el detalle y las opciones, en `questions.md` §3. **No escribo código hasta que lo decida.**

## 15. Orden de trabajo tras el visto bueno

Bloques en el orden del encargo; cada bloque, tests primero y vistos fallar; un commit por paso conceptual, `npm run lint` verde antes de cada uno; la rama empujada cada pocos commits; y antes de cada lote de mutación, la búsqueda de gemelos `.js` (§2 ter), con su salida en `questions.md`.

1. **Bloque 1**: contrato de las operaciones crudas (rojo), memoria, fichero con `underLock` y `FileOps`, blob; V13.
2. **Bloque 2**: los cinco guardianes con un módulo vacío, vistos fallar con sus mutantes.
3. **Bloque 3**: `lines`, `marker`, `units`, `seal`, `concurrent`, `confirmations`, `evaluate`, `reapply`, `remote`, `rewrite`, `resolve`, `permission`, con la tabla de §4.2 fila a fila.
4. **Bloque 4**: `client.ts`, `folder-store.ts` (con los cortes de §6), `sync-store.ts` (con la transacción `strict`).
5. **Bloque 5**: los remotos simulados, los once recorridos, la propiedad y la salida fiscal (predicción escrita antes de correrla: **no se mueve nada**).
6. **Bloque 6**: `compact`, importar, `backup` y exportar, desactivar, V7; mensajes.
7. Mutación entera (§5 del encargo), paquete medido, PR con la plantilla.
