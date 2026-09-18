# Modelo de datos — feature `006-web-shell`

Esta feature **no cambia el esquema del libro**: cero tipos de evento nuevos, cero campos nuevos, `schema_version` sigue en 1 y el *golden* no se regenera (`docs/data-schema.md` §5, ADR-0018). Todo lo que sigue es **estado de la aplicación** (en memoria), **preferencias del dispositivo** y **registros de almacenamiento del navegador**. Identificadores en inglés; nada de esto se persiste dentro del libro.

## 1. De dónde sale el libro: `LedgerSource`

```ts
type LedgerSourceKind = "directory" | "browser";

interface DirectorySource {
  kind: "directory";
  /** Nombre de la carpeta elegida, para mostrarlo. */
  directoryName: string;
  /** Nombre del fichero dentro de ella; siempre "ledger.jsonl". */
  fileName: string;
  /** Estado del permiso en este instante. */
  permission: "granted" | "prompt" | "denied";
}

interface BrowserSource {
  kind: "browser";
  /** Fecha de la última exportación; ausente si nunca se exportó. */
  lastExportAt?: IsoInstant;
  /** Resultado de navigator.storage.persist(). */
  persisted: boolean;
}

type LedgerSource = DirectorySource | BrowserSource;
```

`LedgerSource` es exactamente lo que el chip de la cabecera muestra (FR-011, FR-012) y lo que decide qué *handle* se compone. No guarda datos del libro.

## 2. El libro cargado: `LedgerSnapshot`

```ts
interface LedgerSnapshot {
  /** Eventos migrados en memoria, en orden de fichero. */
  events: readonly LedgerEvent[];
  /** Líneas crudas, entrada de la comprobación profunda. */
  lines: readonly string[];
  /** Control de concurrencia de la próxima escritura. */
  etag: string;
  /** Proyección base: sin asOf y con collectErrors (ADR-0015). */
  state: LedgerState;
  /** Instante de la carga, para "cargado hace N minutos" y para el reintento. */
  loadedAt: IsoInstant;
}
```

Un único `LedgerSnapshot` vivo. Se sustituye entero al abrir un libro y después de cada escritura; nunca se muta.

## 3. Estado de la aplicación

```ts
type LoadPhase =
  | { phase: "unconfigured" }                      // primer arranque: no hay libro elegido
  | { phase: "reconnect"; source: DirectorySource } // hay carpeta recordada, falta el gesto
  | { phase: "loading"; source: LedgerSource }
  | { phase: "ready"; source: LedgerSource; snapshot: LedgerSnapshot }
  | { phase: "failed"; source?: LedgerSource; error: AppError };

interface AppError {
  /** `code` del dominio cuando viene de él; un código propio de la web si no. */
  code: string;
  /** Texto en español ya resuelto por format/messages. */
  message: string;
  /** Línea del fichero cuando el error la trae. */
  line?: number;
  /** Qué puede hacer el usuario, con su destino. */
  action?: { label: string; to: string };
}
```

Señales del *store* (`src/ledger/state.ts`), expuestas por contexto:

| Señal / memo | Tipo | Notas |
|---|---|---|
| `load` | `LoadPhase` | Máquina de estados de la carga; cada fase tiene su pantalla (FR-019) |
| `snapshot` | `LedgerSnapshot \| undefined` | Atajo de `load.phase === "ready"` |
| `today` | `CivilDate` | Hoy en Europe/Madrid, del reloj del sistema |
| `projectionAt(date)` | `LedgerState` | **Memo por fecha**: proyecta con `asOf` (ADR-0016) y se cachea; se vacía al recargar (D7) |
| `invalidCount` | `number` | `snapshot.state.invalid.length`: alimenta la cabecera permanente y bloquea la escritura (FR-018) |
| `privacy` | `boolean` | Por defecto **true**; se recuerda en el dispositivo. Enmascara importes **y cantidades** (Q6, FR-022) |
| `theme` | `"system" \| "light" \| "dark"` | `data-theme` en `<html>` |
| `writing` | `boolean` | Deshabilita los botones de confirmar mientras se escribe |

