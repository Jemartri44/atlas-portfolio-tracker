# Contratos del dominio — `002-corporate-actions`

Funciones puras nuevas exportadas por `@atlas/domain` (además de las de la 001, que no cambian de firma salvo donde se indica).

## 1. Esquema

```ts
export const CORPORATE_ACTION_KINDS: readonly CorporateActionKind[];
export const EFFECT_OPS: readonly EffectOp[];
export type { CorporateActionEvent, Effect, ScaleEffect, ConvertEffect, CarveOutEffect, ForcedSaleEffect, GrantEffect,
  ThesisOpenedEvent, ThesisClosedEvent, CorporateActionKind, EffectOp };
export const RESERVED_EVENT_TYPES: readonly [];        // vacío; el mecanismo se conserva
validateShape(raw)                                     // acepta los tres tipos; rechaza forma inválida con field cualificado
fingerprintOf(event)                                   // corporate_action: sha256 del tuple de §2 del data-model
```

## 1 bis. Ratio

```ts
export class Ratio { static parse(text: string): Ratio; apply(q: Quantity): Quantity; inverse(): Ratio; toString(): string }
export const scaleQuantities(quantities: readonly Quantity[], ratio: Ratio): Quantity[]   // total una vez, resto al último
```

## 2. Tabla de composición

```ts
export const KIND_RULES: Record<CorporateActionKind, KindRule>;
export const checkEffectsAgainstKind(kind: CorporateActionKind, effects: readonly ResolvedEffect[], eventAssetId: AssetId): void;
// ResolvedEffect = Effect con asset_id ya resuelto (siempre presente)
// lanza ProjectionError("effects_not_allowed_for_kind")
```

## 3. Primitivas y orquestación

```ts
interface EffectContext { eventId: Ulid; position: number; effectiveDate: CivilDate }
applyScale(state, effect: Resolved<ScaleEffect>, ctx): void
applyConvert(state, effect: Resolved<ConvertEffect>, ctx): void
applyCarveOut(state, effect: Resolved<CarveOutEffect>, ctx): void
applyForcedSale(state, effect: Resolved<ForcedSaleEffect>, ctx): void
applyGrant(state, effect: Resolved<GrantEffect>, ctx): void
applyCorporateAction(state, event: CorporateActionEvent, position: number): void
```

Contrato de cada primitiva: valida todo antes de mutar; ante error lanza `ProjectionError` con `eventId = ctx.eventId` y no deja rastro (la proyección en `collectErrors` descarta el evento entero; el caso de uso no escribe).

## 4. Tesis

```ts
applyThesisOpened(state, event: ThesisOpenedEvent, position: number): void
applyThesisClosed(state, event: ThesisClosedEvent, position: number): void
requireOpenThesis(state, thesisId: string, accountId, assetId, logicalPosition: number, eventId): Thesis
linkBuy(state, thesis, event: BuyEvent, costEur: Money, feeEur: Money): void      // aviso thesis_size_exceeded
linkSell(state, thesis, event: SellEvent, gain: RealizedGain, feeEur: Money): void
thesisWarnings(state): void                                                      // thesis_closed_with_position
theses(state, at: CivilDate): ThesisView[]
```

`applyBuy(state, event, position)` no cambia de firma; `applySell(state, event, position)` gana `position` (para la ventana de la tesis).

## 5. Valoraciones

```ts
valuations(state, date: CivilDate): ValuationAt[]
```

## 6. Proyección

`projectLedger(events, options)` sin cambios de firma. Orden: pasada 0 (índices, anulaciones), pasada A (catálogo y configuración, orden de fichero), pasada A' (tesis, orden de fichero), pasada B (operaciones por `(fecha de negocio, posición)`; `corporate_action` por `effective_date`), cierre (`thesisWarnings`). `businessDateOf` cubre `corporate_action`.

`completeDraft(deps, draft, id)` (ya existente en `usecases/record-event.ts`) se exporta desde `index.ts` para que la CLI construya el candidato de la vista previa con el mismo código que el caso de uso.

## 7. Propiedades verificadas (`test/properties/corporate-actions.test.ts`)

Sobre libros aleatorios de la 001 (`ledgers.ts`) ampliados con eventos corporativos válidos generados a partir del estado:

1. `scale(r)` y `convert(to, r)` conservan Σ `cost_eur` de los lotes abiertos por activo (origen + destino).
2. `carve_out` reparte exactamente el 100 %: `coste_origen_después + coste_destino = coste_origen_antes`.
3. `forced_sale` sobre una cuenta produce el mismo `aggregate(state)` que un `sell` equivalente (misma cantidad, precio, comisión, divisa, tipo de cambio y fecha) en esa cuenta.
4. `scale(r)` seguido de `scale(1/r)` con `r ∈ {2, 4, 5, 8, 10, 0.5, 0.25, 0.2, 0.125, 0.1}` y con fracciones `"n/d"`·`"d/n"` de cantidades enteras deja cantidades y costes idénticos.
7. `scaleQuantities` conserva Σ = `ratio.apply(Σ)` para cualquier lista y ratio; con ratio decimal cada elemento es exactamente `q × ratio`.
5. Tras cualquier `corporate_action` válido, Σ lotes abiertos = Σ posiciones físicas por activo e `integrity(state) = []`.
6. Proyectar dos veces da el mismo `aggregate`.
