# Contrato del almacenamiento en el navegador — feature `006-web-shell`

Implementa ADR-0019 con el puerto `LedgerStore` que ya existe (`packages/domain/src/ports/ledger-store.ts`) y **con el contrato de puerto ya escrito** (`packages/adapters/test/ledger-store.contract.ts`), el mismo que cumplen el almacén de memoria y el de fichero.

## 1. `LedgerBlob`: la interfaz mínima de bytes

```ts
/** Acceso a los bytes del libro y a sus archivos. Lo único que cambia entre el disco y el navegador. */
export interface LedgerBlob {
  /** Descripción para la interfaz: "ledger.jsonl en Cartera" o "almacenamiento del navegador". */
  readonly label: string;
  /** Bytes actuales; vacío si el libro aún no existe. */
  read(): Promise<Uint8Array>;
  /** Sustituye el contenido por estos bytes, de forma atómica cuando el medio lo permite. */
  write(bytes: Uint8Array): Promise<void>;
  /** Escribe un archivo con ese nombre; falla con ArchiveExistsError si ya existe. */
  writeArchive(name: string, bytes: Uint8Array): Promise<void>;
}
```

Tres métodos, ningún concepto de evento ni de esquema: es deliberado. Todo lo que el contrato de puerto exige vive por encima, en un solo sitio.

## 2. `BlobLedgerStore`: el adaptador

```ts
export class BlobLedgerStore implements LedgerStore {
  constructor(blob: LedgerBlob, schema?: LedgerSchema);
  readonly schema: LedgerSchema;
  load(): Promise<LoadedLedger>;
  append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }>;
  replace(events: readonly LedgerEvent[], etag: string, archiveName: string): Promise<{ etag: string }>;
}
```

Garantías, una a una las del contrato y las de `docs/data-schema.md` §5:

1. **`load`** decodifica cada línea con `decodeLine(line, schema)`; una línea con `schema_version` mayor aborta la carga entera con `SchemaTooNewError`; un error de validación se re-lanza indicando el **número de línea**, como hace `FileLedgerStore`. Devuelve `{ events, etag, lines }` con `lines.length === events.length`.
2. **`etag`** = `sha256Hex(bytes)`, usando el SHA-256 **puro del dominio** (`packages/domain/src/ids/sha256.ts`): sin WebCrypto (que es asíncrono y no aporta nada aquí) y sin `node:crypto`, de modo que el mismo código vale en las dos plataformas. Dos cargas seguidas sin escrituras devuelven el mismo etag.
3. **`append`** lee los bytes, comprueba el etag (si no coincide, `ConflictError` y **no escribe nada**), añade `\n` si el contenido no terminaba en salto de línea, concatena las líneas nuevas serializadas con `encodeLine` y escribe. **Nunca re-serializa lo anterior**: los bytes previos viajan intactos.
4. **`replace`** valida el nombre del archivo (nombre simple, sin separadores de ruta), comprueba el etag, escribe **primero** el archivo con los bytes originales (`ArchiveExistsError` si ya existe, sin tocar el libro) y solo después reemplaza el contenido por la serialización canónica.
5. Nada de esto importa `node:*` ni toca el DOM: `BlobLedgerStore` vive en `packages/adapters/src/ledger-store/blob.ts`, dentro del proyecto de TypeScript que ya existe.

**Tests**: `packages/adapters/test/blob.test.ts` ejecuta `ledgerStoreContract("blob", …)` con un `MemoryBlob` (implementación de `LedgerBlob` sobre un `Uint8Array` y un mapa de archivos). El adaptador del navegador entra, por tanto, con el **mismo** nivel de prueba que el de fichero, sin necesidad de un navegador.

## 3. Los dos *handles* reales

Viven en `packages/adapters/src/ledger-store/browser/`, compilados por `tsconfig.browser.json` (`lib: ["ES2022","DOM"]`, sin `@types/node`) y exportados por la subruta `@atlas/adapters/browser`. Son las únicas piezas que no se pueden probar en Node; por eso son deliberadamente finas y se verifican a mano (criterio §5 del prompt).

### 3.1 `DirectoryLedgerBlob` (File System Access API)

