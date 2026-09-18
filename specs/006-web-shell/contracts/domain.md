# Contrato de los añadidos al dominio — feature `006-web-shell`

Decisión (c) del prompt: **ni una regla de negocio fuera de `@atlas/domain`**; si el dominio no lo expone, es una pregunta, no un cálculo en un componente. Al leer el código aparecieron tres cosas que la web necesita y que **vivían en la CLI o no existían**.

> **Aprobadas el 2026-09-18** (decisión (h) del prompt, respuestas a Q1, Q2 y Q4): las tres entran en el dominio y **la CLI pasa a consumirlas**, para que exista una sola definición. Las alternativas quedan escritas abajo solo como registro de lo que se descartó.

Todo lo que sigue es **puro** (sin E/S), entra en la API pública de `packages/domain/src/index.ts` y llega con **cobertura del 100 % de líneas y ramas** (constitución VII).

## 1. `previewEvent` — la vista previa de un candidato (Q1, aprobada)

**Hoy**: `previewCandidate` vive en `apps/cli/src/commands/shared.ts` y compone `loadAndProject` + `completeDraft` + `projectLedger`. La web necesita exactamente eso (FR-044) y duplicarlo significaría dos implementaciones de "qué pasaría si registro esto", que es precisamente lo que la decisión (c) prohíbe.

**Propuesta**: moverlo a `packages/domain/src/usecases/preview-event.ts`, con los puertos como parámetros, y que la CLI lo consuma (su función pasa a ser un envoltorio de tres líneas o desaparece).

```ts
export interface EventEffect {
  positions: PhysicalPosition[];
  lots: FiscalLot[];
}

export interface EventPreview<E extends SupportedEvent = SupportedEvent> {
  /** El evento tal como se escribiría: sobre y huella incluidos. */
  candidate: E;
  before: EventEffect;
  after: EventEffect;
  /** Ganancias que el propio candidato generaría. */
  gains: RealizedGain[];
  /** Avisos que el propio candidato levanta. */
  warnings: Warning[];
  /** Eventos con la misma huella ya registrados (vacío si ninguno). */
  duplicates: Ulid[];
  /** Estado y eventos del libro cargado, para no volver a cargar al confirmar. */
  events: readonly LedgerEvent[];
  state: LedgerState;
  etag: string;
}

export const previewEvent = async <E extends SupportedEvent>(
  deps: UseCaseDeps,
  draft: Draft<E>,
  /** Activos cuyo efecto se muestra; por defecto, los que el candidato referencia. */
  assets?: readonly AssetId[],
): Promise<EventPreview<E>>;
```

Garantías:

1. El candidato se completa con **el mismo** `completeDraft` que usa `recordEvent`, así que el identificador, `recorded_at` y la huella son los que se escribirían.
2. `after` se obtiene proyectando `[...events, candidate]` con el candidato colocado **cronológicamente** (`docs/data-schema.md` §7.1): es el mismo camino de código que decide si `recordEvent` acepta o rechaza.
3. Un error del dominio (posición insuficiente, libro degradado, tesis ausente…) se **lanza**, con el mismo `code` y los mismos `details` que lanzaría `recordEvent`: la interfaz no tiene que interpretar nada.
4. `duplicates` reutiliza `duplicatesOf(state.fingerprints, candidate)`; no se decide nada, solo se informa.
5. Sin efectos: no escribe, no muta el estado recibido.

**Alternativa descartada**: la web llama a `loadAndProject`, `completeDraft` y `projectLedger` por su cuenta, duplicando 30 líneas de composición que ya existen en la CLI. Funciona, pero deja dos sitios donde "la vista previa" puede divergir del registro real.

## 2. `ledgerEntries` — el libro como lista ordenada (Q2, aprobada)

**Hoy**: no existe. La CLI no tiene un comando que liste el libro (solo `export`), y ADR-0017 fija que **la ordenación y la agrupación viven en `@atlas/domain`** (es el motivo escrito para rechazar TanStack Table). La pantalla de Movimientos necesita orden cronológico inverso, el estado de cada evento y filtros (FR-037, FR-038, FR-040).

**Propuesta**: `packages/domain/src/projections/ledger-entries.ts`.

```ts
export type EntryStatus = "current" | "reversed" | "reversal" | "correction";

export interface LedgerEntry {
  event: LedgerEvent;
  /** Posición en el fichero (orden canónico de almacenamiento). */
  position: number;
  /** Fecha de negocio resuelta; ausente en catálogo, configuración, tesis y anulaciones. */
  business_date?: CivilDate;
  /** Fecha administrativa de `recorded_at` en Europe/Madrid. */
  recorded_date: CivilDate;
  status: EntryStatus;
  /** Anulación que lo deja sin efecto (si `status` es "reversed"). */
  reversed_by?: Ulid;
  /** El evento que corrige (si es una corrección) y el que lo corrige (si fue corregido). */
  corrects_id?: Ulid;
  corrected_by?: Ulid;
  account_id?: AccountId;
  asset_id?: AssetId;
  order_id?: Ulid;
  request_id?: Ulid;
  thesis_id?: string;
  /** Motivo si la proyección degradada lo marcó inválido. */
  invalid_reason?: string;
}

export interface EntryFilter {
  types?: readonly string[];
  account_id?: AccountId;
  asset_id?: AssetId;
  /** Rango cerrado sobre la fecha de negocio (o la administrativa si no tiene). */
  from?: CivilDate;
  to?: CivilDate;
  /** Coincidencia, sin distinguir mayúsculas, sobre identificador, notas, broker_ref, cuenta y activo. */
  text?: string;
  /** Por defecto se incluyen; false los oculta. */
  include_reversed?: boolean;
}

/** Entradas en orden cronológico **inverso** (fecha de negocio, desempate por posición en el fichero). */
export const ledgerEntries = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  filter?: EntryFilter,
): LedgerEntry[];
```

