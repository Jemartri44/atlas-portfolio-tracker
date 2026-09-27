# Contrato: lo que el dominio ofrece a la web en esta feature

Propuesta hasta el visto bueno (nombres: §7.2 (e) del encargo). Los tipos completos, en [`../data-model.md`](../data-model.md).

## Barril `@atlas/domain` (va en el arranque; coste medido)

| Exportación | Entrega | Firma |
|---|---|---|
| `hasForeignAccountsAt` | E2 | `(events: readonly LedgerEvent[], date: CivilDate, settings: Settings) => boolean` |
| `inRentaSeason` (Q5, propuesta) | E2 | `(settings: Settings, date: CivilDate) => boolean`, ambos extremos incluidos |
| `NEAR_LIMIT_PCT` | E3 | `Decimal` (hoy `80`) |

`fiscalAttention` **no cambia de firma**: cambia `prominent` (solo la campaña). Sigue en `@atlas/domain/fiscal`.

## `@atlas/domain/charts` (nueva, perezosa; en `LAZY_ONLY` desde su primer commit)

| Exportación | Entrega | Firma |
|---|---|---|
| `bucketGauges` | E3 | `(controls: BucketControls, settings: Settings) => BucketGauges` |
| `thesisVsIndexPct` | E3 | `(thesis: BucketThesisView) => { thesis_pct?: Decimal; index_pct?: Decimal; vs_index_pp?: Decimal }` |
| `contributedSeries` | E4 | `(events: readonly LedgerEvent[], options: SeriesOptions) => ContributedSeries` |
| `bucketIndexPctSeries` | E4 | `(events: readonly LedgerEvent[], options: SeriesOptions) => BucketIndexPctSeries` |

Reglas de arquitectura (`tests/architecture.test.ts`): el barril no la reexporta; ningún módulo del dominio la importa; ningún módulo del arranque de la web la importa estáticamente.

## `@atlas/domain/fiscal` (existente, perezosa)

| Exportación | Entrega | Firma |
|---|---|---|
| `fiscalCalendar` | E4 | `(events: readonly LedgerEvent[], today: CivilDate) => FiscalCalendar` |
| `FILING_DEADLINES` | E4 | `readonly FilingDeadline[]` (forma: Q4) |

## Invariantes que los tests atan

- `contributedSeries(e, o).points.map(p => p.date)` = `netWorthSeries(e, o).points.map(p => p.date)`.
- En la última fecha, `bucketIndexPctSeries(...).vs_index_pct` = `bucketStats(...).stats.vs_index_pct`.
- `bucketGauges(...).contribution_pct_of_cap > near_limit_pct` ⇔ el dominio emite `bucket_contribution_near_limit` (propiedad).
- `hasForeignAccountsAt(e, d, s)` es `true` siempre que `fiscalAttention(e, d).todo` no está vacío y `s.tax_residence` es `ES` o no existe (propiedad).
- Ninguna salida de `fiscalCalendar` contiene un `Money` ni un `Quantity` (test de forma).
