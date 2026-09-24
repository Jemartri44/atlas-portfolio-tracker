# Preguntas y verificaciones de la feature 012

Fechas en `Europe/Madrid`. Todo lo descargado o ejecutado está en el *scratchpad* de la sesión (`012-ecb/`, `012-fsa/`), nunca en el repositorio. Las salidas se citan literalmente.

---

## 0. Estado: parada del paso 0 (levantada por diseño el 2026-09-24, §8 D1-D2)

**El punto 1 del paso 0 ha salido que no.** La File System Access API **no ofrece ninguna forma de crear un fichero de forma exclusiva** en una carpeta elegida por el usuario: ni la especificación la tiene, ni Chromium la expone, aunque por dentro la use. Lo dicen el texto de la especificación y el código fuente de Chromium (§1.1 y §1.2), y el ensayo previo coincide (§1.3). No depende de la plataforma del usuario: Chrome y Edge comparten ese código, y Firefox y Safari no tienen `showDirectoryPicker`.

Por el encargo (§3, bloque 0, paso 0, punto 1; §6 (b); §5, «si alguna salió que no, no hay más criterios: la entrega es ese informe»), **la feature para aquí**. No he escrito código de producción ni lo voy a escribir. Lo que sigue es el informe, las opciones que veo **sin elegir ninguna** (§2) y lo que he verificado de paso, que vale para cuando la dirección decida (§3–§6).

**Una salvedad sobre el procedimiento.** El encargo pide medir en dos tiempos, primero preguntando al usuario. Esa pregunta la ha hecho la dirección y **la respuesta está pendiente** (§1.4). No la he esperado para este «no» porque un «no» que sale de la especificación y del código no depende de dónde viva la carpeta ni del navegador: **no hay primitiva que medir**. Un «sí» sí habría exigido la medida en la plataforma real. Si la dirección entiende que el procedimiento obliga igualmente a esperar, el resultado no cambia, solo la fecha.

---

## 1. Paso 0, punto 1 — Creación exclusiva en el navegador

### 1.1 La especificación (WHATWG File System)

Fuente: `https://github.com/whatwg/fs`, fichero `index.bs`, *commit* `cd55e5582e9c915c6341479bceaa4216f7a05413` (2026-03-15), descargado el 2026-09-24 a `012-fsa/whatwg-fs.bs`. La parte de la File System Access API (WICG, `https://github.com/WICG/file-system-access`, `index.bs`, *commit* `93119927fa7a678c1863996f6f3a32d9ac53943d`, 2025-10-10) solo añade los selectores y los permisos: no toca la creación.

- Las opciones de creación son estas y ninguna más (líneas 668-674):
  ```
  dictionary FileSystemGetFileOptions {
    boolean create = false;
  };
  dictionary FileSystemGetDirectoryOptions {
    boolean create = false;
  };
  ```
  No hay `exclusive`, `createNew` ni nada equivalente.