**Regla**: ninguna pantalla proyecta por su cuenta. Lee `snapshot.state` (el libro entero) o `projectionAt(date)` (la foto de una fecha). Toda vista que reciba una fecha usa la segunda y, además, filtra las tesis por su fecha administrativa (`docs/data-schema.md` §7.1, ADR-0016).

## 4. Preferencias del dispositivo

`localStorage`, con prefijo `atlas.` y lectura tolerante (si falta o está corrupto, se usa el valor por defecto):

| Clave | Valor | Por defecto |
|---|---|---|
| `atlas.privacy` | `"on" \| "off"` | `"on"` (activado) |
| `atlas.theme` | `"system" \| "light" \| "dark"` | `"system"` |
| `atlas.source` | `"directory" \| "browser"` | ausente (primer arranque) |

Nada financiero vive aquí: ni importes, ni identificadores de cuenta, ni el propio libro.

## 5. Almacenamiento del navegador (IndexedDB)

Una base `atlas`, versión 1, con dos almacenes:

| Almacén | Clave | Valor |
|---|---|---|
| `ledger` | `"current"` | `{ text: string, updatedAt: IsoInstant, lastExportAt?: IsoInstant }` — el libro tal cual, **texto completo y literal** |
| `ledger` | `"archive/<nombre>"` | `{ text: string, createdAt: IsoInstant }` — lo que escribe `replace`; nunca se sobrescribe |
| `handles` | `"directory"` | El `FileSystemDirectoryHandle` serializado (solo en la vía del fichero) |

El libro se guarda como **texto**, no como eventos: es lo que permite que `append` conserve los bytes anteriores y que la exportación sea byte a byte (FR-013, contrato del puerto). `lastExportAt` vive junto al libro porque es una propiedad de *ese* libro, no del dispositivo.

## 6. Modelos de vista (`src/view-models/`)

Funciones puras, sin JSX, que traducen lo que devuelve el dominio en lo que se pinta. Son la parte probada de la presentación (D16).

### 6.1 `AttentionItem` — lo que reclama atención

```ts
type AttentionSeverity = "error" | "warning" | "info";

interface AttentionItem {
  /** `code` del dominio (o "invalid_events" para la degradación). */
  code: string;
  severity: AttentionSeverity;
  /** Texto en español, ya resuelto. */
  message: string;
  /** Dónde se arregla. */
  action: { label: string; to: string };
  /** Orden dentro de su severidad, para que el orden sea estable. */
  rank: number;
}
```

Orden por importancia (presentación, no regla de negocio; el dominio no ordena avisos):

1. `invalid_events` — el libro está degradado y no se puede registrar (ADR-0015).
2. Hallazgos de `integrity` de nivel `error`.
3. `bucket_stop_loss_reached` y `bucket_contribution_exceeded` — reglas de conducta superadas (reglas 17 y 19).
4. `deviation_above_threshold`, `satellite_below_minimum`, `bucket_weight_exceeded` — el plan pide una decisión.
5. `wash_sale_window_repurchase`, `wash_sale_window_prior_buy` — coste fiscal ya incurrido, informativo.
6. Órdenes y traspasos pendientes (de `pendingOrders` y `pendingTransfers`).
7. `stale_price`, `stale_fx_rate`, `partial_*`, `missing_*` — falta un dato para poder calcular.
8. Exportación pendiente (solo en la vía del navegador, propio de la web).

Cada código lleva su destino escrito (por ejemplo `stale_price` → `/registrar/valuation`, `deviation_above_threshold` → `/nucleo`, `invalid_events` → `/ajustes/verificacion`), y el test comprueba que **todo** código mostrable tiene destino (SC-008).

### 6.2 `MovementRow` — una línea del libro

