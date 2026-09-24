# Plan de implementación: `012-ecb-reference-rates`

**Rama**: `feature/012-ecb-reference-rates` | **Fecha**: 2026-09-24 (Europe/Madrid) | **Especificación**: [`spec.md`](spec.md) | **Preguntas**: [`questions.md`](questions.md)

**Estado**: **aprobado por la dirección el 2026-09-24** con la decisión D1 (`questions.md` §8): la web guarda el libro en IndexedDB y **nunca escribe en la carpeta compartida**; solo la lee (histórico del BCE, importación de un libro con confirmación). El único escritor de la carpeta es la consola, con el cerrojo `"wx"`. Tabla de §5 confirmada (D3).

## Contexto técnico

| | |
|---|---|
| Lenguaje | TypeScript estricto, ESM, Node 22 (`.nvmrc`) |
| Dependencias nuevas | **Ninguna.** ZIP con `node:zlib` (`inflateRawSync` + `crc32`, comprobado en `questions.md` §4); descarga con el `fetch` de Node; navegador con el Chromium de `~/.cache/ms-playwright/` desde el *scratchpad* |
| Tests | vitest; `packages/domain` al 100 % de líneas y ramas; red nunca; histórico sintético con el formato real en `tests/fixtures/ecb/` |
| Paquete web, partida | arranque **73,5 / 73,7** KB gzip, total **237,8 / 237,9** (medido sobre `d5dcc13`) |

## Comprobación contra la constitución

| Principio | Cómo lo cumple el plan | Estado |
|---|---|---|
| I. El libro es la fuente de verdad | El histórico solo propone y comprueba; los borradores viven fuera del libro | Sí |
| II. Fiscalidad solo del libro | Ningún cálculo lee el histórico ni `broker_settled_eur`; la nota no mueve cifras | Sí |
| IV. Nada configurable en el código | El umbral de divisa no publicada y la caducidad informativa del cerrojo van en configuración local fuera del libro (§6 (j)) | Sí |
| V. Fallo seguro | «No comprobado» sin histórico; descarga fallida no toca nada; la ventana que el navegador no puede cerrar se elimina quitando al navegador como escritor de la carpeta (D1), no con un aviso | Sí |
| VI. Veinte años | Formatos abiertos, histórico byte a byte con su procedencia | Sí |
| VII. Tests primero | Mutantes de §5 del encargo | Previsto |

## 1. El cerrojo (lo que el alto del encargo pide fijar)

### 1.1 Contrato del cerrojo (escritores de consola)

Con D1, el único escritor de la carpeta es la consola; el contrato se deja escrito con `holder` para que la 014 no tenga que rehacerlo:

- **Nombre**: `ledger.lock`, en la carpeta del libro (junto a `ledger.jsonl`). Un solo cerrojo por carpeta (§6 (t)).
- **Contenido**: una línea JSON, `{"holder":"cli","token":"<aleatorio>","since":"<ISO 8601 UTC>","pid":<n>,"host":"<nombre>"}`. `token` es el testigo propio para la comprobación de pertenencia; `pid` y `host` solo sirven para el mensaje.
- **Tomar**: crear `ledger.lock` **de forma exclusiva** y escribir el contenido. Si ya existe, no se escribe nada y se lanza un error con tipo (`LockHeldError`, con `holder` y `since` leídos del fichero; si no se puede leer, «tomado por alguien que no se identifica»).
- **Soltar**: borrar `ledger.lock` **solo si su `token` es el propio**, en un `finally` que envuelve la escritura entera.
- **Comprobar pertenencia**: releer `ledger.lock` justo antes de renombrar; si el `token` no es el propio, abortar sin renombrar. Reducción de riesgo, no garantía, dicho así en el comentario y en el mensaje.
- **Romper**: acto del usuario, `atlas lock break` (con `atlas lock show` para verlo); pide confirmación enseñando quién lo tenía y desde cuándo, y borra el fichero sea de quien sea. La web no tiene botón porque no toma el cerrojo.
- **Caducidad**: solo informativa, `lock_stale_minutes` en `atlas.config.json` (§6), por defecto 10 minutos. Pasado ese tiempo el mensaje dice que probablemente quedó abandonado; nada se rompe solo.
- **Error**: `LedgerLockedError` vive en `@atlas/adapters` (no en el dominio: solo la consola lo puede ver) y la consola lo traduce con código de salida propio (`EXIT.locked = 6`).
- **Alcance**: toda escritura dentro de la carpeta —el libro, `archive/`, `drafts/`, `reference/ecb/`, y `sync/` cuando exista—. Se diseña alrededor de «escribir bytes en un almacén de carpeta» (un envoltorio `withFolderLock(folder, holder, fn)`), no de `append` y `replace`, para que las operaciones de líneas crudas de la 014 lo usen sin rehacerlo.