- El algoritmo de `getFileHandle(name, { create: true })` (líneas 849-880; la comparación de nombres, línea 866) recorre los hijos y, **si ya existe uno con ese nombre, resuelve la promesa con su handle** y termina; solo si no existe lo crea. Con `create: true`, «ya existía» y «lo he creado yo» son **el mismo resultado**. El texto informativo lo dice así: «*If no such file exists, this creates a new file*» (línea 824). `getDirectoryHandle` sigue el mismo patrón.
- Los cerrojos que sí define la especificación (`file entry/lock`, líneas 132-179: `taken-exclusive`, `taken-shared`) son **del agente de usuario**: los toman `createWritable` y `createSyncAccessHandle` **dentro del navegador**. Un proceso de la consola no los ve. Las propuestas abiertas de modos nuevos (`whatwg/fs` #137, #148 y la PR #151, consultadas el 2026-09-24 por la API de GitHub) son del mismo tipo.

### 1.2 La implementación (Chromium)

Fuente: `https://github.com/chromium/chromium`, rama `main`, último *commit* del directorio consultado `c071028ae6b0d5222aa9064050c5847dbc454a71` (2026-09-18), ficheros descargados el 2026-09-24 a `012-fsa/`. El Chromium de Playwright de la máquina es `Chrome/151.0.7922.34`.

- `content/browser/file_system_access/file_system_access_directory_handle_impl.cc`, `GetFileWithWritePermission` (líneas 623-638), que es lo que ejecuta `getFileHandle(…, { create: true })`:
  ```
  manager()->DoFileSystemOperation(
      FROM_HERE, &FileSystemOperationRunner::CreateFile, …,
      child_url,
      /*exclusive=*/false);
  ```
  y `getDirectoryHandle(…, { create: true })` igual, con `/*exclusive=*/false, /*recursive=*/false` (línea 706).
- Lo más revelador: **por debajo, Chromium sí crea de forma exclusiva y tira el resultado.** `storage/browser/file_system/native_file_util.cc`, `EnsureFileExists`:
  ```
  // Tries to create the |path| exclusively.  This should fail
  // with base::File::FILE_ERROR_EXISTS if the path already exists.
  base::File file(path, base::File::FLAG_CREATE | base::File::FLAG_READ);
  ```
  y `storage/browser/file_system/file_system_operation_impl.cc`, líneas 532-537, que es la rama no exclusiva que usa la API:
  ```
  void FileSystemOperationImpl::DidEnsureFileExistsNonExclusive(
      StatusCallback callback, base::File::Error rv, bool /* created */) {
    DidFinishOperation(std::move(callback), rv);
  }
  ```
  El dato de si lo ha creado él (`created`) **se descarta** antes de llegar a la página. La rama exclusiva (`DidEnsureFileExistsExclusive`, líneas 521-530, que devuelve `FILE_ERROR_EXISTS`) existe, pero la File System Access API no la llama nunca para el fichero pedido.
- `move()` (que no está en la especificación, solo en Chromium): `file_system_access_handle_base.cc`, líneas 546-548 y 634-640. Con permiso de escritura en la carpeta de destino —que es nuestro caso— **sobrescribe** el destino (`has_overwrite_permission`). Sin él, comprueba que el destino no existe (`FileExists`) y **después** mueve: comprobar y actuar, la misma carrera que el cerrojo existe para cerrar. Los cerrojos que toma (`manager()->TakeLock`, líneas 559-574) son internos del navegador.
- El fichero temporal de `createWritable` (`.crswap`) sí se crea con `/*exclusive=*/true` (`file_system_access_file_handle_impl.cc`, líneas 728-738), pero si existe **prueba con otro nombre** (`StartCreateSwapFile(count + 1, …)`, líneas 842-846): la página nunca ve un fallo.
- `removeEntry`: `NativeFileUtil::DeleteFile` (líneas 387-395) hace `PathExists` y después `DeleteFile`. Tampoco es atómico frente a otro proceso, por si alguien piensa en invertir el cerrojo (tomarlo = borrar un testigo).

**Conclusión de 1.1 y 1.2**: desde una página web no existe ninguna operación que **falle si el fichero ya existe, en una sola operación**. Lo único que se puede hacer es crear y releer, que ADR-0026 descarta expresamente.

### 1.3 Ensayo previo (dos pestañas del Chromium de Playwright)

Solo ensayo, como dice el encargo: prueba, como mucho, lo que pasa **dentro** del navegador. Guion `012-fsa/rehearsal/rehearsal-opfs.mjs`, cliente del protocolo DevTools con `fetch` y `WebSocket` de Node 22 (sin dependencias), `Chrome/151.0.7922.34` sin interfaz. Salida literal (`rehearsal-opfs.out`, 2026-09-24):

```
{"rounds":50,"bothResolved":50,"exactlyOneOrNone":0}
existing file, create:true again -> {"second":"resolved","contentAfter":"owner=A"}
move() onto an existing name -> {"move":"resolved","contentAfter":"owner=B"}
two concurrent removeEntry -> removed rejected:NoModificationAllowedError
```

- 50 rondas de dos pestañas pidiendo a la vez `getFileHandle("ledger.lock", { create: true })`: **las dos «lo consiguen» las 50 veces**.
- Con el fichero ya creado por A, B vuelve a pedirlo con `create: true`: **resuelve sin error**.
- `move()` sobre un nombre existente: **lo sobrescribe**.
- Dos `removeEntry` a la vez: uno falla, pero por el cerrojo **interno** del navegador (`NoModificationAllowedError`), que la consola no ve.

**Por qué es OPFS y no la carpeta del disco.** Conseguí un `FileSystemDirectoryHandle` **real** de una carpeta del disco soltándola con `Input.dispatchDragEvent` (`probe-drop.mjs`: `directory:ledgerdir q=prompt`), pero sin permiso de escritura: `requestPermission({ mode: "readwrite" })` se queda esperando un diálogo que el protocolo no puede contestar, y ninguno de los nombres de permiso que acepta `Browser.setPermission` lo concede (`probe-perm.mjs`: «Invalid PermissionDescriptor name» para los cinco probados). `showDirectoryPicker` interceptado con `Page.setInterceptFileChooserDialog` se aborta sin ofrecer forma de elegir carpeta (`probe-picker.mjs`). Para el «no» da igual: la semántica de `create: true` es la de la especificación en los dos almacenes, y el camino del disco es el de §1.2.

### 1.4 Paso 0 (a): la pregunta al usuario

La ha hecho la dirección (mensaje del encargo, punto 2): **dónde vive la carpeta del libro** y **con qué navegador abre la web**. **Respuesta: pendiente.** No cambia el resultado de §1 (ver §0).

---

## 2. Qué se le abre a la dirección (sin elegir)

No decido nada de esto: es estructural y cambia lo que ADR-0019 y ADR-0026 prometen. Lo escribo para que la decisión se tome sobre algo concreto.

- **(A) La web de escritorio deja de escribir en la carpeta compartida.** La lee (el libro, `reference/ecb/`), pero registra solo la consola, donde `"wx"` sí es atómico. Cierra la ventana sin primitiva nueva. Coste: en el escritorio, la web deja de registrar mientras use la carpeta; contradice «una sola fuente de verdad, sin copias» de ADR-0019 en su mitad de escritura.
- **(B) La web de escritorio usa siempre IndexedDB**, como el móvil, e importa o exporta la carpeta a mano. Sin carpeta compartida no hay ventana entre la consola y la web, y la de IndexedDB se cierra con la transacción única. Coste: dos copias del libro en el escritorio hasta la sincronización (014), que es justo lo que ADR-0019 evitó.
- **(C) La consola sirve la web desde `localhost`** (`atlas serve`, nombre inventado) y la web escribe **a través** de la consola, que toma el cerrojo con `"wx"`. Es del mismo origen, así que la CSP sigue en `'self'`. Coste: un modo nuevo de funcionamiento, una ADR, y la web del escritorio pasa a necesitar la consola arrancada.
- **(D) Esperar a que la plataforma lo tenga.** No hay ninguna propuesta abierta de creación exclusiva frente a otros procesos (§1.1). Mientras tanto la ventana sigue abierta, que es lo que el encargo quiere evitar.
- Lo que **no** es una opción, por ADR-0026: entregar con un aviso, y crear y releer un testigo.

**Una pregunta que sí es mía (P1).** El encargo dice que, si el punto 1 sale que no, «no se implementa nada más de la 012, tampoco lo que no depende del cerrojo». Hay tres piezas del bloque 0 que **no** dependen de la carpeta del navegador y cierran pérdidas reales por sí solas: la transacción única de IndexedDB (la ventana del móvil y de dos pestañas), el cerrojo de la consola frente a otra consola, y `broker_settled_eur` (que ADR-0030 quiere antes de la primera operación real). ¿Se mantiene la parada entera, o la dirección quiere que alguna salga igualmente? No lo hago sin respuesta.

---

## 3. Paso 0, punto 2 — El sistema de ficheros real (medida automática, a falta de la respuesta del usuario)

Aunque el punto 1 ya para la feature, lo he medido porque es barato y sirve para cualquiera de las opciones de §2 en las que escriba un proceso de Windows. **No es la medida consola contra navegador** (no puede serlo: no hay primitiva en el navegador), sino **consola de Linux contra un proceso nativo de Windows**, creando de forma exclusiva el mismo fichero a la vez, en los dos sentidos de la frontera.

Máquina: WSL2 `6.6.87.2-microsoft-standard-WSL2`, Ubuntu 24.04; Windows `10.0.26200.0`; PowerShell `5.1.26100.9444`. `C:\` montado como `9p (drvfs … cache=5, access=client)`. Guion `012-fsa/excl/race.sh`: 200 nombres; los dos lados intentan crear `lock-i` en la misma ranura de 25 ms; Linux con `openSync(…, "wx")` (`O_CREAT|O_EXCL`), Windows con `[IO.File]::Open(…, CreateNew, Write, None)`. Salidas literales (2026-09-24, 03:00):

```
/mnt/c   {"n":200,"linuxWon":53,"windowsWon":147,"bothWon":0,"noneWon":0,"linuxErrs":{"EEXIST":147},"windowsErrs":"MethodInvocationException=53"}
wsl ext4 {"n":200,"linuxWon":190,"windowsWon":10,"bothWon":0,"noneWon":0,"linuxErrs":{"EEXIST":10},"windowsErrs":"MethodInvocationException=190"}
wsl ext4 {"n":200,"linuxWon":94,"windowsWon":106,"bothWon":0,"noneWon":0,"linuxErrs":{"EEXIST":106},"windowsErrs":"MethodInvocationException=94"}
```

(`wsl ext4` es una carpeta de Linux vista desde Windows por `\\wsl.localhost\Ubuntu-24.04\…`. Otras tres repeticiones no se solaparon —un lado lo ganó todo— y no cuentan.)

**Lo que dice**: en las tres rondas con reparto real, **ningún nombre lo ganaron los dos**, en ninguno de los dos sentidos. **Lo que no dice**: que sea atómico. Ranuras de 25 ms no garantizan simultaneidad por debajo del milisegundo, y 9p no documenta que traslade `O_EXCL` como una sola operación. Es un indicio favorable, no una verificación; si la dirección elige una opción en la que esto importe, hace falta la fuente de la plataforma (el protocolo 9p de WSL) o una prueba más fina.

**Limpieza pendiente**: el guion dejó dos carpetas de prueba con ficheros vacíos, `~/atlas-012-excl-test` y `C:\Users\jemar\AppData\Local\Temp\atlas-012-excl`. No tengo permiso para borrarlas; se pueden borrar sin más.

---

## 4. Paso 0, punto 3 — Los hechos del BCE

Descargado el **2026-09-24 a las 02:53:58** (`Europe/Madrid`) a `012-ecb/`.

- **ZIP**: `https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist.zip`, HTTP 200, `content-type: application/zip`, `last-modified: Wed, 23 Sep 2026 13:56:43 GMT`, `cache-control: max-age=300`. 639 760 bytes, SHA-256 `d87da34b…a1a4af9`. **Una sola entrada**, `eurofxref-hist.csv`, método 8 (*deflate*), sin *flags* ni descriptor de datos, sin comentario. Se lee con `node:zlib` (`inflateRawSync`) recorriendo el directorio central, y el CRC-32 cuadra con `zlib.crc32` (`012-ecb/unzip.mjs`: `len ok true crc ok true`). **No hace falta ninguna dependencia.**
- **CSV**: 1 922 797 bytes, SHA-256 `2d562e6e…a42990`, 7 100 líneas (cabecera + 7 099 días).
  - UTF-8 sin BOM, **fin de línea `\n`** (ningún `\r`), **termina en `\n`**.
  - Cabecera `Date,USD,JPY,BGN,CYP,…,ZAR,` — **coma final** en la cabecera y en cada fila, así que la última celda es siempre la cadena vacía (43 columnas).
  - Separador `,`, sin comillas.
  - **Fechas en orden estrictamente descendente**, del `2026-09-23` al `1999-01-04`, sin repetidas.
  - Una divisa sin valor en un día con publicación se marca **`N/A`** (70 140 celdas). Ninguna celda vacía.
  - Todos los valores cumplen `^\d+(\.\d+)?$`; hasta 6 decimales; **ningún cero final** (0 valores con `.` que acaben en `0`); ningún cero a la izquierda. Hay enteros sin punto: ISK `138`, KRW `1558`.
  - Divisas vivas el 2026-09-23: 29. Último valor de las que dejaron de publicarse: BGN 2025-12-31, HRK 2022-12-30, RUB 2022-03-01, LTL 2014-12-31, LVL 2013-12-31, EEK 2010-12-31, SKK 2008-12-31, CYP y MTL 2007-12-31, SIT 2006-12-29, ROL 2005-06-30, TRL 2004-12-31.
- **API**: `https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=csvdata`, HTTP 200, `content-type: text/csv`, `content-disposition: attachment;filename=data.csv`.
  - **Fin de línea `\r\n`**, orden **ascendente**, **una fila por observación** (serie × día), con campos entre comillas que contienen comas (`"ECB reference exchange rate, US dollar/Euro, 2.15 pm (C.E.T.)"`).
  - Con `&detail=dataonly` quedan 8 columnas: `KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE`. Con `D..EUR.SP00.A` devuelve todas las divisas de un día.
  - **Mismo día, formato de cada fuente**: API `GBP 0.8595`, `JPY 180.2`, `CHF 0.939`; histórico `0.8595`, `180.2`, `0.939`; **XML diario** `rate='0.85950'`, `rate='180.20'`, `rate='0.9390'`. Confirma ADR-0029: solo el XML conserva ceros finales.
  - **Hallazgo que no está en ADR-0029**: la serie GBP entera por la API tiene **7 161** filas contra **7 099** días del histórico. Las **62** de más son días de cierre de 1999 a 2012 que el histórico **no** tiene, y llegan **con el valor vacío y `OBS_STATUS` = `H`**:
    ```
    2000-04-21,,H,,,
    2000-04-24,,H,,,
    ```
    En los 7 099 días comunes, el valor es **idéntico como cadena** (0 diferencias). Consecuencia para el respaldo (§6 (l)): **una fila de la API sin valor no es una publicación**, y el lector de la API tiene que tratarla como ausencia. Si se guardara «tal cual» y se leyera sin saberlo, esos días parecerían publicados.

---

## 5. Paso 0, punto 4 — El calendario TARGET contra el histórico real

Calendario de ADR-0029 (fines de semana, 1 de enero, Viernes Santo, Lunes de Pascua, 1 de mayo, 25 y 26 de diciembre), Pascua por el algoritmo gregoriano anónimo. Guion `012-ecb/target.mjs`; salida entera en `012-ecb/target-report.txt`. Desacuerdos por año:

| Año | Desacuerdos | Cuáles |
|---|---|---|
| 1999 | 3 | hábil sin publicación: 1999-12-31; cierre con publicación: 1999-04-02 (Viernes Santo), 1999-04-05 (Lunes de Pascua) |
| 2000 | 0 | |
| 2001 | 1 | hábil sin publicación: 2001-12-31 |
| 2002–2026 | 0 | ninguno en 25 años |

**Ruido en los años que usará el libro: cero.** El calendario de hoy es el que el BCE aplicó desde 2000 (los dos de 1999 son el calendario de ese año; los dos 31 de diciembre, cierres extraordinarios del cambio de milenio y del euro físico). La acotación de §6 (m) es más que suficiente.

**`rateDayOf`** (bloque 1, sin tocarla): con el histórico, el 31 de diciembre —o el viernes anterior cuando cae en fin de semana— **tiene publicación todos los años desde 2002**; no la tiene en **1999 y 2001**. Ningún ejercicio que el libro vaya a declarar está afectado.

---

## 6. Lo que el encargo afirma del código, comprobado sobre `develop` (`d5dcc13`)

Todo lo que he mirado cuadra con el encargo. Lo que he mirado:

- `FileLedgerStore` (`packages/adapters/src/ledger-store/file.ts`): `currentBytes` compara y `writeAtomically` escribe un temporal con `"w"` y renombra, sin nada entre medias; los archivos con `"wx"`. Cuadra.
- `BlobLedgerStore` (`blob.ts`): `LedgerBlob` con `read`, `write` y `writeArchive` separados; `currentBytes` compara y después escribe. Cuadra.
- `DirectoryLedgerBlob` (`browser/directory.ts`): `writeArchive` hace `getFileHandle(…, { create: false })` y después `{ create: true }`. Cuadra; y §1.2 confirma que ni siquiera el segundo paso es exclusivo.
- `BrowserLedgerBlob` (`browser/indexeddb.ts`): `write` = `idbGet` + `idbPut` en dos transacciones; `markExported` igual, **reescribiendo el texto entero**; `idb.ts` con `DB_VERSION = 1` y `onblocked` → `StorageUnavailable`. Cuadra.
- **Lecturas seguidas de escritura del libro guardado en IndexedDB**, buscadas en `indexeddb.ts` y en todo `apps/web/src` (§6 (y)):
  1. `BrowserLedgerBlob.write`, vía `BlobLedgerStore.append` y `.replace` (`currentBytes` en una transacción, `write` en otras dos).
  2. `markExported`, llamado desde `exportLedger` (`apps/web/src/ledger/export.ts:27`).
  3. `replaceText`, llamado desde `importLedger` (`export.ts:54`): sobrescritura deliberada. **Además**: no archiva el libro que sustituye y **conserva el `lastExportAt` del libro anterior** (lo copia `write`), así que tras importar la web puede decir «exportado el día X» de un libro que nunca se exportó.
  4. **Una que el encargo no nombra**: `exportLedger` lee el texto (`blob.text()`) en una transacción y marca la exportación en otra. Si otra pestaña registra entre las dos, la fecha dice que se exportó un libro que ya tiene una línea más. No pierde líneas, pero afirma algo falso.
  Ningún otro sitio escribe en `LEDGER_STORE` (`rememberDirectory` escribe en `HANDLE_STORE`).
- **Paso 2, el argumento de ADR-0026 Parte C**: los caminos por los que un borrador con `corrects_id` llega a escribirse. La consola quita `corrects_id` en `draftOf` (`apps/cli/src/commands/shared.ts:172-183`); `corporate-actions.ts` construye el borrador desde *flags*; la web construye los valores desde la especificación del formulario (`valuesOfEvent` parte de `initialValues(spec)`, y `corrects_id` está en `ENVELOPE_FIELDS` de `specs.ts:708-715`), y edita por `correctEvent`, que **sobrescribe** `corrects_id` con el original (`rectify.ts:139-142`); el generador sintético escribe una sola corrección sobre un original anulado (`synth/scenario.ts:974-987`); la importación de fichero no pasa por `recordEvent`. **No he encontrado ningún camino** por el que la aplicación escriba dos correcciones vivas. Una observación, no un camino: el tipo `Draft` (`schema/events.ts:792-794`) **no** omite `corrects_id`, así que un llamador futuro de `recordEvent` podría pasarlo; la regla nueva lo cazaría.
- **Fechas de referencia de `warnFxDate`**, para la lista de campos del bloque 4: `buy` y `sell` con su fecha fiscal (`operations.ts:279`, `:332`), `swap` con la fecha fiscal de la pata que sale (`:440`), `forced_sale` con la fecha efectiva del evento (`primitives.ts:344`), `grant` con `acquisition_date` (`primitives.ts:417`). `FX_PAIRS` y `FX_DATE_FIELDS` en `validate.ts:552-583`, y los efectos con su lista en línea en `validate.ts:493-494`. Cuadra.
- **Línea de partida del paquete web**, `npm run build` sobre `d5dcc13` (salida en `012-build-baseline.log` del *scratchpad*): `ARRANQUE 73.5 KB gzip (presupuesto 73.7 KB)`, `TOTAL 237.8 KB gzip (presupuesto 237.9 KB)`. Cuadra con §5 del encargo.

---

## 7. Documentos (para que los traslade la dirección)

- **ADR-0026** y **`docs/data-schema.md` §5**: lo verificado en §1 —no existe creación exclusiva en la File System Access API—, con las fuentes de §1.1 y §1.2. La frase «SIN VERIFICAR» pasa a «verificado que no» el día que la dirección decida.
- **ADR-0029**, «Hechos»: las filas `H` sin valor de la API en los días de cierre de 1999-2012 (§4); el formato de cada fuente; el recuento de §5.
- **`docs/data-schema.md` §6.2** dice de `broker_settled_eur` «en valor absoluto» sin la enmienda de ADR-0030 (cero solo en `dividend` e `interest`, negativo rechazado). Manda la ADR.
- `docs/prompts/README.md`, cuando la dirección cierre esto.

---

## 8. Respuestas de la dirección (2026-09-24)

- **D1 — La web sobre la carpeta compartida: opción B, con lectura.** La web de escritorio guarda el libro en IndexedDB, como el móvil, y **nunca escribe en la carpeta compartida**. Puede **leer** de ella: el histórico del BCE (`reference/ecb/`) y la importación de un libro, con su confirmación explícita. El único escritor de la carpeta es la consola, con el cerrojo `"wx"` entre consolas. *Motivo de la dirección:* deja un solo escritor por almacén; el único medio con varios escritores pasa a ser S3 con la sincronización, donde la escritura condicional es atómica en el servidor. (A) no dice dónde escribe la web; (C) añade un servidor local permanente con su superficie de ataque; (D) es esperar sin fecha. Hoy no cuesta nada real: el usuario no usa todavía el modo de fichero directo. **Consecuencia asumida:** hasta la sincronización, la web y la consola de escritorio **no comparten un libro vivo**; se pasa de una a otra exportando e importando. **Enmienda ADR-0019** (la web de escritorio ya no escribe el fichero) **y ADR-0026 Parte B** (el cerrojo existe solo entre escritores de consola). Las enmiendas fechadas las escribe la dirección al cerrar la feature (D10).
- **D2 — La parada se levanta por diseño.** La condición era que la web escribiera en la carpeta, y ya no lo hace. **La feature sigue entera**; P1 decae (todo el bloque 0 entra). La respuesta del usuario del paso 0 (a) deja de hacer falta.
- **D3 — Tabla de fechas de referencia** (`plan.md` §5): confirmada tal cual.
- **D4 — Las dos ventanas nuevas de IndexedDB** (§6, puntos 3 y 4) entran en el bloque 0: `exportLedger` lee el texto y anota la fecha **en la misma transacción**; `replaceText` **no hereda** el `lastExportAt` del libro anterior. Test y mutante para cada una.
- **D5 — Filas `H` sin valor de la API**: no publicado. La dirección lo pasa a ADR-0029.
- **D6 — `atlas.config.json`** junto al libro, fuera del libro y del repositorio; umbral por defecto 30 días.
- **D7 — Identificador del criterio nuevo: `25`**, catálogo y dos tablas en el mismo commit.
- **D8 — Subir `DB_VERSION`** de IndexedDB para los borradores, con el arreglo de `onblocked`. `schema_version` del libro no se toca.
- **D9 — Permiso de commit** en la rama durante toda la feature; nunca de fusionar.

---

## 9. Diario de implementación

### 9.1 Bloque 0, paso 1 — el cerrojo de la consola (2026-09-24)

- **Rojo antes del arreglo**: los seis tests nuevos de `packages/adapters/test/file.test.ts` («the folder lock») se escribieron antes que el cerrojo y fallaron los seis; el de concurrencia, por la razón buena: `expected 1, received 2` (las dos escrituras concurrentes «ganaban», es decir, una línea se perdía).
- **Mutantes** (runner en el *scratchpad*, `012-mut/mutate.mjs`: afirma que cada sustitución ocurre exactamente una vez, restaura y compara el fichero; desde el bloque de IndexedDB, además, se niega a correr si hay un gemelo compilado junto a una fuente): no tomarlo en `append` — muerto; no tomarlo en `replace` — muerto; `"w"` en vez de `"wx"` — muerto; soltarlo antes de renombrar — muerto; no soltarlo si la escritura falla — muerto; quitar la comprobación de pertenencia — muerto; romper solo un cerrojo caducado (mutante 2) — muerto.
- `backup --to` y `export --out` escriben donde diga el usuario, fuera del libro, y no toman el cerrojo; `synth --out` escribe con `FileLedgerStore`, así que sí.

### 9.2 Bloque 0, paso 1 — IndexedDB y la carpeta de solo lectura (2026-09-24)

- **Un gemelo compilado eclipsó a su fuente, otra vez** (lección 5 de §2 ter). Un `tsc -b` intermedio, con un `tsconfig` mal puesto, emitió `indexeddb.js` e `idb.js` **dentro de `src/`**. Vite resolvía `./indexeddb.js` al gemelo, y los cuatro primeros mutantes de IndexedDB **sobrevivieron** porque nunca se ejecutaron. El test de arquitectura que vigila los gemelos solo mira el índice de git, así que no lo vio (no estaban añadidos). Se borraron, se repitió el lote entero y el *runner* se niega ahora a correr con gemelos presentes. Nada de esto llegó a un commit.
- **El doble de IndexedDB serializa todas las transacciones**, así que la carrera entre dos pestañas no siempre se reproduce con él: el mutante 3 (leer y escribir en dos transacciones) **sobrevivía al test de concurrencia**. Lo mata un test estructural: cada `append`, `replace`, exportación e importación abre **exactamente una** transacción, y de lectura y escritura. El de concurrencia se queda, porque cuesta poco y caza la versión ingenua.
- **Mutantes**: dos transacciones en `update` (3) — muerto; exportación que lee y anota en dos transacciones (24a, D4) — muerto; exportación que reescribe el texto (24b) — muerto; importación que hereda la fecha (D4) — muerto; importar sin preguntar (FR-006) — muerto; la web vuelve a pedir `readwrite` a la carpeta — muerto (test de arquitectura); la web crea un fichero en la carpeta — muerto (ídem).
- **Paquete web** tras el paso: arranque **73,1** (−0,4: sale la escritura en la carpeta), total **237,9** (+0,1, la confirmación de importar y la carpeta de solo lectura, en trozos perezosos). Ningún techo se mueve.

### 9.3 Bloque 0, paso 2 — una sola corrección viva

- **Predicción de los ficheros dorados, escrita antes de correr la suite**: no se mueve ninguno. `synthetic-v1.jsonl` tiene una sola línea con `corrects_id` (contado con `grep -c`), y los demás, ninguna: la regla no puede disparar en ellos. `synthetic-v1.snapshot.json`, `synthetic-v1.tax.json` y `tax-hand-v1.jsonl`, igual.
- **Rojo**: los tres tests de la regla se escribieron antes que ella y fallaron; el caso de §3 (anulación de C1 **después** de C2) falló por la razón buena: la proyección lo aceptaba. **Mutantes**: aceptar dos correcciones vivas (5) — muerto; juzgar «viva» con el conjunto final de anulaciones (17) — muerto; escribir la pareja de `correctEvent` en dos escrituras con un almacén que falla en la segunda (4) — muerto.
- **La predicción se cumplió**: la suite entera en verde sin regenerar ningún dorado.
- **El argumento de ADR-0026 Parte C se sostiene** (§6): ningún camino de la aplicación escribe dos correcciones vivas.

### 9.4 Bloque 0, paso 3 — `broker_settled_eur`

- **Rojo**: los cinco tests de validación fallaron antes de existir el campo (el campo desconocido se rechazaba).
- **Códigos nuevos**, cada uno con su literal y en su llamada: `broker_settled_eur_in_eur`, `broker_settled_eur_negative`, `broker_settled_eur_zero`. Los caza el escáner de `tests/messages.test.ts` (`invalid(`), y los traducen las dos interfaces.
- **Quién lo lee** (lista cerrada, test de arquitectura con las tres formas de lectura): `schema/validate.ts` y `ecb/broker-settlement.ts`, la única función que lo pone al lado del importe al tipo del BCE. Las interfaces lo enseñan a través de ella: la web, en el detalle del movimiento (dos filas derivadas, enmascaradas); **la consola no tiene un detalle de movimiento**, así que lo dice en la vista previa de `atlas add`, antes de confirmar, que es el único sitio donde enseña un movimiento entero. Que la dirección diga si quiere más.
- **En la web, solo en los formularios de compra, venta y dividendo**: el interés y la comisión suelta no tienen formulario en la web (se registran desde la consola, que sí lleva el *flag* en los cinco).
- **Mutantes**: leerlo fuera de la lista (por punto, en el dominio; por desestructuración, en la web) — muertos; meterlo en la huella — muerto; aceptarlo en euros — muerto; aceptar un cero en una compra — muerto; rechazar el cero de un dividendo — muerto; escribirlo como `"0"` cuando no se conoce (web y consola) — muertos.
- **Paquete web**: arranque **73,4** (73,5 en `develop`): el dominio +108 bytes por la regla de una corrección viva y **+208 bytes por la validación de `broker_settled_eur`** (dicho aparte, como pidió la dirección), medido quitando cada una y construyendo otra vez; la escritura en la carpeta que sale del arranque, −0,4. Total **238,9**; el techo del total sube a **239,9** en su propio commit (`0fcf20c`), con la tendencia escrita en `check-bundle.mjs`. Todo lo del BCE queda fuera del arranque, y la comprobación de forma del *build* lo exige desde `f276cd9`.

### 9.5 Bloque 1 — El núcleo puro del BCE

- **Módulos**: `packages/domain/src/ecb/` (`history.ts`, `resolve.ts`, `update.ts`, `target.ts`, y `broker-settlement.ts` del bloque 0), detrás de la puerta `@atlas/domain/ecb`, **nunca** en el barril: un test de arquitectura lo exige en la fuente y `check-bundle.mjs` en la salida real. El grupo `domain` de `vite.config.ts` los excluye del trozo de arranque, igual que `tax/`.
- **Fixtures sintéticas con el formato real** (`tests/fixtures/ecb/`): `eurofxref-hist.csv` (cabecera real de 43 columnas, `N/A`, coma final, fechas descendentes, sin ceros finales, sin 25-26/12 ni 1/1) y `api-exr.csv` (CRLF, ascendente, **filas `H` sin valor** en 25 y 26/12). Valores inventados; las genera, byte a byte igual cada vez, `tests/fixtures/ecb/make-synthetic.mjs`.
- **Resolución**: una unión cerrada `euro | resolved | not_yet_published | currency_not_published | currency_stale`. El umbral de `currency_stale` es `ecb_stale_currency_days` (30 por defecto, D6). Una decisión mía que conviene que la dirección vea: una divisa se da por **dejada de publicar** cuando su último valor es más antiguo que el umbral **respecto de F y respecto de la última publicación del histórico** (el lev el 2026-02-02: sí; el 2026-01-02, dos días después de su último valor: se resuelve con el del 31/12, que es lo que dice la letra del punto 5). Y se comprueba **antes** que «aún no publicado», para que una operación en una divisa muerta no se quede como borrador esperando un tipo que no va a llegar.
- **Mutantes**: resolver un hábil no publicado con el anterior (8) — muerto; comparar como cadena en la actualización (6) y en `sameRate` — muertos; sustituir con un histórico que cambia un tipo (10) — muerto; quitar Viernes Santo y el 26/12 del calendario (11) — muertos; comparar el calendario fuera de los años del libro (22) — muerto; ignorar el umbral — muerto; leer una fila `H` de la API como publicación — muerto.
