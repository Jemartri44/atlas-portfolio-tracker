# Preguntas y verificaciones de la feature 014

Fechas en `Europe/Madrid`. Todo lo ejecutado está en el *scratchpad* de la sesión (`014-idb/`, `014-json/`, `014-bundle/`), nunca en el repositorio. Las salidas se citan literalmente.

---

## 0. Estado: alto del plan (2026-09-25)

`spec.md` y `plan.md` escritos; **ninguna línea de código**. Las verificaciones del bloque 0 salen **las cuatro bien** (§1). **Hay una parada**: con lo que el encargo exige, **el arranque del paquete web no cabe en su techo** (§3); lo he medido con un prototipo deshecho y lo dejo a la dirección, como manda §5 del encargo. Y hay dos preguntas que no son de confirmar una propuesta sino de decidir (Q1 y Q6, §5).

---

## 1. Bloque 0 — las verificaciones, con su fuente

### 1.1 Punto 1 — La durabilidad de una transacción de IndexedDB

Consultado el 2026-09-25. Las citas de la especificación, de MDN, de Bugzilla, de chromestatus y del código de los navegadores están descargadas y copiadas **literalmente**; las dos marcadas con (†) se leyeron a través de un resumen automático de la página y pueden no ser literales.

**La especificación** — W3C *Indexed Database API 3.0*, Editor's Draft del 13 de agosto de 2025 (`https://w3c.github.io/IndexedDB/`) y Working Draft de la misma fecha (`https://www.w3.org/TR/2025/WD-IndexedDB-3-20250813/`); el texto de la durabilidad es el mismo en las dos.

- §2.7 *Transactions*: «A transaction has a durability hint. This is a hint to the user agent of whether to prioritize performance or durability when committing the transaction. […] "strict" — The user agent may consider that the transaction has successfully committed only after verifying that all outstanding changes have been successfully written to a persistent storage medium. "relaxed" — The user agent may consider that the transaction has successfully committed as soon as all outstanding changes have been written to the operating system, without subsequent verification. "default" — The user agent should use its default durability behavior for the storage bucket. This is the default for transactions if not otherwise specified.»
- Nota de §2.7: «In a typical implementation, "strict" is a hint to the user agent to flush any operating system I/O buffers before a complete event is fired.»
- §5.4 *Committing a transaction*, nota: «Only after the transaction has been successfully written is the complete event fired.»

**Lo que dice**: la durabilidad es una **pista** («may», «should»); qué significa «escrito» y qué es `"default"` lo decide el navegador. `complete` no garantiza por sí solo que esté en disco.

**Lo que hace cada navegador por defecto**:

- **Chromium**: `"default"` es hoy **`relaxed`**. `https://developer.chrome.com/blog/indexeddb-durability-mode-now-defaults-to-relaxed` (actualizado el 2023-11-03): «The default durability mode in IndexedDB is changing from strict to relaxed from Chrome 121.» y «with strict durability, the IndexedDB transaction complete event is not fired until after the data is actually written». En el código actual de Chromium (`components/services/storage/public/cpp/buckets/bucket_info.h`): `durability = blink::mojom::BucketDurability::kRelaxed;`; y `strict` **se respeta**: `content/browser/indexed_db/…/leveldb/backing_store.cc` (`ShouldSyncOnCommit` es cierto con `Strict`) y el motor SQLite nuevo (`sqlite/database_connection.cc`: `Strict` → `"PRAGMA synchronous=FULL"`). La versión exacta del cambio de valor por defecto **no está verificada**: el blog y el anuncio de blink-dev (†) dicen 121, chromestatus (`https://chromestatus.com/feature/5084460341264384`) marca 122 y un comentario de `storage/browser/quota/quota_database.cc` dice M124. Para esta feature da igual: es `relaxed` en todas.
- **Firefox**: por defecto, SQLite `synchronous = NORMAL` (`dom/indexedDB/ActorsParent.cpp`; comentario de `IndexedDatabaseManager.cpp`: «This guarantees (unlike synchronous = OFF) atomicity and consistency, but not necessarily durability in situations such as power loss»). La opción existe desde Firefox 126 (Bugzilla 1878143) y se respeta desde el 129 (Bugzilla 1883045): `strict` → `EXTRA`, `relaxed` → `OFF`.
- **Safari/WebKit**: la opción existe desde Safari 15 (changeset 280415, bug 228289 (†)); en `SQLiteIDBBackingStore.cpp`, **solo** con `Strict` se hace `sqliteDB->checkpoint(SQLiteDatabase::CheckpointMode::Full)`. Sin verificar: el nivel de `synchronous` que usa WebKit y si el `fsync` de Apple llega al disco físico.
- MDN (`https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction`, `…/IDBTransaction/durability`) y `browser-compat-data`: Chrome 83, Firefox 126, Safari 15.

**Conclusión**: **ningún navegador asegura en disco por defecto**. Por la decisión de la dirección, la transacción que escribe lo retenido pide **`durability: "strict"`**, que los tres respetan hoy.

**Probado en Chromium de verdad** (guion `014-idb/drive-014.mjs`, página `014-idb/page.html`, Chromium de Playwright `chromium-1234` = *Chrome for Testing* 151.0.7922.34, sin interfaz, conducido por el protocolo DevTools con el `fetch` y el `WebSocket` de Node 22, sin dependencias), salida literal (`014-idb/drive-014.out`):

```
support {"ua":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/151.0.0.0 Safari/537.36","hasProp":true,"defaultReports":"default","strictReports":"strict","relaxedReports":"relaxed"}
```

`strict` se acepta y la transacción lo conserva (`tx.durability === "strict"`).

### 1.2 Punto 2 — Una transacción que escribe varias claves del almacén es atómica, en Chromium

**La especificación**, §2.7.1 (normativo): «The implementation must atomically write any changes to the database made by requests placed against the transaction. That is, either all of the changes must be written, or if an error occurs, […] the implementation must not write any of the changes to the database». §5.5: «All the changes made to the database by the transaction are reverted.» **Salvedad** (§5.6 y §5.10): si el manejador de error de una petición llama a `preventDefault()`, solo se deshace esa petición y la transacción **puede seguir y confirmar el resto**. El plan lo tiene en cuenta: la transacción del paso 6 no cancela ningún error sin abortar después (hoy `BrowserLedgerBlob.update` lo hace así: `preventDefault` y `settle.fail`, que llama a `tx.abort()`).

**Probado** con el mismo guion, **20 rondas**, sobre un almacén `ledger` con las claves `current`, `sync:state`, `sync:held` y `archive/a`, sembradas en cada ronda con valores conocidos en una transacción `strict`:

1. **Aborto explícito a mitad**: tres `put` en una transacción `strict` y `tx.abort()` en el éxito del segundo. Tras el aborto, las tres claves tienen el valor sembrado.
2. **Aborto por error a mitad**: dos `put`, un `add` sobre `archive/a` que ya existe (sin `preventDefault`) y un cuarto `put`. La transacción aborta con `ConstraintError` y las cuatro claves siguen como estaban.
3. **El navegador muere a mitad**: tres `put` y una cadena de lecturas que mantiene viva la transacción; `SIGKILL` al proceso entero de Chromium; se relanza con el mismo perfil. Las tres claves tienen el valor sembrado.
4. **`strict` confirmada y el navegador muere al instante**: tras `complete`, `SIGKILL`, se relanza. Las tres claves tienen el valor nuevo.

Salida literal:

```
rounds 20 {"abortMid":20,"errorMid":20,"crashMid":20,"strictSurvives":20}
```

**Lo que prueba y lo que no**: la atomicidad de varias claves se sostiene en los tres modos de aborto, 20 de 20. El punto 4 prueba que `strict` se acepta y que lo confirmado sobrevive a la muerte del **proceso**; no prueba el vaciado al disco ante un corte de corriente, que no se puede provocar desde aquí: eso lo sostienen la especificación y el código de Chromium citados en §1.1.

### 1.3 Punto 3 — La durabilidad de lo retenido en la consola

Es un test con un sistema de ficheros inyectado (§6.3 (V9)), así que se escribe en el bloque 4. Lo que se inyecta y dónde, en `plan.md` §6: `FileLedgerStore` y el almacén de estado de la consola reciben un `FileOps` (`open`, `rename`, `rm`, `readFile`, `mkdir`, `fsyncDir`), por defecto `node:fs/promises`; el test lo envuelve sobre una carpeta temporal, **registra** `write`, `sync`, `rename` y `rm` con su ruta, y **falla si el `sync()` del manejador del temporal de `held.jsonl` no aparece antes del primer `open` del temporal del libro**. Con la misma envoltura se comprueba que toda escritura ocurre con nuestro cerrojo puesto.