### 1.2 La consola (`FileLedgerStore`)

Tomar con `fs.open(join(dir, "ledger.lock"), "wx")`, la misma primitiva que ya usan los archivos. El orden: tomar → `currentBytes` (comparar etag) → escribir el temporal → comprobar pertenencia → `rename` → soltar. Implementable. Su atomicidad en la carpeta real depende del sistema de ficheros: entre dos procesos de Linux lo es; a través de la frontera de WSL hay un indicio favorable, no una verificación (`questions.md` §3).

Pruebas en `packages/adapters/test/file.test.ts` y en el contrato: dos `append` concurrentes con el mismo etag, 50 veces, y exactamente uno gana; un cerrojo ajeno (con `since` de hace años) bloquea y no se toca; romperlo a petición deja escribir; un cerrojo roto y retomado por otro entre comparar y renombrar aborta sin renombrar (por un gancho de pruebas `beforeCommit` del almacén); un fallo a mitad suelta el cerrojo; y el cerrojo sigue tomado en el momento del renombrado.

### 1.3 La web y la carpeta: solo lectura (D1)

- `DirectoryLedgerBlob` **desaparece**. En su lugar, `FolderReader` (subruta `./browser`) con dos lecturas: `readText("ledger.jsonl")` para importar y `readText("reference/ecb/…")` para el histórico. Pide permiso **`mode: "read"`**.
- Un test de arquitectura prohíbe en `packages/adapters/src/ledger-store/browser/` y en `apps/web/src/` las primitivas de escritura de la File System Access API: `createWritable`, `create: true`, `removeEntry`, `.move(`, y `mode: "readwrite"`. Es el mutante «la web vuelve a escribir en la carpeta».
- El libro de la web es **siempre** el del navegador. La carpeta pasa a ser una **carpeta enlazada**, opcional, que se elige en «Libro» y se recuerda como hoy (`rememberedDirectory`). Desde ella: «Importar el libro de la carpeta» (con la confirmación de sustituir, si ya hay libro) y, en el bloque 3, el histórico.
- Una sesión anterior que recordaba el modo «carpeta» abre el libro del navegador y dice, sin suavizar, que la web ya no escribe en la carpeta y que el libro de la consola se trae importándolo.
- El chip y «Ajustes» dejan de hablar de «Este ordenador» como libro: el libro está en el navegador; la carpeta, si hay, está enlazada para leer.

### 1.4 IndexedDB (`BrowserLedgerBlob`), independiente de la carpeta

- `LedgerBlob` pasa a ser `read()` más **una sola** operación de escritura, `update(expectedEtag, produce, archiveName?)`: en **una** transacción `readwrite` lee, calcula `sha256Hex` (síncrono), compara, archiva si se pide (con `add`, que falla si existe) y escribe `produce(actual)`. Desaparecen `write` y `writeArchive`: no queda ninguna forma de escribir sin comparar. Todo con *callbacks* de IndexedDB, sin `await` entre la lectura y la escritura, para que la transacción no se confirme sola a medias.
- `markExported` desaparece como tal: la exportación es `exportText(when)`, que en **una** transacción lee el texto y guarda la fecha en otra clave (`current:meta`), sin reescribir el texto (D4).
- `replaceText`: sobrescritura deliberada, documentada así; en una transacción escribe el texto y **borra** la fecha de exportación (no la hereda, D4). La interfaz pide confirmación explícita cuando ya hay libro.
- Compatibilidad: un registro antiguo que lleve `lastExportAt` dentro se sigue leyendo, y `update` lo conserva en la misma transacción.
- Pruebas sin navegador: un doble de IndexedDB en `packages/adapters/test/fake-idb.ts` que serializa las transacciones de un almacén, las confirma solas cuando no les quedan peticiones y **rechaza** una petición sobre una transacción ya inactiva, que es la trampa real. `BrowserLedgerBlob` recibe el abridor de la base por el constructor.
- No hace falta almacén nuevo, así que **`DB_VERSION` no sube**.

## 2. La regla de una sola corrección viva

En `project-ledger.ts`, pasada 0, recorriendo las líneas en orden de fichero con un mapa `original → correcciones vistas hasta aquí` y el conjunto de anulaciones **vistas hasta aquí**. Código propio, `second_live_correction` (provisional), con sus dos traducciones. Predicción de dorados: **ninguno se mueve** (`synthetic-v1.jsonl` tiene una corrección; los demás, ninguna).

## 3. `broker_settled_eur`

Campo opcional en los cinco eventos; `knownFieldsOf` lo aprende; validación de forma (decimal como cadena, no negativo, `> 0` salvo en `dividend` e `interest`, rechazado si `currency` es `EUR`); fuera de `tupleOf`; test de arquitectura de lista cerrada con las tres formas de lectura. `atlas add --broker-settled-eur <valor>` y un campo del formulario visible solo si la divisa no es el euro.

