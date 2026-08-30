# Contratos: puertos, casos de uso y formato de línea

## 1. Formato de línea (`schema/line.ts`)

- `encodeLine(event: LedgerEvent): string` → JSON en una línea, UTF-8, **sin** `\n` final, claves en orden fijo: `schema_version`, `id`, `recorded_at`, `type`, `corrects_id?`, resto en el orden de `data-schema.md` §6. Numéricos como cadenas.
- `decodeLine(text: string): { event: LedgerEvent; raw: string }` → lanza `ValidationError` (JSON inválido, envoltorio incompleto, `number` en campo numérico, tipo desconocido) o `SchemaTooNewError` (`schema_version > CURRENT_SCHEMA_VERSION`). Aplica `migrate` antes de validar la forma.
- Propiedad: `decodeLine(encodeLine(e)).event` es estructuralmente igual a `e`.

## 2. Puertos (`ports/`)

```ts
interface LedgerStore {
  /** Carga el libro completo en orden de fichero. Lanza SchemaTooNewError/ValidationError si alguna línea no es válida. */
  load(): Promise<{ events: readonly LedgerEvent[]; etag: string }>;
  /** Añade eventos al final si y solo si el etag coincide con el estado actual; nunca re-serializa lo existente. */
  append(events: readonly LedgerEvent[], etag: string): Promise<{ etag: string }>;  // lanza ConflictError
}

interface Clock { now(): Date }
```

### Contrato obligatorio de `LedgerStore` (test compartido para memoria y fichero)

1. `load()` de un libro vacío devuelve `events = []` y un `etag` estable.
2. `append(e, etag)` seguido de `load()` devuelve los eventos previos + `e`, en ese orden, y un `etag` distinto.
3. `append` con un `etag` obsoleto lanza `ConflictError` y no altera el libro.
4. `load()` de un libro con una línea `schema_version = 2` lanza `SchemaTooNewError` y (fichero) no crea ni modifica nada.
5. (fichero) Tras `append`, `bytes[0 .. len(original))` son idénticos al original; si el original no terminaba en `\n`, se añade exactamente uno antes de la primera línea nueva.
6. (fichero) Un fichero inexistente se carga como vacío; el primer `append` lo crea.
7. (fichero) Nunca queda un temporal huérfano tras un `append` correcto; el temporal vive en el mismo directorio.

## 3. Casos de uso (`usecases/`)

Todos reciben `deps: { store: LedgerStore; clock: Clock; random?: (bytes: Uint8Array) => void }`.

```ts
type Draft<T extends LedgerEvent> = Omit<T, 'schema_version' | 'id' | 'recorded_at' | 'fingerprint'> & { fingerprint?: string };

recordEvent(deps, draft: Draft<LedgerEvent>, opts?: { confirmDuplicate?: boolean })
  → Promise<{ event: LedgerEvent; warnings: Warning[] }>
  // lanza ValidationError | ProjectionError | DuplicateFingerprintError { existing: Ulid[] } | ConflictError

reverseEvent(deps, targetId: Ulid, reason: string)
  → Promise<{ reversal: ReversalEvent; warnings: Warning[]; priorYear: boolean }>
  // lanza NotFoundError | ValidationError (reversal de reversal, ya anulado) | DependentEventsError { affected: { id, type, error }[] } | ConflictError

correctEvent(deps, targetId: Ulid, replacement: Draft<LedgerEvent>, reason: string)
  → Promise<{ reversal: ReversalEvent; event: LedgerEvent; warnings: Warning[]; priorYear: boolean }>
  // como reverseEvent; el reemplazo lleva corrects_id = targetId; un solo append([reversal, event])

projectLedger(deps, opts?: { settings?: Settings })
  → Promise<{ state: LedgerState; etag: string }>
```

Consultas puras sobre `LedgerState` (exportadas por `@atlas/domain`): `accounts(state)`, `assets(state)`, `settingsAt(state, date)`, `physicalPositions(state)`, `cashBalances(state)`, `pendingTransfers(state, at)`, `pendingOrders(state, at)`, `fiscalLots(state, assetId?)`, `realizedGains(state, year)`, `investmentIncome(state, year)`, `integrity(state)`.

## 4. Errores (`errors.ts`)

`DomainError` (base, `code`, `message` en inglés + `details`) → `ValidationError`, `ProjectionError { eventId }`, `SchemaTooNewError { found, supported }`, `ConflictError`, `NotFoundError`, `DuplicateFingerprintError`, `DependentEventsError`, `UnsupportedEventError`, `CurrencyMismatchError`. Los mensajes al usuario en español los genera la CLI a partir de `code`.