- Se obtiene con `showDirectoryPicker({ mode: "readwrite" })` — **carpeta, no fichero** (decisión D4 del plan, Q5): sin directorio no hay `archive/` y `replace` sería imposible.
- `read()`: `getFileHandle("ledger.jsonl")` → `getFile()` → `arrayBuffer()`. Si el fichero no existe, devuelve vacío (libro nuevo), igual que `FileLedgerStore`.
- `write()`: `createWritable()` sobre el mismo *handle*; el navegador escribe a un fichero temporal y lo mueve al cerrar, que es la atomicidad que `FileLedgerStore` consigue con `rename`.
- `writeArchive(name, bytes)`: `getDirectoryHandle("archive", { create: true })` y `getFileHandle(name, { create: true })`, comprobando antes su existencia para lanzar `ArchiveExistsError`. Misma disposición que la CLI: `archive/` junto al libro.
- El *handle* de la carpeta se guarda en IndexedDB (`handles/directory`) porque es serializable. El **permiso no sobrevive** al cierre de todas las pestañas: al arrancar se consulta `queryPermission({ mode: "readwrite" })` y, si no está concedido, la interfaz ofrece "Reconectar", que llama a `requestPermission` **dentro del gesto** del usuario (`research.md` §4).
- Disponible solo donde existe la API: Chrome y Edge de escritorio. En el resto, la vía no se ofrece (se detecta con `"showDirectoryPicker" in window`).

### 3.2 `BrowserLedgerBlob` (IndexedDB)

- Base `atlas` v1, almacén `ledger`; el libro es el registro `current` con `{ text, updatedAt, lastExportAt? }`; cada archivo es un registro `archive/<nombre>`.
- `read()`/`write()` convierten entre texto y bytes con `TextEncoder`/`TextDecoder` (ambos estándar en navegador).
- `writeArchive` usa `add` (no `put`) para que un archivo existente falle, y se traduce a `ArchiveExistsError`.
- Al adoptar esta vía se solicita `navigator.storage.persist()` y se informa del resultado (Baseline desde 2021, `research.md` §4). **Nunca se presenta como almacén definitivo** (ADR-0019).
- Importación: `<input type="file" accept=".jsonl,application/x-ndjson">` → se valida cargando con `BlobLedgerStore.load()` **antes** de sustituir nada; si la carga falla, el libro anterior sigue intacto.
- Exportación: `Blob` con el texto **tal cual** y un `<a download="ledger.jsonl">`; después se actualiza `lastExportAt`. El fichero exportado es byte a byte el contenido almacenado (FR-013).

## 4. Composición (quién crea qué)

`apps/web/src/ledger/store.ts` es el **único** fichero de la web que conoce los adaptadores:

```ts
const store = new BlobLedgerStore(blob);            // blob: Directory… | Browser…
const deps: UseCaseDeps = { store, clock: systemClock, random: webCryptoRandom };
```

`systemClock` y `webCryptoRandom` ya existen en `packages/adapters` y **no** tocan Node (comprobado: `webCryptoRandom` usa el `crypto.getRandomValues` global y `systemClock`, `new Date()`). El barril `@atlas/adapters` **sí** contiene `FileLedgerStore` y por tanto `node:fs`, así que `packages/adapters/package.json` gana cuatro subrutas —`./blob`, `./browser`, `./clock` y `./random`— y la web importa **solo** por ellas (FR-014). Una regla de arquitectura nueva prohíbe importar `@atlas/adapters` a secas desde `apps/web`, y la comprobación del *bundle* lo verifica sobre el resultado del `build`, no sobre la intención.

## 5. Concurrencia y conflicto

- Toda escritura pasa por `recordEvent`/`reverseEvent`/`correctEvent` del dominio, que cargan, proyectan con el candidato y llaman a `append` con el etag de **esa** carga.
- Si el fichero cambió por fuera (la CLI escribió, u otra pestaña), el etag no coincide y el adaptador lanza `ConflictError` **sin escribir**. La interfaz lo dice, recarga el libro y vuelve a ofrecer la vista previa sobre el estado nuevo. No existe ninguna opción de "escribir de todas formas".
- La aplicación no vigila el fichero en segundo plano: el conflicto se detecta al escribir, que es cuando importa. (Un `File.lastModified` periódico sería ruido y mentiría en la vía de IndexedDB.)