```ts
interface MovementRow {
  id: Ulid;
  /** Posición en el fichero: desempate y enlace con la proyección. */
  position: number;
  type: SupportedEvent["type"] | string;
  /** Etiqueta en español del tipo ("Compra", "Valoración"…). */
  typeLabel: string;
  /** Fecha de negocio que el dominio resuelve; ausente en catálogo, configuración, tesis y anulaciones. */
  businessDate?: CivilDate;
  /** Fecha administrativa, para los eventos sin fecha de negocio. */
  recordedDate: CivilDate;
  status: "current" | "reversed" | "reversal" | "correction";
  /** Cuenta y activo cuando el evento los tiene. */
  accountId?: AccountId;
  assetId?: AssetId;
  /** Importe principal ya elegido por tipo de evento, para pintarlo con Amount. */
  amount?: Money;
  /** Cantidad cuando aplica. */
  quantity?: Quantity;
  /** Motivo si el evento es inválido en la proyección degradada. */
  invalidReason?: string;
  links: { orderId?: Ulid; requestId?: Ulid; thesisId?: string; reversesId?: Ulid; correctsId?: Ulid };
}
```

El **orden** y el **estado** los da el dominio (proyección `ledgerEntries`, decisión (h)); la web elige qué importe es "el principal" por tipo, formatea y pagina. Filtros (tipo, cuenta, activo, rango de fechas, texto) se aplican en el dominio para que sean comprobables al 100 % y para que la paginación no dependa del orden en que se pinten las filas.

### 6.3 `EventFormSpec` — un formulario descrito como datos

```ts
type FieldKind = "decimal" | "integer" | "date" | "text" | "textarea" | "select" | "datalist" | "switch";

interface FieldSpec {
  /** Nombre del campo del evento, tal cual va al libro (snake_case). */
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  /** Ayuda de una línea: qué es y de dónde se copia. */
  hint?: string;
  /** Valor inicial (por ejemplo fee "0", source "manual", fx_rate "1" en euros). */
  initial?: string;
  /** Origen de las opciones para select/datalist. */
  options?: "accounts" | "assets" | "currencies" | "openOrders" | "openTheses" | "books" | "assetTypes" | "assetClasses" | "sides";
  /** Se muestra solo si otro campo cumple una condición (p. ej. fx_rate si currency ≠ EUR). */
  visibleWhen?: { field: string; notEquals?: string; equals?: string };
  /** Atributos de teclado móvil: inputmode y enterkeyhint. */
  inputMode?: "decimal" | "numeric" | "text";
}

interface EventFormSpec {
  type: SupportedEvent["type"];
  /** Título y una línea de cuándo se usa, para la pantalla /registrar. */
  title: string;
  when: string;
  fields: FieldSpec[];
  /** Campos que el esquema define y este formulario omite a propósito, con su motivo. */
  omitted: { name: string; reason: string }[];
}
```

Nueve especificaciones: `buy`, `sell`, `cash_deposit`, `cash_withdrawal`, `dividend`, `valuation`, `order_placed`, `account_created`/`account_updated` y `asset_created`/`asset_updated`. Un test compara `fields ∪ omitted` con `knownFieldsOf(type)` del dominio menos el sobre (`schema_version`, `id`, `recorded_at`, `fingerprint`, `corrects_id`): si el esquema gana un campo, el test lo dice (FR-048).

### 6.4 `PreviewView` — la vista previa de lo que se va a escribir

Envuelve lo que devuelve el caso de uso del dominio (`previewEvent`, decisión (h)): el evento completado, las posiciones y lotes antes/después de los activos afectados, las ganancias que el evento generaría y sus avisos. La web solo decide la presentación: dos columnas en escritorio, dos bloques apilados en móvil, importes por `Amount`, y el botón de confirmar deshabilitado mientras haya un error del dominio.

### 6.5 `NetWorthView` — el patrimonio en filas

Traduce `NetWorth` a bloques pintables (núcleo por clase, cubo por posición, efectivo por cuenta y divisa) manteniendo la regla de la CLI: **el total mostrado es la suma de las cifras mostradas** (`netWorth` ya expone el valor exacto aparte). Marca de parcialidad por bloque y lista de lo que falta, con enlace a registrar la valoración ausente.

## 7. Lo que **no** se modela aquí

- Ningún agregado persistido: todo se recalcula desde el libro (constitución I).
- Ninguna copia del libro fuera de su almacén (no hay caché de eventos en `localStorage`).
- Ninguna cola de escrituras pendientes: se escribe en el momento, con etag, y si falla se dice. Sin conexión no hace falta cola, porque el libro es local (ADR-0019).
- Ningún estado de sesión ni de usuario: no hay autenticación (ADR-0019).
