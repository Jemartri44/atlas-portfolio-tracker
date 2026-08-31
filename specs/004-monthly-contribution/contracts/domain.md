# Contrato del dominio — feature 004-monthly-contribution

Firmas públicas nuevas de `@atlas/domain` y lo que garantizan. Todas son funciones puras: no leen el reloj, no tocan el sistema de ficheros y no mutan el estado que reciben.

## Proyecciones

```ts
manualPrices(state: LedgerState, date: CivilDate, settings: Settings): Map<AssetId, ManualPrice>
coreWeights(state: LedgerState, date: CivilDate, settings: Settings): CoreWeights
contributionPlan(state: LedgerState, input: ContributionInput): ContributionPlan
simulateTransfer(state: LedgerState, input: SimulateTransferInput): TransferSimulation
costSummary(state: LedgerState, events: readonly LedgerEvent[], date: CivilDate, settings: Settings): CostSummary
```

`costSummary` recibe los eventos además del estado: las comisiones por operación no se acumulan en la proyección (hacerlo cambiaría `snapshotOf` y el *golden*), así que se recorren los eventos no anulados, como hace `deepCheck`.

```ts
interface ContributionInput { amount?: DecimalString; date: CivilDate; settings: Settings }
interface SimulateTransferInput {
  from_asset_id: AssetId; to_asset_id: AssetId;
  quantity?: DecimalString; all?: boolean;      // exactamente uno
  date: CivilDate; settings: Settings;
}
```

### Garantías

| # | Garantía | Cómo se verifica |
|---|---|---|
| G1 | Ninguna de las cinco lee ni escribe lotes, ganancias, rendimientos ni fechas fiscales | Test de arquitectura: los módulos nuevos no importan `lots.ts`, `gains.ts`, `income.ts` ni `fiscal-date.ts`; y ningún módulo fiscal importa `prices.ts` |
| G2 | Ninguna devuelve filas ni totales que mezclen `core` y `bucket` | Test: libro con los dos libros; toda fila de `coreWeights`/`contributionPlan`/`simulateTransfer` tiene `book === "core"`; `costSummary.core` y `.bucket` no comparten ningún activo ni total |
| G3 | Un precio ausente nunca se sustituye por cero ni se interpola | Test: activo con posición y sin `valuation` ⇒ `missing_prices` lo contiene y `partial === true`; `contributionPlan` lanza `missing_manual_prices` |
| G4 | `Σ allocation_eur === core_amount_eur` exactamente, al céntimo | Propiedad `fast-check` sobre pesos, valores y aportación arbitrarios; además comprobación interna en la función |
| G5 | `allocation_eur >= 0` para toda fila | Ídem, incluidos importes de céntimos con muchos activos |
| G6 | Con `Σgap ≥ core`, ningún activo supera su objetivo por efecto de la aportación | Propiedad: `value_after_eur <= target_eur` para toda fila en esa rama |
| G7 | La desviación máxima no crece al aplicar la propuesta | Propiedad: `max|deviation|` de `coreWeights` tras sumar las asignaciones ≤ el de antes |
| G8 | `manualPrices` no depende del orden de registro de valoraciones de fechas distintas | Propiedad: barajar el orden de fichero de las `valuation` de fechas distintas no cambia el resultado; con fechas iguales manda la posición |
| G9 | Ninguna escribe en el libro | Test: el `etag` del almacén no cambia tras ejecutar cada comando de consulta |

## Casos de uso

```ts
recordEvent(deps, draft, options?: { confirmDuplicate?: boolean; acceptInvalid?: boolean })
```

- `acceptInvalid` con un evento que no es `settings_changed` ⇒ `ValidationError("accept_invalid_not_allowed")`.
- Sin `acceptInvalid`:
  - evento distinto de `settings_changed`: si la proyección del candidato tiene **algún** evento inválido (nuevo o preexistente), se lanza el error del primero en orden de fichero. Mismo comportamiento observable que hoy.
  - `settings_changed`: si el propio evento es inválido, se lanza su error; si invalida a otros que antes eran válidos, `DependentEventsError` con `code = "newly_invalid_events"` y `affected[{id, type, error}]`.
- Con `acceptInvalid` sobre un `settings_changed`: se escribe y `RecordResult.newlyInvalid` lista los eventos afectados.
- En todos los casos, los eventos que ya eran inválidos **antes** no cuentan para la decisión sobre `settings_changed` (comparación de conjuntos, ADR-0015).

```ts
newlyInvalid(current: readonly LedgerEvent[], candidate: readonly LedgerEvent[]): InvalidEvent[]
```

Función compartida extraída de `rectify.ts`: proyecta los dos libros con `collectErrors` y devuelve los inválidos del candidato que no lo eran en el actual. `reverseEvent`, `correctEvent` y `recordEvent` la usan; una sola implementación de la comparación (research §4).

## Configuración

```ts
validateSettings(raw: unknown): Settings          // + wash_sale_window, target_weights >= 0
normalizeSettings(settings: Settings): Settings   // wash_sale_window siempre completo
```

- `validateSettings` rechaza: ventana ausente en las dos formas (`invalid_settings`), valor de ventana con formato distinto de `2m|1y|<n>d` (`invalid_wash_sale_window`), peso objetivo negativo (`negative_target_weight`), pesos que no suman exactamente 100 (ya existía).
- `normalizeSettings` no muta su entrada y es idempotente.

## Validación de forma

```ts
validateShape(raw, schema?): LedgerEvent   // mismas firmas; reglas nuevas dentro
```

Reglas nuevas, aplicadas a eventos y a los efectos `forced_sale` y `grant`:

- `eur_fx_rate_not_one`: divisa del par `=== "EUR"` ⇒ el tipo debe ser la cadena `"1"` exacta.
- `fx_rate_date_weekend`: todo campo de fecha de tipo de cambio debe caer de lunes a viernes.
- `transfer_fee_not_allowed`: `transfer` con `fee`, con mensaje que remite a `standalone_fee`.
- `dividend.source_country?`: ISO 3166-1 alfa-2 en mayúsculas.

Un test recorre `RULES` y exige que todo campo cuyo nombre empiece por `fx_rate` esté declarado en `FX_PAIRS` o en `FX_DATE_FIELDS`: un evento nuevo con tipo de cambio no puede quedar sin validar.

## Fechas

```ts
isWeekend(date: CivilDate): boolean
daysBetween(from: CivilDate, to: CivilDate): number   // to − from, en días
addDays(date: CivilDate, days: number): CivilDate     // se mueve aquí desde synth/calendar.ts
```

Aritmética sobre la fecha civil, sin zona horaria ni hora.
