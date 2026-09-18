# Contrato del dominio — feature 005-bucket-tracking

Firmas públicas nuevas de `@atlas/domain` y lo que garantizan. Todas son funciones puras: no leen el reloj, no tocan el sistema de ficheros y no mutan el estado que reciben.

## Proyecciones

```ts
priceAt(state, assetId, date, settings, external?): PriceLookup | undefined
manualPrices(state, date, settings, external?): Map<AssetId, PriceLookup>

netWorth(state, date, settings, external?): NetWorth
bucketPositions(state, date, settings, external?): BucketPositions
bucketTheses(state, date, settings, external?): BucketThesisView[]
bucketStats(state, events, date, settings, asOf?, external?): { stats: BucketStats; controls: BucketControls }

movedFiscalYears(events, current, next, currentYear): FiscalYearImpact[]
```

`bucketStats` recibe los eventos además del estado por la misma razón que `costSummary` desde la 004: las comisiones por operación y los depósitos no se acumulan en la proyección, y acumularlos cambiaría `snapshotOf` y el *golden*. Recorre los eventos no anulados y aplica el mismo corte `asOf` con `businessDateOf`.

## Utilidades

```ts
addMonths(date: CivilDate, months: number): CivilDate   // 2027-01-31 + 1 mes = 2027-02-28
addYears(date: CivilDate, years: number): CivilDate     // 2028-02-29 + 1 año = 2029-02-28
washSaleWindowOf(settings: Settings, assetType: AssetType): WashSaleWindow
washSaleWindowEnd(fiscalDate: CivilDate, window: WashSaleWindow): CivilDate   // último día inclusive
fiscalDateOf(dates, assetType, settings): CivilDate     // resuelve el valor por defecto del mapa parcial
```

## Garantías

| # | Garantía | Cómo se verifica |
|---|---|---|
| G1 | Ninguna proyección nueva escribe en el libro ni muta el estado recibido | Test: el `etag` del almacén no cambia tras cada comando; comparación del estado antes y después |
| G2 | Ningún módulo fiscal (`lots`, `gains`, `income`, `corporate-actions`, `primitives`, `operations`, `theses`) importa precios ni proyecciones del cubo | Test de arquitectura ampliado |
| G3 | Solo `prices.ts` resuelve el precio de un activo; nadie más lee `state.valuations` para ello | Test que recorre `packages/domain/src` (excepción escrita: `valuations.ts`) |
| G4 | Un precio, un tipo de cambio o un precio del índice ausente nunca se sustituye por cero ni se interpola | Tests de cada caso: campo `undefined`, entrada en `missing_*` y aviso correspondiente |
| G5 | `netWorth` devuelve siempre los tres bloques y nunca un total sin desglose | Test de forma: los tres bloques existen aunque valgan cero; no hay función que devuelva solo el total |
| G6 | `result_vs_index_eur` es cero exacto cuando el activo y el índice rinden lo mismo | Propiedad `fast-check` sobre importes y precios arbitrarios |
| G7 | P&L latente + resultado realizado = (valor actual + cobros) − coste, exacto | Propiedad `fast-check` sobre una tesis con compras y ventas parciales |
| G8 | La máxima caída nunca es negativa y es cero si la curva no baja | Propiedad `fast-check` sobre series de ganancias arbitrarias |
| G9 | La tasa de acierto está en `[0, 1]` y la esperanza es la media ponderada de ganancia y pérdida | Propiedad `fast-check` |
| G10 | Una tesis con resultado contaminado no entra en ninguna media y se cuenta aparte | Test con dos tesis sobre el mismo activo, la primera cerrada con posición viva |
| G11 | Los avisos de las reglas de control viajan en la estructura devuelta, nunca en `state.warnings` | Test: `state.warnings` del libro sintético no contiene ningún código `bucket_*` |
| G12 | `wash_sale_window_repurchase` se emite en la proyección del `buy`, con el último día de la ventana correcto | Tests de calendario: último día, día siguiente, fin de mes, bisiesto, fondo y acción |
| G13 | Un `settings_changed` con mapas parciales es válido y su lectura devuelve los valores por defecto | Test con una línea sin `etf`, incluido el *golden* completo |
| G14 | El bloque 0 no cambia el *golden* ni su instantánea | La batería de la 003 pasa sin regenerar nada |
| G15 | Un bloque grabado en un subflujo del generador no altera ni un byte de lo grabado antes | Test del mecanismo, previo a usarlo en el escenario |

## Cambios en firmas existentes

- `fiscalDateOf(dates, assetType, settings)`: mismo contrato, ahora resuelve el valor por defecto cuando el mapa no menciona el tipo.
- `Thesis.buys` / `Thesis.sells`: de `Ulid[]` a `ThesisLeg[]`. `snapshotOf` sigue serializando solo los ids, así que la instantánea no cambia; la salida `--json` de `thesis list` gana información.
- `LedgerState`: campo nuevo `fxRates` (no entra en `snapshotOf`).
- `manualPrices`: parámetro opcional `external` y `origin` en su resultado; sin pasarlo, comportamiento idéntico al actual.