Garantías:

1. El orden es el **inverso** del que usa la proyección (`docs/data-schema.md` §7.1): fecha de negocio descendente, y a igual fecha, posición de fichero descendente. Los eventos sin fecha de negocio se ordenan por su fecha administrativa, y el criterio queda escrito y probado (no se mezclan silenciosamente con las operaciones).
2. `status` sale de `state.reversed` y de `corrects_id`: "vigente", "anulado", "es una anulación" o "es una corrección". Es información del dominio, no una convención de la interfaz.
3. Los filtros se combinan con **y** lógica; un filtro vacío devuelve todo. El filtro de texto es una coincidencia simple de subcadena, sin expresiones regulares ni fuzzy: comprobable y previsible.
4. La paginación **no** está aquí: quien pinta corta el array. Así la misma lista sirve al Resumen (primeras cinco) y a Movimientos (páginas de veinte).
5. Cubre **todos** los tipos de evento del esquema, incluidos los reservados, sin fallar por uno desconocido (FR-041).

**Alternativa descartada**: la web recorre `events`, calcula la fecha de negocio (que necesita `settingsAt` y `fiscalDateOf`), decide el estado y ordena. Es *exactamente* la regla de §7.1 reimplementada en un componente, con el riesgo de que la web y la proyección ordenen distinto. Sería el primer sitio del proyecto donde la fecha fiscal se calcula dos veces.

## 3. `silencedWarnings` — qué avisos apaga un cambio de configuración (Q4, aprobada)

**Hoy**: la comparación vive en `apps/cli/src/commands/catalogue.ts` (`activeWarnings` + `confirmSilencedWarnings`), y la constitución IV exige el aviso también en la web (FR-054).

**Propuesta**: añadirlo a `packages/domain/src/projections/settings-impact.ts`, junto a `movedFiscalYears`, que ya resuelve la otra mitad del problema.

```ts
export interface SilencedWarnings {
  /** Avisos activos con la configuración vigente que dejan de emitirse con la nueva. */
  silenced: Warning[];
  /** false cuando no se ha podido evaluar (faltan precios): entonces `silenced` está vacío. */
  evaluated: boolean;
  /** Activos sin precio que impidieron evaluar. */
  missing_prices: AssetId[];
}

export const silencedWarnings = (
  state: LedgerState,
  date: CivilDate,
  current: Settings,
  next: Settings,
): SilencedWarnings;
```

Garantías: compara los avisos de umbral (`deviation_above_threshold`, `satellite_below_minimum`) que `coreWeights` emite con una y otra configuración sobre el **mismo** libro y la **misma** fecha; si faltan precios, `evaluated` es `false` y no se inventa nada. La CLI pasa a consumirlo y su comportamiento observable no cambia.

## 4. Nada más

Se revisó qué más necesitan el Resumen, Movimientos y Ajustes, y **el resto ya está expuesto**: `loadAndProject`, `projectLedger` (con `collectErrors` y `asOf`), `netWorth`, `coreWeights`, `manualPrices`/`priceAt`, `pendingOrders`, `pendingTransfers`, `cashBalances`, `physicalPositions`, `fiscalLots`, `valuations`, `theses`, `settingsAt`, `mergeSettings`, `movedFiscalYears`, `integrity`, `deepCheck`, `recordEvent`, `reverseEvent`, `correctEvent`, `completeDraft`, `validateShape`, `knownFieldsOf`, `fingerprintOf`, `encodeLine`/`decodeLine`, `todayInMadrid`, `Money`/`Quantity`/`Decimal`/`FxRate`.

Tampoco entra el **catálogo de mensajes en español**: por decisión (i), cada interfaz tiene el suyo y el dominio sigue hablando inglés por contrato (`errors.ts`).

Dos ausencias **no** se proponen como añadidos porque serían reglas de negocio nuevas, fuera del alcance:

- **Traspaso pendiente que se pasa de `transfer_max_days`**: el parámetro existe en `Settings` y nadie lo consume todavía. La web listará los traspasos pendientes tal cual, sin marcar retraso. Convertirlo en aviso es una regla nueva; la dirección lo ha anotado para la segunda mitad de la web.
- **Orden de importancia de los avisos**: es presentación (decide qué mira el usuario primero, no qué es verdad), vive en `apps/web/src/view-models/attention.ts` y está probado allí.