## 4. Coste estimado del bloque 0 en el arranque

**Estimado, no medido** (se mide trozo a trozo al implementar):

| Pieza | Estimación gzip | ¿Va en el arranque? |
|---|---|---|
| `compareAndWrite` y `markExported` en IndexedDB | ~0,1 KB | Sí (almacén) |
| Quitar la escritura de la web en la carpeta (`DirectoryLedgerBlob` → `FolderReader`) | **negativo**, ~−0,2 KB | Sí |
| Regla de una sola corrección | ~0,1-0,15 KB | Sí (proyección) |
| Validación de `broker_settled_eur` | ~0,05-0,1 KB | Sí (`validateShape` corre al cargar) — se dice aparte |

Neto estimado: alrededor de cero. Se mide paso a paso; si el techo tiene que subir, sube en su propio commit con la medida.

## 5. Los campos que se comprueban contra el histórico (§6 (q), para confirmar en el alto)

Recorriendo solo `FX_FIELDS` de `validate.ts`, con la dimensión nueva de los efectos. Las líneas con divisa `EUR` no se comparan.

| Evento u operación | Divisa → tipo | Campo de fecha | Fecha de referencia propuesta |
|---|---|---|---|
| `buy`, `sell` | `currency` → `fx_rate` | `fx_rate_date` | **fecha fiscal** (`fiscal_date_rule` del activo) |
| `swap` | `currency` → `fx_rate` | `fx_rate_date` | **fecha fiscal de la pata que sale** (la que usa `warnFxDate`) |
| `dividend`, `interest`, `standalone_fee`, `cash_deposit`, `cash_withdrawal` | `currency` → `fx_rate` | `fx_rate_date` | `value_date` (su fecha de negocio) |
| `fx_exchange` | `sold_currency` → `fx_rate_sold`, `bought_currency` → `fx_rate_bought` | `fx_rate_date` (uno para los dos) | `value_date` |
| `valuation` | `currency` → `fx_rate` | `fx_rate_date` | `date` |
| efecto `forced_sale` | `currency` → `fx_rate` | `fx_rate_date` | `effective_date` del evento (la que usa `warnFxDate`) |
| efecto `grant` | `currency` → `fx_rate` | `fx_rate_date` | `acquisition_date` del efecto (la que usa `warnFxDate`) |

El guardián de `validate.test.ts` se reescribe por pareja (tipo, campo) y (operación del efecto, campo), y se ve fallar quitando `valuation` de `FX_PAIRS` y `grant` de la dimensión de los efectos.

## 6. Bloques 1–6: decisiones de plan que no dependen del cerrojo

- **Procedencia de lo descargado**: `reference/ecb/eurofxref-hist.csv` si viene del ZIP; `reference/ecb/api-exr.csv` si viene de la API, **nunca** con el nombre del ZIP; junto a cada uno, `*.source.json` con la URL, la hora y el SHA-256. El lector de la API trata una fila **sin valor** (`OBS_STATUS` `H`) como ausencia (`questions.md` §4).
- **Actualización**: el nuevo se escribe con otro nombre; solo si contiene todos los tipos del anterior con el mismo valor numérico pasa a ser el activo (renombrado atómico); si no, se quedan los dos y el anterior sigue activo, con su hallazgo.
- **Configuración local**: `atlas.config.json` junto al libro, fuera del libro y del repositorio, con `ecb_stale_currency_days` (por defecto propuesto 30) y `lock_stale_minutes`.
- **Resolución**: unión cerrada `resolved | not_yet_published | currency_not_published | currency_stale`; sirve para cualquier fecha, no solo la fiscal, para que la 013 la use con una fecha de cotización.
- **Hallazgos**: `fx_rate_mismatch`, `fx_rate_date_unpublished`, `fx_rate_date_not_latest`, `fx_rate_currency_unlisted`, más el estado `fx_rates_unchecked` sin histórico; catálogo de la consola limitado a ellos y escáner de `tests/messages.test.ts` extendido a los módulos nuevos.
- **Borradores**: `drafts/<ULID>.json` junto al libro, y un almacén de IndexedDB en el móvil (**esto sí subiría `DB_VERSION`**, con el arreglo del mensaje de `onblocked` en el mismo bloque). Confirmar escribe primero el libro y después borra el borrador: cortado entre medias, queda en los dos y la huella de duplicados lo delata.
- **Criterio fiscal nuevo**: identificador propuesto `25`, en el catálogo y en las dos tablas en el mismo commit.

## 7. Orden

El de §3 del encargo, con el detalle en [`tasks.md`](tasks.md).