### 1.4 Punto 4 — Los bytes de una línea sobreviven al viaje de `docs/api.md` §5.2

Guion `014-json/roundtrip-014.mjs`, sobre el dominio compilado de esta rama y el `fast-check` del repositorio. Por cada línea: el cliente la mete en `{ "lines": [{ "line": … }] }`, `JSON.stringify`, codifica en UTF-8; el servidor decodifica en UTF-8 (con `fatal: true`), `JSON.parse`, y la línea que saca, codificada en UTF-8, se compara **byte a byte** con la original. También el camino de vuelta (la línea escrita con `"\n"` y releída del fichero). Casos:

- las 200 líneas del sintético (`generateLedger({ seed: 42 })`) tal como las escribe `encodeLine`;
- **5.000 corridas** de `fast-check` (semilla 14) metiendo en `notes` de compras, ventas, depósitos, valoraciones, dividendos y tesis: textos fijos (`ñandú á é í ó ú ü Ñ`, `emoji 📈💶🇪🇸`, comillas dobles, barras invertidas sueltas y dobles, tabuladores y caracteres de control, `U+2028`/`U+2029`), grafemas cualesquiera, y mezclas de `ñ`, `á`, `\`, `"`, `📈`, `U+0000`, saltos de línea y retornos; cada línea se comprueba además sin salto crudo dentro y que se decodifica al mismo evento;
- tres textos **no canónicos** (espacios, `\/`, una `é` escrita como secuencia de escape `\u00e9` junto a una `é` literal, comillas escapadas).

Salida literal (`014-json/roundtrip-014.out`), código de salida 0:

```
synthetic events: 200
plain synthetic lines round-tripped: 200
fast-check runs with notes: 5000 — all byte-identical
non-canonical texts round-tripped: 3
```

**Conclusión**: el contrato de `docs/api.md` §5.2 (la línea como cadena JSON) conserva los bytes. El mismo resultado sostiene el formato de `held.jsonl` (la línea dentro de un registro, como cadena: `plan.md` §5.2).

---

## 2. Lo que el encargo afirma del código, comprobado sobre esta rama

La rama sale de `origin/develop` = `57d0075`. El encargo se comprobó sobre `523abb8`; entre los dos solo cambian documentos: `git diff --stat 523abb8..57d0075 -- packages apps tests` sale vacío.

Comprobado y **cierto**: `LoadedLedger.lines`; `append` y `replace` reserializan con `encodeLine`; el etag de `MemoryLedgerStore` es un contador; `MemoryLedgerStore.replace` **no** valida el nombre del archivo (`file.ts` y `blob.ts` sí, `invalid_archive_name`); el cerrojo **no es reentrante** (`withFolderLock` → `acquireFolderLock` → `open(path, "wx")` → `EEXIST` → `LedgerLockedError`, también contra el propio proceso); `DB_VERSION = 2` con `ledger`, `handles` y `drafts`; las claves `current`, `current:meta`, `archive/…`, `prices:imported` (`browser/prices.ts:15`) y `reference:ecb` (`browser/reference.ts:14`); `openAtlasDb` está en el arranque (el mapa de fuente del trozo `domain-*.js` de `index.html` lista `idb.ts`, `blob.ts`, `indexeddb.ts`, `record-event.ts`, `rectify.ts` y `preview-event.ts`); `correctEvent` añade `[reversal, event]` en una escritura (`rectify.ts:175`); `checkCandidate` en `rectify.ts:144` y `rule-change.ts:270`; `writeRateCorrections` es un solo `append` de la cadena (`rule-change.ts:280-283`); `replaceLedgerText` en `transfer.ts`, llamado desde `importLedger`; `atlas backup` copia solo `ledger.jsonl`; los tests «never writes in a folder of the disk from the browser» (línea 1067) y «keeps out every file that is the compiled twin of a source» (línea 1649, sobre `git ls-files`); `SUPPORTED_EVENT_TYPES` tiene 26 tipos y `RESERVED_EVENT_TYPES` está vacío (`schema/envelope.ts`). Solo `rectify.ts` y `rule-change.ts` escriben `corrects_id`, siempre justo detrás de su anulación (también el sintético, `synth/scenario.ts:975-989`).

**Dos cosas que no cuadran con el encargo**:

1. **El arranque** (§3): el encargo dice que, con `DB_VERSION` sin subir, «lo que sí puede crecer el arranque es cualquier módulo nuevo que alcance la entrada, o un nombre de fragmento más en su tabla». **No es todo**: `blob.ts` y `record-event.ts` **ya** están en el arranque, y el encargo pone en ellos dos cosas obligatorias —las operaciones de líneas crudas de `BlobLedgerStore` (bloque 1) y la negativa de V7 en `checkInvalid`—. Las dos crecen el arranque, y juntas no caben.
2. **Menor**: el encargo pide para `sync/` la escritura atómica «temporal `"wx"`, `sync`, `assertOwned`, renombrado, como `FileEcbHistoryStore`». `FileEcbHistoryStore` abre el temporal con `"wx"` (`ecb/history-store.ts:89`), pero `FileLedgerStore` lo abre con `"w"` (`file.ts:94`). Para `sync/` uso `"wx"`; `file.ts` no lo cambio salvo que la dirección lo pida.

---

## 3. **Parada: el arranque del paquete web no cabe**

**Partida**, medida con `npm run build` sobre esta rama (guion `014-bundle/measure-014.mjs`, la misma regla que `check-bundle.mjs`, en bytes exactos): **arranque 75.703** (techo 75.725, **22 de margen**), total **276.111** (techo 276.480, 369 de margen). Coincide con el encargo.

**Medido con un prototipo** en el árbol de trabajo, construido y deshecho después (`git checkout -- packages`; ningún commit, ningún gemelo `.js` después):

| Prototipo | Arranque | Δ | Total | Δ |
|---|---|---|---|---|
| Partida | 75.703 | — | 276.111 | — |
| A: `appendLines` y `replaceLines` en `BlobLedgerStore`, compartiendo el cuerpo con `append` y `replace` (validación de cada línea con `decodeLine` y del salto con su código) | 75.797 | **+94** | 276.145 | +34 |
| A + B: la negativa de V7 en `checkInvalid` (una condición y un código más en `DependentEventsError`) | 75.829 | **+32** (acumulado **+126**) | 276.255 | +110 (acumulado +144) |

`check-bundle.mjs` para el *build* en los dos (`build=1`). **Lo demás de la feature no toca el arranque**: el cliente de la web, la orquestación y el dominio de la sincronización son perezosos y en la 014 ni siquiera entran en el paquete (nada del marco los importa); la negativa de importar, lo retenido en la exportación, V7 en `write.ts` y los mensajes van en trozos perezosos.

**El encargo prohíbe** subir el techo del arranque, esconder algo con una importación dinámica o recortar una comprobación para que quepa. Así que **paro** y la dirección elige. Las opciones que veo, sin elegir:

- **(a) Subir el techo del arranque** lo medido más un margen pequeño (propuesta: +130, a 75.855), en su propio commit y con la medida en el comentario. Coste: 0,13 KB en cada arranque. Es lo que el encargo deja expresamente a la dirección.
- **(b) Sacar las operaciones crudas de la clase del arranque**: un `RawLineLedgerStore` que extiende `LedgerStore` con las dos operaciones, y un `RawBlobLedgerStore extends BlobLedgerStore` en un módulo perezoso. Ahorra los +94, pero **cambia la letra** de ADR-0026 («el puerto `LedgerStore` gana dos operaciones») y del encargo: el puerto base no las tendría, y el almacén de la web que se abre en el arranque tampoco. Quedaría +32 de V7, que **tampoco cabe** en 22.
- **(c)** Las dos negativas con coste cero en el arranque no existen: la de V7 tiene que estar en `checkInvalid` por decisión de la dirección (para que la vista previa y el registro fallen igual), y `checkInvalid` es del arranque.

**El total** tampoco cabe (+1,8 a +3 KB estimados, casi todo los mensajes nuevos, perezosos), y ese sí sube con la regla de siempre, en su propio commit, sin preguntar.

