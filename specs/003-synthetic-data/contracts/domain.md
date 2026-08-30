# Contrato del dominio — feature 003-synthetic-data

Funciones puras y puerto ampliado que `@atlas/domain` exporta. Firmas en TypeScript; errores como `DomainError` con `code`.

## 1. Esquema

```ts
export type Migration = (line: UnknownRecord) => UnknownRecord;
export interface LedgerSchema { readonly version: number; readonly migrations: ReadonlyMap<number, Migration> }
export const CURRENT_LEDGER_SCHEMA: LedgerSchema;             // { version: CURRENT_SCHEMA_VERSION (1), migrations: vacío }
export const migrate: (line: UnknownRecord, schema?: LedgerSchema) => UnknownRecord;
export const parseLine: (text: string) => UnknownRecord;      // invalid_json | invalid_line
export const decodeLine: (text: string, schema?: LedgerSchema) => DecodedLine;   // parse → migrate → validateShape
export const encodeLine: (event: LedgerEvent) => string;      // = canonicalLine(event)
export const canonicalLine: (record: UnknownRecord) => string; // envoltorio primero, resto en su orden, JSON.stringify
export const validateShape: (raw: unknown, schema?: LedgerSchema) => LedgerEvent;  // schema_version === schema.version
```

Se eliminan `MigrationChain` y `MIGRATIONS`. `CURRENT_SCHEMA_VERSION`, `SUPPORTED_EVENT_TYPES` y `RESERVED_EVENT_TYPES` no cambian.

## 2. Puerto `LedgerStore`

```ts
export interface LoadedLedger {
  readonly events: readonly LedgerEvent[];
  readonly etag: string;
  readonly lines: readonly string[];      // crudas, sin salto final, orden de fichero; lines.length === events.length
}
export interface LedgerStore {
  readonly schema: LedgerSchema;
  load(): Promise<LoadedLedger>;
  append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }>;
  replace(events: readonly LedgerEvent[], etag: string, archiveName: string): Promise<{ etag: string }>;
}
```

Contrato de `replace` (verificado por `ledger-store.contract.ts` en memoria y fichero): etag viejo → `ConflictError` sin escribir; `archiveName` existente → `ArchiveExistsError` sin escribir; archiva los bytes actuales exactos antes de reescribir; el contenido nuevo es `events.map(encodeLine)` con `\n` final; `load()` posterior devuelve esos eventos y líneas; el archivo nunca se sobrescribe ni se borra.

## 3. Errores nuevos

| Clase | `code` | `details` |
|---|---|---|
| `ArchiveExistsError` | `archive_exists` | `{ archive_name }` |
| `CompactRejectedError` | `invalid_events` | `{ affected: { id, type, error }[] }` |
| `CompactRejectedError` | `projection_changed` | `{ keys: string[] }` |

## 4. Instantánea

```ts
export type Snapshot = Record<string, unknown>;               // forma en data-model.md §1
export const snapshotOf: (state: LedgerState) => Snapshot;    // pura, claves ordenadas, decimales como texto
export const snapshotDiff: (a: Snapshot, b: Snapshot) => string[];   // claves de primer nivel que difieren
```

Propiedades: `JSON.stringify(snapshotOf(projectLedger(e))) === JSON.stringify(snapshotOf(projectLedger(e)))`; `snapshotDiff(s, s) = []`.

## 5. Integridad y verificación profunda

```ts
export const integrity: (state: LedgerState) => IntegrityFinding[];   // + dangling_reference
export const deepCheck: (
  lines: readonly string[],
  events: readonly LedgerEvent[],
  state: LedgerState,
  schema?: LedgerSchema,
) => IntegrityFinding[];   // duplicate_id, fingerprint_mismatch, non_canonical_line, outdated_lines, unknown_field, projection_not_reproducible
```

`deepCheck` no lanza si las líneas son las que produjo `load()`; con ids duplicados omite `projection_not_reproducible`.

## 6. `compact`

```ts
export interface CompactDeps { store: LedgerStore; clock: Clock }
export const planCompact: (deps: CompactDeps) => Promise<CompactPlan>;                 // invalid_events
export const compactLedger: (deps: CompactDeps, plan: CompactPlan) => Promise<CompactResult>;
```

Rechazos: `CompactRejectedError` (`invalid_events` en `planCompact`, `projection_changed` en `compactLedger`), `ConflictError` (etag distinto del plan o de `replace`), `ArchiveExistsError` (tras agotar `-2`…`-99`). Ninguno escribe ni archiva. `validateShape` expone además `knownFieldsOf(type): readonly string[]` para `unknown_field`. Formas en `data-model.md` §4.

## 7. Generador sintético (`synth/`)

```ts
export const seededRandom: (seed: number) => RandomSource;           // mulberry32; seed entero de 32 bits (se toma módulo 2^32)
export class SyntheticClock implements Clock { constructor(start?: string); at(date: CivilDate): Date; now(): Date }
export const generateLedger: (options: { seed: number }) => LedgerEvent[];
export const SYNTHETIC_EXPECTED_WARNINGS: readonly string[];         // ["same_asset_two_accounts"]
export const summarizeLedger: (events: readonly LedgerEvent[]) => LedgerSummary;
export interface LedgerSummary { events: number; byType: Record<string, number>; accounts: string[]; assets: string[]; years: number[] }
```

Invariantes de `generateLedger` (tests): determinismo byte a byte por semilla; todo prefijo proyecta sin `invalid`; `integrity` vacío; avisos ⊆ `SYNTHETIC_EXPECTED_WARNINGS`; Σ lotes = Σ posiciones; `snapshotOf` estable; contenido mínimo de `spec.md` Historia 1 escenario 6. Regla de arquitectura: ningún fichero de `packages/domain/src` fuera de `synth/` importa de `synth/`.

## 8. `loadAndProject`

`ProjectedLedger` gana `lines: readonly string[]`.