---

## 4. Los avisos que «piden confirmación», leídos del código

Leído en `packages/domain/src`, `apps/cli/src/commands` y `apps/web/src` el 2026-09-25. La propuesta, en `plan.md` §8.

**Los que la interfaz pregunta antes de escribir**:

1. **Huella repetida** (`DuplicateFingerprintError`, ADR-0012). Se calcula en `usecases/record-event.ts:81-90` sobre `state.fingerprints` (que salta los anulados, `projections/project-ledger.ts:424-435`), se lanza en `record-event.ts:209-212` y `rectify.ts:170-173`, y la vista previa la devuelve sin lanzar (`preview-event.ts:148, 242`). Consola: falla y se repite con `--confirm-duplicate` (`shared.ts:174-177`, `corporate-actions.ts:334-336`, `rectify.ts:146-152`, `draft.ts:179-183`). Web: `DuplicateDialog.tsx:29-37`, reintento con `confirmDuplicate` (`EventForm.tsx:134-154, 236-240`; `corporate/form.tsx:105-120, 229`). **Solo depende del libro. La hace cumplir el dominio.** Tipos con huella (`schema/fingerprint.ts`): `buy`, `sell`, `swap`, `transfer`, `dividend`, `interest`, `fx_exchange`, `cash_deposit`, `cash_withdrawal`, `standalone_fee`, `corporate_action`, `tax_return_filed`.
2. **`settings_changed` que deja eventos inválidos** (`newly_invalid_events`, ADR-0015): `record-event.ts:157-192`. Solo el libro; lo hace cumplir el dominio. Con V7 deja de ser una confirmación cuando la sincronización está configurada.
3. **Tipo del BCE tecleado que no es el oficial** (`rateConfirmations`, `ecb/propose.ts:119-134`): consola `rates.ts:115-134` (`--confirm-fx-rate`; `--yes` no basta), desde `add.ts:273` y `rectify.ts:133`; web `forms/rates.ts:95-112` → `registrar/rates.ts:98-107`, casilla en `RateNotes.tsx` y comprobación en `EventForm.tsx:138`. **Depende del histórico local del BCE** y de la configuración local, además del libro. **Solo la interfaz.**
4. **Un cambio de configuración que silencia avisos de umbral** (`silencedWarnings`, `projections/settings-impact.ts:116-133`): consola `catalogue.ts:290-312, 503`; web `configuracion.tsx:117-121` → `SettingsDialogs.tsx:92-109`. Libro, **reloj** y valoraciones. Solo la interfaz.
5. **Un cambio de regla que deja tipos que no son de la nueva fecha fiscal** (`ruleChangeRates`, `ecb/rule-change.ts:108-159`): consola `rule-change.ts:63-86` desde `catalogue.ts:507`; web `ajustes/rule-change.ts:29-47`. Libro e histórico del BCE. Solo la interfaz.
6. **Un cambio de configuración que mueve ejercicios pasados** (`movedFiscalYears`, `settings-impact.ts:83-103`; `movedTaxYears`, **`tax/year.ts:187-240`, el motor fiscal**): consola `catalogue.ts:320-398, 512` (los dos); web `configuracion.tsx:126-136` → `SettingsDialogs.tsx:111-153` (solo el primero, y pregunta también si `closedYearsOfSettings` no está vacío, `write.ts:215-218`). Solo la interfaz.

**El ejercicio cerrado** (ADR-0020), que ADR-0026 pone de ejemplo: `closedYearsTouched` (`filings/touched.ts:121-139`) lo devuelven `RecordResult`, `CorrectResult`, `ReverseResult` y la vista previa; **nunca niega** y ningún caso de uso tiene opción para él. Las interfaces lo dicen **delante** de la pregunta general («¿Registrar?», «¿Rectificar?», «¿Anular?»), no como pregunta propia, salvo en los ajustes de la web. Depende del libro y del día de hoy (`closedYears` ignora presentaciones con `filed_at` posterior a hoy, `projections/filings.ts:181-200`). La cifra que mueve (`closedYearImpact`, `@atlas/domain/fiscal`) usa el motor fiscal.

**Parecen confirmaciones y no lo son**: `unfiledPastYears` y `priorYear` (notas); los avisos propios del evento (recompra, stop del cubo); el importe del bróker; las notas del tipo propuesto; un duplicado al guardar un borrador (nota, `draft.ts:77-81`); las notas de la presentación complementaria. Y **son negativas duras, sin confirmación**: `dependent_events`, `ledger_has_invalid_events`, `duplicate_isin`, `filing_already_exists`, `filing_supersedes_invalid`, `conflict`.

**Dos cosas encontradas de paso**, que no son de esta feature y anoto para la dirección: la web **no deja confirmar una presentación duplicada** (`fiscal/presentar.tsx:36-40, 119` no pasa `confirmDuplicate`: termina en «Ya hay una presentación idéntica registrada»), y el formulario de eventos corporativos de la web **no dice el ejercicio cerrado** (`registrar/corporate/form.tsx`), cuando la consola sí.

---

## 5. Preguntas a la dirección

Las que son **decisión** y no confirmación van primero.

- **Q1 — El libro local puede quedar inválido al retener una pareja.** Al retener una pareja, lo que va detrás se queda en el libro local como pendiente (tercera enmienda), pero la pareja sale del libro. En el caso 11 —corregir una compra de 10 a 20 y vender 15— el libro local se queda con la compra de 10 y la venta de 15: **inválido**. Las consultas degradan (ADR-0015) y **las mutaciones se niegan** hasta que el usuario resuelva la retenida. ¿Es lo que se quiere? Alternativas que veo, sin elegir: (a) aceptarlo y decirlo en la explicación de la retenida (la 015 lo enseña); (b) retener también lo que va detrás **y depende** de la unidad retenida (contradice «se queda pendiente, no retenida»); (c) no quitar la unidad retenida del libro local hasta resolverla (contradice «réplica = remoto + cola» y la segunda enmienda).
- **Q6 — La definición de «sincronización configurada» de V7 choca con desactivar.** V7 dice «que exista `sync/`». Desactivar tiene que conservar lo retenido (P4), que vive en `sync/`, así que tras desactivar `sync/` sigue existiendo y `acceptInvalid` quedaría negado para siempre, cuando la propia nota de ADR-0015 da desactivar como remedio. Y `compact` se niega con `sync/` sin marcador. **Propuesta** (`plan.md` §12.4): desactivar deja el marcador con `status: "disabled"`; «configurada» = existe `sync/` y el marcador no dice `disabled` (ilegible o ausente cuentan como configurada, fallo seguro); en la web, lo mismo con `sync:state`.
- **Q7 — El arranque** (§3): (a), (b) u otra cosa.
- **Q2 — La cadena** (`plan.md` §9): toda secuencia contigua de dos o más parejas es una cadena. ¿Confirmas? ¿Y el refinamiento del `reason` idéntico, que retiene menos a cambio de depender de un detalle de `prepareRateCorrections`? Recomiendo no usarlo.
- **Q3 — La lista de avisos** (`plan.md` §8): entran la huella repetida y el ejercicio cerrado; no entran el tipo del BCE, silenciar umbrales, los tipos tras un cambio de regla ni los ejercicios movidos. ¿Confirmas, o prefieres la alternativa conservadora (retener todo `settings_changed` pendiente si el remoto ganó cualquier línea)?
- **Q4 — Toda retenida sin resolver bloquea toda la cola**, también las de una reescritura o de unirse. ¿Confirmas?
- **Q5 — Empezar desde el remoto** al unirse: archivo los bytes locales **y además** retengo lo que el libro local tenía y el remoto no (como tras una reescritura). ¿O basta con archivar?
- **Q8 — Qué es «el remoto cambió esa cuenta o ese activo»** (caso 4): propongo que cuente también la anulación o la corrección, en la cola del remoto, de un `*_created`/`*_updated` de esa cuenta o ese activo, y, para `settings_changed`, la anulación de un `settings_changed`: las dos cambian la foto en vigor igual que una foto nueva.
- **Q9 — Reintentos**: tras tres `412` seguidos, o tres cambios del libro local en el paso 6, la sincronización para con su motivo (`remote_contention`, `local_changed`). Constantes con nombre en el cliente, no configuración. ¿Confirmas?
- **Q10 — `"\r"`** en una línea cruda se rechaza, como en `docs/api.md` §5.2. Consecuencia: un libro escrito a mano con finales de línea de Windows no se puede sincronizar ni restaurar sin compactarlo antes. ¿Confirmas?
- **Q11 — Un remoto que ya tiene eventos inválidos** (un endurecimiento futuro) para la sincronización con `remote_ledger_invalid`, sin retener nada: no es culpa de ninguna línea. ¿Confirmas?
- **Q12 — Los nombres de archivo**: `pre-sync-<fecha>T<hora>-<12 hex del etag>.jsonl`, `pre-join-…` y `pre-redownload-…`.
- **Q13 — La copia de lo retenido**: `ledger-<fecha>.held.jsonl` en `atlas backup`, `ledger.held.jsonl` en la web; sin retenidas sin resolver, no se escribe y se dice. Se copia el fichero entero, con su historial de resoluciones.
- **Q14 — Rehacer con el identificador sellado antes** (`plan.md` §10.2), como los borradores del BCE tras §11.1 y §12.1 de la 012.
- **Q15 — La regla del sello en el cliente**, dicha por bytes: una línea que sella solo se reaplica si el prefijo sobre el que caería es, byte a byte, el que tenía delante en local. Es la forma exacta de «el remoto ganó líneas o una pendiente anterior quedó retenida», y además no se engaña con las líneas propias que el remoto ya tenía (respuesta perdida). ¿Confirmas?
- **Q16 — Qué es «huella repetida» en cada lado.** Al añadir, el remoto usa la regla de siempre (huellas de eventos **no anulados**, `state.fingerprints`). En la inicialización, `docs/api.md` §5.5 y V17 dicen «todo evento cuya huella repite la de uno **anterior en el fichero**», anulado o no: es un superconjunto, y el cliente y el remoto usarían los dos esa regla literal para `confirm_duplicate_ids`. ¿Confirmas que son dos reglas distintas a propósito?

---

## 6. Documentos (para que los traslade la dirección)

Lo que creo que tendrá que cambiar, y que no toco:

- `docs/data-schema.md` §1: los formatos de `sync/state.json`, `sync/held.jsonl` y `sync/discarded.jsonl` que queden (con `status: "disabled"` si Q6 sale así), las claves `sync:*` de IndexedDB, el nombre del archivo de una sincronización que reordena (`pre-sync-…`), los de unirse y volver a descargar, y la copia `ledger-<fecha>.held.jsonl` de `atlas backup`. Y la columna de retención de `held` y `discarded`: «para siempre» se cumple porque los dos son de solo añadir.
- `docs/data-schema.md` §5: quitar «previsto para la feature de sincronización» del punto (6) de `compact`; los nombres `appendLines` y `replaceLines`; el código `raw_line_break`; que las operaciones crudas las cumplen **tres** adaptadores (el texto dice cuatro, con S3, que es de la 015); y la transacción `strict` de IndexedDB.
- ADR-0026: lo que el bloque 0 encontró de IndexedDB (ningún navegador asegura en disco por defecto; `strict`, respetado por los tres; atomicidad de varias claves verificada en Chromium) y, si sale así, la definición de «configurada» de Q6.
- ADR-0015: la nota fechada, si Q6 cambia la definición.
- `docs/api.md`: nada que el remoto simulado haya contradicho todavía; lo veré al construirlo.
- `docs/prompts/README.md`.
- Añadidos al implementar (§10): `docs/api.md` §5.1, que el puerto del remoto entrega el **texto** decodificado de los bytes (el dominio no tiene decodificador) con el etag de los bytes; §5.2, que la lista cerrada de fallos que no son de una línea es `REMOTE_FAILURE_CODES` (y que el cliente los lleva tal cual en `remote_failed`); `docs/data-schema.md` §1, el sufijo `-2`, `-3`… de los archivos de la sincronización y el nombre de la copia de lo retenido; la configuración nueva de pruebas (`tsconfig.test-sync.json`, `dist-test-sync/`) y la agrupación del fragmento `domain` de Vite, que excluye ya `sync/`, `sync.ts` y sus dos puertos.

---

## 7. Gemelos `.js`

Tras el *build* de partida y tras deshacer el prototipo, búsqueda de un `.js` junto a un `.ts`/`.tsx` del mismo nombre fuera de `dist*/` y `node_modules/` en `packages`, `apps` y `tests`: **ninguno** (2026-09-25).

---

## 8. Respuestas de la dirección (2026-09-25)

El plan recibe el **visto bueno**. Decisiones, tal como llegaron:

- **D-Q7, el arranque: (a).** Se sube el techo del arranque **exactamente lo medido** por las operaciones crudas de `blob.ts` y la negativa de `checkInvalid`, **con un tope de +140 bytes**, en su propio commit, con el desglose y la tendencia escritos. *Motivo de la dirección*: son reglas del dominio que viven donde ya está el arranque, y mantener la letra de ADR-0026 vale más que 94 bytes. **Si se pasa del tope, se para.** El total sube con la regla de siempre, en su commit.
  - **Errata del encargo** (§5, «El paquete web»): suponía que el arranque solo crecería por módulos nuevos o por un nombre de fragmento más; `blob.ts` y `record-event.ts` ya están en él y el encargo pone ahí dos cosas obligatorias.
- **D-Q1: se acepta** que el libro local quede inválido al retener una pareja, **con una condición**: las acciones de resolver lo retenido (confirmar, rehacer, descartar) **nunca quedan bloqueadas** por el libro local inválido; el usuario siempre puede salir del estado en que la sincronización le dejó. Las consultas degradan (ADR-0015) y la aplicación **dice por qué y dónde resolverlo**.
- **D-Q6**: «sincronización configurada» = existe `sync/` **y** el marcador no dice `disabled` (en la web, existe `sync:state` y no dice `disabled`). La nota en ADR-0015 la escribe la dirección al cerrar.
  - **Enmienda de la dirección (2026-09-25, revisión de la PR #84):** en la web cuenta como configurada con que exista **cualquiera** de las claves `sync:state`, `sync:held` o `sync:discarded` (el equivalente de la carpeta `sync/`), y el marcador no diga `disabled`. Es la regla que implementa el código (`browserSyncConfigured`, `packages/adapters/src/ledger-store/browser/sync-store.ts`), más amplia que la de arriba, y la dirección la acepta porque va por el lado seguro: con lo retenido y sin marcador, `acceptInvalid` se niega.
- **D-Q2**: toda secuencia contigua de dos o más parejas es una cadena, **sin** el refinamiento del `reason`.
- **D-Q3**: la lista propuesta (huella repetida y ejercicio cerrado).
- **D-Q4**: toda retenida sin resolver bloquea la cola (ya estaba decidido).
- **D-Q5**: empezar desde el remoto **archiva y además retiene** lo que el libro local tenía y el remoto no.
- **D-Q8**: la propuesta, confirmada.
- **D-Q9**: tres `412` y tres cambios locales, como constantes con nombre.
- **D-Q10**: `"\r"` se rechaza; el mensaje **dice que se compacte primero y cómo** (`atlas compact`), porque un libro con finales de línea de Windows no tiene por qué ser un error del usuario.
- **D-Q11**: confirmado.
- **D-Q12, D-Q13, D-Q14 y D-Q15**: confirmados tal como se propusieron.
- **D-Q16**: en la inicialización, la regla literal de V17 (superconjunto: todo lo del libro local se aceptó en local); al añadir, la regla de siempre.
- **Los dos fallos ajenos** de §4 **no se arreglan en esta feature**: van a una ronda de arreglos aparte, con su reproducción (§9).

## 9. Fallos ajenos a la feature, para una ronda de arreglos

### 9.1 La web no deja confirmar una presentación duplicada

- **Dónde**: `apps/web/src/routes/fiscal/presentar.tsx:36-40` (texto) y `:119` (`recordDraft(asEventDraft(draft))` sin `confirmDuplicate`).
- **Reproducción**: en la web, registrar una presentación de un modelo y ejercicio; volver a «Presentar» el mismo modelo y ejercicio y teclear **el mismo justificante** (la propuesta pone `supersedes` a la vigente, así que no choca con `filing_already_exists`; la huella —`type`, `model`, `tax_year`, `receipt_reference`— sí se repite). Resultado: «Ya hay una presentación idéntica registrada.» y ningún camino para confirmarla. En la consola, `atlas filed … --confirm-duplicate` la registra. ADR-0012: una huella repetida es un aviso con confirmación, nunca un rechazo.

### 9.2 El formulario de eventos corporativos de la web no avisa del ejercicio cerrado

- **Dónde**: `apps/web/src/routes/registrar/corporate/form.tsx` no calcula ni enseña `closed` (ni `ClosedYearNotice`); la consola sí (`apps/cli/src/commands/corporate-actions.ts:327-330`).
- **Reproducción**: con una `tax_return_filed` de `renta` vigente para un ejercicio, registrar en la web un evento corporativo con fecha dentro de ese ejercicio: se registra sin el aviso de ejercicio presentado que la consola imprime antes de preguntar (ADR-0020).

### 10.3 Bloque 2 — los guardianes, antes que el motor (2026-09-25)

- **Qué hay**: la puerta `@atlas/domain/sync` (`sync.ts`) con un módulo casi vacío (`sync/reapply.ts`), el puerto `ports/remote-ledger.ts` (`RemoteLedger`, `RemoteError`), y tres clientes vacíos en adaptadores (`sync/client.ts`, `sync/folder-store.ts`, `ledger-store/browser/sync-store.ts`), con sus subrutas `./sync` y `./sync-client` y sus alias en Vite y vitest. En `tests/architecture.test.ts`, «the sync engine»: siete guardianes, leídos de carpetas y del grafo de importaciones **entre paquetes** (las subrutas se resuelven leyendo `exports`); y cuatro entradas nuevas de `LAZY_ONLY`.
- **Mutantes, vistos morir** (`014-mut/b2.json`, `b2b.json`): `tax/chain.ts`, `informative/attention.ts` y `project-ledger.ts` que importan la sincronización; `record-event.ts` que alcanza el motor; `main.tsx` de la web que importa `@atlas/adapters/sync`; un `setInterval` y un oyente de `"online"`; el barril que reexporta `sync.ts`; el cliente de la web que alcanza el cerrojo y el de la consola que alcanza IndexedDB; y el cliente de la web que escribe en una carpeta (el test existente, sin tocarlo, lo mata: `sync-store.ts` cae dentro de lo que mira). **11 de 11 muertos.** El del oyente **sobrevivió la primera vez**: el patrón pedía `addEventListener(` justo delante, y `addEventListener?.("online", …)` pasaba; ahora basta con nombrar el literal `"online"`, `ononline` o `visibilitychange`.
- **La sincronización en el arranque para el *build***: con `import { SYNC_ENGINE } from "@atlas/domain/sync"` en `main.tsx`, `check-bundle.mjs` para con «es de arranque y trae la sincronización del libro: /packages/domain/src/sync/reapply.ts». El primer intento falló por otra razón (el alias de Vite no existía): se añadieron los alias y se repitió.

### 10.4 Bloque 3 — el núcleo puro (2026-09-25)

- **Dónde**: `packages/domain/src/sync/` detrás de `@atlas/domain/sync`: `lines`, `marker` (con `syncConfigured`, D-Q6), `seal` (la clasificación cerrada de los 26 tipos), `units` (línea, pareja, cadena = toda secuencia contigua de dos o más parejas, D-Q2), `evaluate` (la validación compartida de una unidad, como `checkCandidate`), `reapply` (**el** caso de uso: parar en la primera que falla), `remote` (la tabla de `docs/api.md` §5.2 fila a fila, la inicialización de §5.5 y los cuerpos por su forma), `client-plan` (pasos 1-3, 5 y 6 del cliente), `rewrite` (la lista cerrada de campos que reescribe `compact`), `held` (formatos de solo añadir), `resolve` (confirmar, rehacer, descartar), `permission` (las negativas) y `join` (iniciar, unirse, volver a descargar). El puerto `RemoteLedger` entrega **texto**, no bytes: el dominio no tiene decodificador UTF-8 (no hay tipos de DOM ni de Node en él) y toda línea del remoto se escribió desde una cadena, así que decodificar no pierde nada; el etag sigue siendo el de los bytes.
- **Los fallos del remoto que no son de una línea** paran con `remote_failed` y llevan el código del remoto tal cual (`details.remote_code`): cada interfaz tiene una frase **por código** (`describeRemoteFailure` en la consola, `REMOTE_FAILURES` en la web), y un test nuevo de `tests/messages.test.ts` las mantiene iguales a la lista cerrada del dominio (`REMOTE_FAILURE_CODES`, ports/remote-ledger.ts). Así `not_found` (ruta inexistente) no choca con el `not_found` del dominio (evento inexistente), que ya tenía su propia frase.
- **Rehacer y el identificador sellado**: solo hace falta para rehacer una **línea** (`recordEvent` con `id`); rehacer una pareja o una anulación vuelve a anular su objetivo, y un segundo intento tras un corte falla solo con `already_reversed`, así que no se duplica.
- **Rojo primero**: cada fichero de tests se escribió antes de dar por buena su parte y falló primero por lo que tocaba (el caso 10 falló la primera vez **por el test**: la corrección toma la posición de su raíz, así que con dos ventas del mismo día la que rompe es la otra, `member: "other"`; se cambió el caso a uno donde falla la corrección misma).
- **Mutantes** (`014-mut/b3.json`): **32 de 32 muertos**: 4a, 4b, 5a–5d, 6a–6c, 7a, 7c, 9a, 9b, 11a, V1 (validar la anulación sola), 8b (pareja como dos líneas), P1 (partir la cadena), P7 en el cliente y en el remoto, 13c, 13d, P6, V6, V17, caso 8, V15 (quitar el campo y añadir otro), 8e, V16, 14, V5 y P4.
- **Cobertura**: `packages/domain` al 100 % de líneas, ramas, funciones y sentencias. Dos ramas muertas se borraron con su invariante escrito: una renuncia nunca es miembro de una pareja (no se puede anular), y una unidad nunca está vacía.
- **Gemelos `.js`**: ninguno (`find` sobre `packages`, `apps` y `tests` fuera de `dist*/`).

### 10.5 Bloque 4 — los dos clientes (2026-09-25)

- **Qué hay**: la orquestación común de los siete pasos (`packages/adapters/src/sync/client.ts`, subruta `./sync-client`), sobre un puerto del dominio `SyncStateStore` (`ports/sync-state-store.ts`: `read` y `commit(expected, change)`), con **dos almacenes**: `FolderSyncStore` (consola, `sync/` bajo **una** toma del cerrojo con `underLock`, operaciones de fichero inyectadas) y `BrowserSyncStore` (web, claves `sync:state`, `sync:held`, `sync:discarded` del almacén `ledger`, **una** transacción `readwrite` con `durability: "strict"`, sin subir `DB_VERSION`). Las resoluciones (confirmar, descartar, rehacer en dos mitades) y desactivar, en `held-actions.ts`; ninguna proyecta el libro, así que ninguna se bloquea con el libro local inválido (D-Q1).
- **Un defecto del propio diseño, encontrado al escribir los cortes**: tras un corte **dentro** de la reescritura del libro (el archivo ya escrito, el renombrado no), la sincronización siguiente en el mismo segundo pedía **el mismo nombre de archivo** (fecha, hora y etag iguales) y paraba con `ArchiveExistsError`. Ahora el nombre admite `-2`, `-3`… como `compact`, y el cliente prueba el siguiente (hasta nueve). Lo prueba el test de ese corte.
- **Los remotos simulados** están en `packages/adapters/test/sync/simulated-remote.ts`, no en `tests/support/` como decía el plan: necesitan los adaptadores y el doble de IndexedDB, y `tests/` tiene `rootDir` propio. Para compilarlos hay un `tsconfig.test-sync.json` nuevo (DOM **y** tipos de Node, como exigen los recorridos que mezclan una consola y una web), referenciado desde `tsconfig.json`, con su salida `dist-test-sync/` en `.gitignore` y en `npm run clean`. Es configuración del repositorio, al modo de `tsconfig.test-browser.json`; lo digo por si la dirección lo quiere de otra forma.
- **Rojo primero**: los tests del almacén de la consola fallaron la primera vez por el propio test (la envoltura que registra las operaciones miraba el cerrojo de otra carpeta); arreglado, el de V9 comprueba en el registro que `sync sync/held.jsonl.tmp` y `syncDir sync` van antes del primer `open ledger.jsonl.tmp`, y que **toda** escritura de la secuencia ocurrió con nuestro cerrojo.
- **Los cuatro cortes del paso 6** (antes de lo retenido, entre lo retenido y el libro, dentro de la reescritura tras el archivo, entre el libro y el marcador): la sincronización siguiente termina con cada línea en el remoto, en el libro o retenida, la retenida fuera del libro y nada repetido.
- **Mutantes** (`014-mut/b4.json`): **9 de 9 muertos**: 10a (dar por subido con la respuesta), 10b (reescribir el libro antes de asegurar lo retenido), 12a (paso 6 sin el etag del paso 1), 12b (tomar el cerrojo dos veces), 12c (la web sin `strict`, y partida en dos transacciones), 17ter (no reintentar tras un `412`, no retener un `rejected.code`) y V4 (retener por un fallo que no es de una línea). 12d (llamar al remoto con el cerrojo tomado) no tiene mutante textual posible: el almacén no recibe el remoto; lo ata el test que falla si `ledger.lock` existe en cualquier llamada al remoto.
- **El commit `45b82e2` dejó el *build* por encima del techo total** (los mensajes nuevos); el siguiente, `chore(web)`, lo sube. Error mío de orden: el techo tenía que ir antes.

### 10.6 Bloque 5 — la predicción de la salida fiscal, escrita antes de correrla (2026-09-25)

**Predicción: no se mueve nada.** `tax` (con `--lots`, `--boxes` y `--json`), `gains`, `income`, `m720` (y `--json`), `m721` (y `--json`) y `filed` dan los mismos bytes y el mismo código de salida con y sin `sync/` al lado del libro (con marcador, retenidas y descartadas dentro), sobre `synthetic-v1` en 2026, 2027 y 2028, y sobre un libro reordenado por una sincronización de verdad entre dos consolas; y el *golden* `synthetic-v1.tax.json` no cambia. Si algo se mueve, paro y pregunto.

### 10.7 Bloque 5 — los recorridos, la propiedad y la salida fiscal (2026-09-25)

- **La salida fiscal: no se movió nada**, como decía la predicción de §10.6: `apps/cli/test/sync/fiscal.test.ts`, once órdenes por ejercicio (`tax` en sus cuatro formas, `gains`, `income`, `m720` y `m721` con y sin `--json`, y `filed renta`), sobre `synthetic-v1` en 2026, 2027 y 2028 y sobre un libro **reordenado por una sincronización de verdad** entre dos consolas (dos ventas del mismo día, la del portátil detrás de la del móvil). El *golden* no cambia (`git diff tests/fixtures` vacío). **Mutante 15** (el almacén de fichero que, con `sync/` presente, deja fuera una línea): muerto en los dos casos.
- **Los once casos de ADR-0026**, en `packages/adapters/test/sync/walks.test.ts`, con una consola y una web sobre el remoto simulado **de directorio**; cada uno acaba comprobando que el remoto carga y es válido, que cada réplica empieza por el remoto (el resto es su cola) y que ninguna línea escrita ha desaparecido. Dos casos fallaron la primera vez **por el recorrido, no por el código**: en el 4 el móvil registraba su configuración **después** de haber recibido la del portátil (no es concurrente: la había visto), y en el 5 el reloj del recorrido era anterior a la presentación (un ejercicio no está cerrado hasta su `filed_at`). Los dos se reescribieron como los cuenta la ADR. En el 7 (compactación que conserva los `id`), los bytes viejos solo quedan en el archivo: el recorrido cuenta los archivos como sitio donde está una línea; **la propiedad no los cuenta** (abajo).
- **La propiedad de «ninguna línea se pierde»** (`no-line-lost.property.test.ts`, `fast-check`, semilla 14, 120 corridas de 6 a 20 pasos): dos o tres dispositivos (consolas y una web) que registran, corrigen, anulan y venden por el caso de uso real (`recordEvent`, `correctEvent`, `reverseEvent`), resuelven y sincronizan en orden aleatorio con cortes en los cuatro huecos del paso 6, respuestas perdidas y carreras. Al final: remoto válido, **cada réplica idéntica al remoto** y todo lo escrito en el remoto, un libro, lo retenido o lo descartado. **Dos lecciones, las dos con el mutante delante**: (1) la primera versión contaba también los archivos, y así **escondía** la pérdida de una línea (toda reescritura archiva antes): los mutantes 10c y 10b sobrevivían; (2) con la distribución uniforme de pasos casi no había retenciones con corte (6 cortes en 120 corridas), y 10b seguía vivo; con los pasos ponderados hacia sincronizar y vender, muere. **Mutantes** (`b5.json`, `b5b.json`): 10c (perder la cola al asentar) muerto por la propiedad; 10b (reescribir el libro antes de lo retenido) muerto por la propiedad y por V9; lo retenido **sobrescrito** en vez de añadido, muerto por dos tests nuevos de solo añadir (consola y web).

### 10.8 Bloque 6 — negativas, copias y desactivar (2026-09-25)

- **Hecho y en la rama**:
  - `atlas compact` se niega en una carpeta sincronizada, con el marcador ilegible y con `sync/` sin marcador, **antes** de planificar o preguntar nada, con un mensaje por motivo (`RefusedError` con el literal de `compactPermission`). Con el marcador `disabled` compacta como siempre.
  - `atlas backup` copia lo retenido **aparte** (`ledger-<fecha>.held.jsonl`, el fichero entero con su historial, verificado byte a byte) solo si hay algo retenido sin resolver, y lo dice en los dos casos.
  - **V7**: la negativa vive en `checkInvalid` como **un código más de `DependentEventsError`** (`accept_invalid_while_synced`), no como una comprobación aparte: es lo que cabe en el arranque (una `ValidationError` propia costaba +31 bytes más). `RecordOptions` exige en los tipos `syncConfigured` a quien pasa `acceptInvalid: true`, y no decirlo se niega (fallo seguro). La consola lo lee de `sync/` (`folderSyncPresence`) y la web de sus claves (`browserSyncConfigured`, en el almacén de la sincronización, perezoso). Las dos interfaces lo dicen con su frase, no con la lista de dependientes ni volviendo a preguntar.
  - Desactivar y las resoluciones, en el bloque 4.
- **Mutantes** (`b6.json`): admitir `acceptInvalid` con la sincronización, negarlo sin ella, negarlo solo en el registro (la vista previa sin la negativa), compactar una carpeta sincronizada y `atlas backup` sin lo retenido: **5 de 5 muertos**.
- **Paquete**: arranque **75.838 bytes** (+135 sobre `develop` en total: +108 de las operaciones crudas y +27 de V7 con el movimiento del gzip; techo subido +5 en su propio commit, dentro del tope de +140 de D-Q7); total **272,80 KB**, techo 273,0 en su propio commit.
- **Lo que no está en la rama, y por qué: la negativa de importar (P2) y lo retenido en la exportación de la web (P3).** Están escritos y probados (`replaceLedgerText` lee el estado de la sincronización **en su misma transacción** y se niega con `import_refused_synced`; `exportLedgerAndHeld` devuelve el libro byte a byte y, aparte, lo retenido si hay algo sin resolver, y la web lo descarga como `ledger.held.jsonl`), pero **con ellos el arranque mide 75.861 bytes: +158 sobre `develop`, 18 por encima del tope de +140**. El código de P2 y P3 es perezoso; lo que crece es **la tabla de fragmentos de la entrada** (+16 a +23 bytes): el dominio de la sincronización que usan la importación y la lectura de V7 queda en un fragmento compartido entre dos fragmentos perezosos, y la entrada lo nombra en la lista de precargas de cada pantalla que escribe. Probé cuatro formas (lectura de V7 junto a la importación, importación dinámica, constantes repetidas, lectura en el almacén de la sincronización); ninguna baja de +154. **Paro aquí, como manda D-Q7**, y guardo el parche fuera de la rama (en mi *scratchpad*: `014-p2p3-web.patch` y su test `014-transfer-sync.test.ts`), listo para aplicarlo en cuanto la dirección decida (ver §11, Q17).

## 11. Preguntas nuevas a la dirección (2026-09-25)

- **Q17 — El arranque con P2 y P3 de la web.** Con la negativa de importar y lo retenido en la exportación, el arranque mide **75.861 bytes, +158 sobre `develop`**, 18 por encima del tope de +140 de D-Q7. Opciones que veo, sin elegir: (a) subir el tope a +160 (los 18 bytes son de la tabla de precargas de la entrada, no de código en el arranque); (b) aceptar que P2 y P3 de la web se hagan en la 015, junto con el botón de desactivar, cuando la pantalla de la sincronización ya cargue su propio fragmento y el coste de la tabla se reparta; (c) otra forma que la dirección vea. La consola (compact, backup) y la negativa de V7 ya están.
- **Q18 — El remedio de `raw_line_break`** (§10.2): `atlas compact` no reescribe un libro v1 con finales de Windows (es no-op si nada está por debajo de la versión actual). El mensaje dice hoy que se pase el fichero a finales LF. ¿Vale así, o quieres una salida de verdad (que `compact` también reescriba líneas que no están en su forma canónica), que cambia el contrato (2) de `compact`?
- **Q19 — Los temporales de `sync/`.** Un corte deja `sync/state.json.tmp-…` o `sync/held.jsonl.tmp-…`; el barrido de temporales huérfanos al arrancar cada orden (`sweepOrphanTemporaries`) solo mira los del libro. No se pierde nada (el fichero bueno sigue en su sitio), pero quedan ficheros sueltos. ¿Lo amplío a `sync/` en esta feature o en la 015, con las órdenes?

## 12. Respuestas de la dirección a §11 (2026-09-25)

- **D-Q17: P2 y P3 de la web pasan a la 015**, sin subir el tope. *Motivo*: en la 014 la sincronización no se puede configurar en producción (V7 la deja inerte), así que en la web todavía no protegen nada; los presupuesta la feature que permita activarla. **Requisito duro: la 015 no puede permitir configurar la sincronización en la web sin P2 y P3 dentro.** El parche y su test están en la rama, en `deferred/` (con su `README.md`). En la consola se quedan.
- **D-Q18: el contrato de `compact` no cambia.** El mensaje de `raw_line_break` da **la orden exacta**: un `node -e` que copia antes el libro a `ledger.jsonl.crlf` (se niega si la copia ya existe) y reescribe `\r\n` como `\n`, y después pide volver a sincronizar. Hecho: `RAW_LINE_BREAK_FIX` en `apps/cli/src/output/messages.ts`; la web remite a esa orden. El test la **ejecuta a través de un shell** sobre un libro con finales de Windows: convierte, deja la copia y no la sobrescribe en un segundo intento. Mutante (copiar sin `COPYFILE_EXCL`): muerto.
- **D-Q19: el barrido de temporales huérfanos incluye `sync/`** (`state.json`, `held.jsonl` y `discarded.jsonl` con `.tmp-<pid>-<hora>`), con el mismo criterio que el del libro: solo sin cerrojo vivo. Test y dos mutantes (no barrer `sync/`; barrer un fichero bueno): muertos.

**Documentos** (se añade a §6): el prompt de la 015 recoge P2 y P3 de la web como requisito duro para permitir configurar la sincronización en la web, con `deferred/p2-p3-web.patch` como punto de partida; `docs/data-schema.md` §1, que el barrido de temporales alcanza `sync/`.

## 13. Revisión del PR #83 (2026-09-25)

Cada arreglo, cómo se vio en rojo y qué mutante lo guarda. Los mutantes se aplican uno a uno con una sola sustitución comprobada; el fichero se restaura después y, si hay gemelos `.js`, no se ejecuta nada (`014-mut/mutate-014.mjs`, lotes `b8.json`, `b9.json` y `b10.json`).

- **B1 — primero el destino, después el origen.** `FolderSyncStore.commit` separa los registros de lo retenido. Los que **ganan** una línea se escriben primero; después, `discarded.jsonl`, el libro, los que la **liberan** (`resolved`) y el marcador. Confirmar escribe el libro antes de dar la línea por resuelta. Descartar y rehacer escriben `discarded.jsonl` antes de darla por resuelta. En la web, la transacción única ya lo daba.
  - **Rojo primero:** `resolution-cuts.test.ts` corta confirmar, descartar y terminar de rehacer en cada escritura y repite la orden. Contra el orden fijo antiguo fallaron 5; con el arreglo pasan 18.
  - **Por qué se puede repetir:** `confirmHeld` y las acciones son idempotentes. No vuelven a insertar una línea que ya está en el libro, ni duplican un descartado o una confirmación.
  - **Mutante del orden fijo antiguo:** todo lo retenido primero (`const gained = held;`). Muerto por los cortes y por la propiedad.
- **B2 — `finishRedo` saca solo las parejas rehechas.** `redoneLines(unit, events, ledger)` devuelve las líneas de las partes cuyo rehacer está en el libro. `assertRedoRecorded` se niega con `redo_not_recorded` si no hay ninguna. El resto de la cadena sigue retenida.
  - Test en el dominio (`held-resolve.test.ts`) y otro en el adaptador: una cadena de dos parejas, rehecha solo la primera.
  - **Mutantes muertos:** «terminar toda la cadena» (`return part.lines;`) y «terminar sin rehacer» (`assertRedoRecorded` que no se niega).
- **No bloqueante 1 — la propiedad ya ve B1.**
  - **Lo que hace ahora:** los dispositivos confirman, descartan y rehacen lo retenido, con un corte opcional en cada escritura de una resolución. Solo cuentan como conservadas las líneas retenidas sin resolver, no las archivadas ni las ya resueltas.
  - **Primera versión, todavía verde con B1 deshecho.** Instrumentada, solo llegaban a resolverse **4 unidades en 120 corridas**: casi nunca había nada retenido.
  - **Segunda versión:** empieza con un preludio en el que cada dispositivo vende 6 de los 10 y la web sincroniza primero. Así cada consola empieza con una venta retenida. La resolución elige, a partir del dispositivo sorteado, el primero que tiene algo retenido. Con eso llegan a resolverse 224 unidades y 48 cortes caen dentro de una resolución.
  - **Con B1 deshecho, roja:** una venta descartada con el corte en `discarded.jsonl.tmp` desaparece. Con el arreglo, verde.
  - **Límite que queda:** en la propiedad, los cortes caen al descartar. Confirmar y rehacer se cortan en `resolution-cuts.test.ts`, porque a una venta que no cabe no se le ofrece confirmar, y su rehacer se niega en local.
- **No bloqueantes 2 a 7 y 9.** Los arreglos están en `5b4b2ee`, `d52c965`, `46defbc` y `66600d8`. Cada uno tiene su test en rojo primero.
  - desactivar con el marcador ausente se niega (`deactivate_refused_marker_missing`);
  - `syncDevice` exige que la sincronización esté configurada (`sync_not_configured`, `sync_deactivated`);
  - el cliente se para con `remote_empty` si nunca sincronizó, el remoto está vacío y el libro no;
  - volver a descargar agrupa las parejas en unidades enteras;
  - la fila 3 de §5.2 se comprueba antes de decodificar;
  - un único lector del marcador;
  - el nombre del archivo, validado en la web;
  - el mensaje del barrido distingue los temporales de `sync/`;
  - la frase web de `raw_line_break`.
  
  **Mutantes de la revisión** (`b8.json`): M5, M12 y M26, los tres muertos.
- **No bloqueante 8 — margen del paquete.**
  - **Arranque:** mide **75.849**. El fragmento del dominio está igual (41.482). La entrada pasó de 24.073 a 24.079 solo porque la tabla de fragmentos perezosos nombra hashes nuevos. **Techo 75.869 = lo medido + 20 de margen de ruido de esa tabla, no crecimiento**, en su propio commit. El código de la 014 sigue sumando +135 al arranque, dentro del tope de +140 de D-Q7.
  - **Total:** mide **273,34 KB** (279.905 bytes). Techo **273,5**, en su propio commit.
    - La causa, comparando fragmento a fragmento con la cabeza anterior a la revisión: `errors` +248 (las frases de los códigos nuevos), `write` +293 (la validación del nombre del archivo y el lector compartido del marcador en el almacén de la sincronización).
    - El resto es ruido de hashes. Todo es perezoso.
  - Sin esto, el *build* de esta rama fallaba.
- **Tubería completa:** `lint`, `typecheck`, `test:coverage` (265 ficheros, 2.602 tests, 100 % en `domain`) y `build`, en verde. Sin gemelos `.js`.

## 14. Segunda revisión del PR #83 (2026-09-25)

- **R1: terminar un rehacer solo con los identificadores sellados.**
  - **Qué se sella:** antes de registrar nada, `startRedo` sella un `event_id` por cada línea de la parte que se rehace:
    - el evento nuevo, si es una línea;
    - la anulación y la corrección, si es una pareja;
    - la anulación, si es una anulación suelta.
  - **Se sella una sola vez:** si se vuelve a empezar, devuelve los mismos identificadores y no sella otros hasta que esa parte termine.
  - **Qué cuenta como rehecho:** `redoneLines` solo da por rehecha una parte si todos sus identificadores sellados están en el libro, y nunca lo deduce por el objetivo.
  - **Qué queda anotado:** cada línea pasa a `discarded.jsonl` con el identificador que la sustituyó (`replaced_by`).
  - **Cómo llegan los identificadores a los casos de uso:**
    - una corrección los recibe en `correctEvent`, mediante la opción `ids` (con `sealedIds(plan)`);
    - una línea o una anulación suelta se registra con `recordEvent`, con su borrador y su `id`.
    - `reverseEvent` no recibe ningún identificador: dárselo costaba +25 bytes en el arranque, por encima del tope.
  - **Rojo primero:** con el caso 3 tal cual, `finishRedo` terminaba sin que se hubiera registrado nada (`promise resolved instead of rejecting`).
  - **Mutantes muertos** (`b13.json`):
    - volver a deducir por el objetivo, que mata la propiedad y los tests de unidad;
    - que baste la mitad de una pareja;
    - la anulación sin su identificador sellado;
    - una corrección que ignora los `ids`.
- **Error del propio encargo, encontrado al escribir el test del caso 3.** El plan de rehacer una pareja corregía **el objetivo original**, que el otro dispositivo ya había anulado; registrarlo habría fallado siempre. Ahora corrige **la versión en vigor**: sigue la cadena de correcciones del libro local (`inForce`). El mutante que vuelve al objetivo original muere.
  - **Límite que queda:** si el objetivo está anulado sin corrección (borrado), el plan lo sigue nombrando, y registrar lo niega con su error. Solo queda descartar.
  - **Otro límite:** en una cadena cuya segunda pareja corrige la corrección retenida de la primera, esa segunda apunta a un evento que no llegó a estar en el libro.
- **La propiedad, ahora:**
  - **Preludio:** la web registra un depósito que todos reciben; después cada dispositivo vende y corrige ese depósito, que es el caso 3 con una venta retenida.
  - **La resolución:** elige la unidad retenida al azar. Un rehacer puede quedarse sin registrar y, entonces, terminarlo tiene que negarse.
  - **Criterio:** una línea en `discarded.jsonl` con el motivo `redone` solo cuenta como conservada si su identificador sellado está en el remoto, o en una línea que el usuario descartó.
  - **Semillas:** corre con 14, 83, 2026 y 4242, 60 corridas cada una.
  - **Con R1 deshecho, roja; con el arreglo, verde.**
- **Los tres restos:**
  - **Rehacer una corrección cuya anulación se descartó ya no se ofrece.** Se niega con `redo_partner_discarded`, y las frases de `partner_discarded` explican que una corrección sin su anulación no corrige nada. El mutante muere.
  - **`sync/` sin marcador y con libro propio no se fusiona.** `inspect` se para con `join_required` (`own_lines`) cuando no hay marcador y la cola tiene líneas que el remoto no tiene y no están retenidas.
    - Se prueba en el dominio y en la consola, donde no se toca ni el remoto ni el libro.
    - Sin líneas propias, reconstruir el marcador sigue funcionando.
    - Estaba en rojo primero, y el mutante muere.
  - **`discarded.jsonl` registra decisiones, no bytes.**
    - Cada registro lleva `decision`: el hash de la resolución, la unidad, la hora en que se retuvo y la línea.
    - Repetir la misma decisión no se duplica; los mismos bytes retenidos otra vez y descartados otra vez sí se anotan.
    - El mutante que deduplica por la línea muere.
- **Arranque:** mide **75.837 bytes** (techo 75.869).
  - El trozo del dominio suma +5 (41.487) por la opción `ids` de `correctEvent`, así que el código de la 014 queda en **+140, justo el tope**.
  - El comentario del techo recoge que los 6 bytes de ruido de la tabla están aceptados.
  - Total: 273,4 KB (techo 273,5).
- **Tubería:** `lint`, `typecheck`, `test:coverage` (265 ficheros, 2.615 tests, 100 % en `domain`) y `build`, en verde. Sin gemelos `.js`.
  - Un test web ajeno (`prices.test.tsx`, «cannot check the currency of prices imported without symbols.json») falló una vez con la máquina cargada y pasó en tres repeticiones seguidas: parece dependiente del tiempo.
- **Documentos** (se añade a §6):
  - `docs/data-schema.md` §1:
    - `redo_started` va por línea (el de la anulación y el de la corrección);
    - el campo `decision` de `discarded.jsonl`;
    - `join_required`.
  - `docs/api.md`, o la parte del cliente: se para con `join_required` si no hay marcador y hay líneas propias.

## 15. Tercera instrucción de la dirección: las cadenas encadenadas (2026-09-25)

- **Decisión aplicada.** El plan de una cadena traduce los identificadores dentro de la unidad.
  - **Qué se anota:** al terminar una pareja, cada registro `resolved` con `resolution: "redone"` lleva `replaces`, el `id` del evento retenido al que sustituye, además de `event_id`.
  - **Dónde queda la traducción:** `unresolvedHeld` expone en la unidad `redone`, que va del `id` retenido al `id` con que se rehízo.
  - **Qué se corrige:** una pareja posterior que corrige la corrección retenida de una anterior corrige el identificador sellado de esa anterior.
  - **Si la anterior sigue retenida, la posterior espera:** se niega con `redo_waits_for_pair` (`pair: N`, «Primero la pareja N») antes de sellar nada.
  - Con el orden local de la unidad, la primera pareja retenida nunca depende de otra posterior. La espera es la guarda que impide ofrecer algo que va a fallar, y se prueba con una cadena desordenada.
- **Rojo primero:** con una cadena de dos parejas encadenadas, la segunda apuntaba a la corrección retenida, y `correctEvent` fallaba con `NotFoundError`. Ahora la cadena se rehace entera por el caso de uso, y en `discarded.jsonl` quedan los cuatro identificadores sellados.
- **Mutantes muertos** (`b14.json`):
  - quitar la traducción;
  - no esperar nunca;
  - terminar sin `replaces`.
- **El objetivo borrado sin corrección se queda como está:** solo queda descartar, y registrar lo niega con su error.
- **Rehacer una anulación suelta** con `recordEvent` y su identificador sellado: aceptado por la dirección.
- **Tubería:**
  - `lint`, `typecheck`, `test:coverage` (2.619 tests, 100 % en `domain`) y `build`, en verde. Sin gemelos `.js`.
  - Arranque: 75.843, techo 75.869; el trozo del dominio está igual.
  - Total: 280.039 bytes, techo 280.064, con 25 bytes de margen.
- **Documentos** (se añade a §6): `docs/data-schema.md` §1, el campo `replaces` de los registros `resolved` de `held.jsonl`.

## 16. Revisión de la PR #84, el cierre documental (2026-09-25)

- **D-Q1 no se cumple entera.** La nota del cierre en ADR-0026 decía que confirmar, rehacer y descartar nunca se bloquean por el libro local inválido. Confirmar, descartar, `startRedo` y `finishRedo` no proyectan y no se bloquean. Pero rehacer exige registrar lo rehecho entre `startRedo` y `finishRedo`:
  - **`recordEvent`**, que rehace una línea o una anulación suelta, se niega con `InvalidLedgerError` mientras el libro local tenga eventos inválidos ajenos (`checkInvalid`, `packages/domain/src/usecases/record-event.ts`, la rama que busca un inválido `preexisting`).
  - **`correctEvent`**, que rehace una pareja, no se niega por los inválidos que ya había, solo por los que deja la corrección (`checkCandidate`, `packages/domain/src/usecases/rectify.ts`).
  - *Escenario del revisor:* retenida la pareja que corrige una compra de 10 a 20, el libro local se queda con la compra de 10 y la venta de 15 (caso 11), que es inválida. Un `account_updated` retenido por `concurrent_account` no se puede rehacer hasta resolver la pareja.
  - **Decisión de la dirección:** sin cambios de código en la 014. La nota de ADR-0026 dice ahora la verdad, y pasa a lo heredado por la 015: **decidir si rehacer debe permitirse con el libro inválido por una pareja retenida.**
- **D-Q6, enmienda:** ver §8.

