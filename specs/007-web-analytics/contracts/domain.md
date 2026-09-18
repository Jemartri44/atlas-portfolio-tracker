# Contrato de los añadidos al dominio — feature `007-web-analytics`

Decisión (c) de la 006, vigente: **ni una regla de negocio fuera de `@atlas/domain`**. Decisión (f) de este prompt: **las series temporales las calcula el dominio**. Decisión (c): **`transfer_max_days` se consume en el dominio**.

Todo lo que sigue es **puro** (sin E/S), entra en la API pública de `packages/domain/src/index.ts` y llega con **cobertura del 100 % de líneas y ramas** (constitución VII).

Son cuatro añadidos. Tres los manda el prompt; el cuarto (§4) es un hallazgo y va acompañado de la pregunta **Q4**.

---

## 1. El aviso de traspaso vencido (decisión (c), FR-001..FR-004)

**Hoy**: `Settings.transfer_max_days` existe, se valida como entero positivo, el libro sintético lo trae a 15, y **nadie lo lee**. `pendingTransfers(state, at)` devuelve `OpenTransfer[]` con `days_open` ya contados hasta `at`, pero no tiene canal de avisos ni conoce la configuración.

**Propuesta**: una proyección nueva que **envuelve** `pendingTransfers`, igual que `bucketTheses` envuelve `theses`. `pendingTransfers` no cambia, así que ninguno de sus tres consumidores actuales (`atlas transfer pending`, `routes/resumen`, `view-models/attention`) se rompe.

`packages/domain/src/projections/pending.ts` (junto a lo que envuelve):

```ts
export interface WatchedTransfer extends OpenTransfer {
  /** `days_open > transfer_max_days`; ausente cuando el parámetro no está configurado. */
  overdue?: boolean;
  /** El plazo con el que se ha comparado, para que la interfaz lo pueda decir. */
  max_days?: number;
}

export interface TransferWatch {
  date: CivilDate;
  rows: WatchedTransfer[];
  /** Un aviso por solicitud vencida. Vacío si `transfer_max_days` no está configurado. */
  warnings: Warning[];
}

/** Solicitudes abiertas a una fecha, con el aviso de la regla de plazo (ADR-0010). */
export const transferWatch = (
  state: LedgerState,
  at: CivilDate,
  settings: Settings,
): TransferWatch;
```

Garantías:

1. Los días se cuentan con el mismo `daysBetween` que ya usa `pendingTransfers`, **hasta `at`**, nunca hasta hoy. Consultar el 30/06/2027 dice lo que se sabía ese día.
2. El aviso se emite cuando `days_open > transfer_max_days` (estrictamente mayor: el día del plazo todavía está en plazo). Ver **Q2** para confirmar el operador.
3. **Sin `transfer_max_days` configurado no se evalúa nada**: `overdue` queda ausente y `warnings` vacío. No se inventa un plazo por defecto (constitución IV y V).
4. Una solicitud en etapa `redeemed` (reembolsada pero no suscrita) **sigue contando**: es el estado peligroso, dinero fuera de un fondo y todavía no dentro del otro.
5. El aviso lleva `event_id` = el `request_id` de la solicitud, para que la interfaz pueda enlazar al movimiento.

Código propuesto: **`transfer_overdue`**, con `details` `{ request_id, days_open, max_days, requested_date, stage, from_asset_id, to_asset_id }`.

Efecto inmediato del test anti-deriva (`tests/messages.test.ts`): en cuanto el código aparece en `packages/domain/src`, la suite falla hasta que existan `case "transfer_overdue":` en `apps/cli/src/output/messages.ts` **y** la clave `transfer_overdue:` (a dos espacios de sangría) en `apps/web/src/format/messages/warnings.ts`. Es exactamente la garantía que la decisión (i) compró.

**Cambio en la CLI** (FR-004): `atlas transfer pending` gana `--date`, pasa a `loadForQuery(ctx, date)` y a `transferWatch`, imprime una columna con la marca de vencido y el bloque de avisos al pie, como el resto de vistas. Ver **Q3**.

---

## 2. La serie temporal del patrimonio (decisión (f), FR-023..FR-026)

**Hoy**: no existe nada parecido. `netWorth(state, date, settings)` responde por una fecha; una serie son N proyecciones con `asOf`, y hacerlas en un bucle dentro de un componente está prohibido por la decisión (f) y sería, además, el sitio donde se decidiría qué es un hueco — que es una regla, no una presentación.

**Propuesta**: `packages/domain/src/projections/series.ts`.

```ts
/** Una fecha de la serie. Un bloque **ausente** es un hueco: nunca un cero, nunca un total parcial. */
export interface NetWorthPoint {
  date: CivilDate;
  /** Valor del núcleo; ausente cuando algún activo del núcleo con posición no tiene precio. */
  core_eur?: Money;
  bucket_eur?: Money;
  /** El efectivo no necesita precio, solo tipo de cambio; ausente si falta alguno. */
  cash_eur?: Money;
  /** Suma de los tres; ausente si falta cualquiera de ellos. */
  total_eur?: Money;
  /** Qué falta en este punto, por bloque, para poder decirlo en texto. */
  missing: {
    core: AssetId[];
    bucket: AssetId[];
    cash: Currency[];
  };
}

export interface NetWorthSeries {
  from: CivilDate;
  to: CivilDate;
  points: NetWorthPoint[];
  /** Puntos con los tres bloques presentes, para que la vista sepa si hay algo que dibujar. */
  complete: number;
}

export interface SeriesOptions {
  to: CivilDate;
  from?: CivilDate;
  /** Fechas exactas. Por defecto, las fechas de valoración del libro en el rango más `to`. */
  dates?: readonly CivilDate[];
  /** Tope de puntos; por encima se muestrean de forma uniforme conservando el primero y el último. */
  max_points?: number;
}

/** Evolución del patrimonio, un punto por fecha, proyectando el libro con `asOf` en cada una. */
export const netWorthSeries = (
  events: readonly LedgerEvent[],
  options: SeriesOptions,
): NetWorthSeries;
```

Garantías:

1. Recibe **eventos**, no un estado: cada punto es una proyección con `asOf` distinto (ADR-0016). Es el mismo camino de código que `atlas networth --date`, así que un punto de la serie y el comando dan lo mismo.
2. La configuración de cada punto sale de `settingsAt(state, date)`: un cambio de umbrales a mitad del histórico se respeta.
3. **Un bloque parcial es un hueco.** `netWorth` devuelve en `total_eur` la suma de lo que sí tiene precio; esa cifra, dibujada, es más pequeña que la realidad y no se puede distinguir de una caída. Aquí no se devuelve: el bloque queda ausente y `missing` dice por qué.
4. **No se interpola, no se arrastra, no se rellena.** No hay parámetro para hacerlo.
5. Las fechas por defecto son las **fechas de valoración** del libro dentro del rango, más `to`. Entre dos valoraciones el libro no sabe nada nuevo, así que una rejilla fija solo añade puntos repetidos y coste. Ver **Q1**.
6. Coste: una proyección por punto, medido en 1,2–2,1 ms con 200 eventos (`research.md` §2). `max_points` existe para que un libro de veinte años no se convierta en miles de proyecciones.

## 2 bis. La serie del cubo frente al índice (FR-022, tercera gráfica)

Misma familia, en `series.ts`:

```ts
export interface BucketIndexPoint {
  date: CivilDate;
  /** Σ resultado de las tesis vivas a la fecha (realizado + latente). Ausente si falta un precio. */
  result_eur?: Money;
  /** Σ equivalente en índice del mismo dinero en las mismas fechas. Ausente si falta un precio. */
  benchmark_eur?: Money;
  /** Σ `result_vs_index_eur`. Ausente si cualquiera de los dos lo está. */
  vs_index_eur?: Money;
  /** Tesis que no se han podido comparar en este punto, con su causa. */
  missing: BenchmarkGap[];
}

export const bucketIndexSeries = (
  events: readonly LedgerEvent[],
  options: SeriesOptions,
): { from: CivilDate; to: CivilDate; points: BucketIndexPoint[]; complete: number };
```

Garantías: consume `bucketTheses` en cada fecha, **no recalcula nada** de la regla 16, y hereda su definición del término latente (plusvalía latente, no valor de la posición). Si una sola tesis no se puede comparar, el agregado del punto queda ausente: una suma parcial no es comparable con nada.

Ver **Q7** sobre si la gráfica es esta curva agregada o una línea por tesis.

---

## 3. Lo que **no** hace falta añadir

Se ha revisado qué necesitan Núcleo, Cubo y los tres formularios, y el resto ya está expuesto: `coreWeights`, `contributionPlan`, `simulateTransfer`, `costSummary`, `bucketPositions`, `bucketTheses`, `bucketStats`, `theses`, `netWorth`, `valuations`, `pendingOrders`, `pendingTransfers`, `priceAt`, `manualPrices`, `settingsAt`, `previewEvent`, `recordEvent`, `correctEvent`, `reverseEvent`, `validateShape`, `knownFieldsOf`, `KIND_RULES`, `checkEffectsAgainstKind`, `targetOf`.

En particular, **el peso de una posición dentro del cubo** (FR-015) no es un añadido: `bucketPositions` ya devuelve `total_value_eur` y el `value_eur` de cada fila, y la división es presentación de dos cifras del dominio, no una regla. *(Si la dirección lo ve de otra forma, es una línea: se añade `weight_pct` a `BucketPosition`. Anotado en `questions.md` como nota, no como pregunta.)*

---

## 4. Hallazgo: la composición de un evento corporativo vive en la CLI

**No estaba en el prompt.** Aparece al mirar qué haría falta para el formulario de eventos corporativos (FR-031, FR-033).

`corporate_action` es el único evento del esquema cuyo cuerpo no es plano: lleva `effects: Effect[]`, y cada efecto es un `scale`, `convert`, `carve_out`, `grant` o `forced_sale` con sus campos. El modelo declarativo de `apps/web/src/view-models/forms/specs.ts` describe campos planos y no puede expresarlo.

La CLI sí sabe hacerlo: `apps/cli/src/commands/corporate-actions.ts` tiene nueve asistentes que, a partir de un puñado de banderas, componen el array. Y uno de ellos **calcula**: `fractionalSale` proyecta el efecto principal, mira la posición resultante por cuenta, calcula `posición − ⌊posición⌋` y añade el `forced_sale` de los picos con su reparto.

Reimplementar eso en la web sería la segunda definición de una regla fiscal. Es el mismo caso que Q1 de la 006 (la vista previa), resuelto entonces con la decisión (h): **al dominio, y la CLI lo consume**.

**Propuesta**, `packages/domain/src/projections/corporate-action-draft.ts` (pura: proyecta con `projectLedger`, no hace E/S):

```ts
export interface CorporateActionParams {
  kind: CorporateActionKind;
  asset_id: AssetId;
  effective_date: CivilDate;
  source_document: string;
  notes?: string;
  /** Destino de un canje o de una escisión. */
  to_asset_id?: AssetId;
  ratio?: RatioString;
  /** Escisión: parte del coste que viaja al activo nuevo, en [0, 1]. */
  cost_share?: DecimalString;
  /** Liquidación en efectivo de los picos o del cierre, cuando el `kind` la admite. */
  cash?: {
    unit_price: DecimalString;
    currency: Currency;
    fx_rate: DecimalString;
    fx_rate_date: CivilDate;
    /** Comisión por cuenta, la misma para todas; ausente si no hay. */
    fee?: DecimalString;
  };
}

export interface CorporateActionDraft {
  draft: Draft<CorporateActionEvent>;
  /** Cuentas con picos y cuánto se vende en cada una; vacío cuando no hay picos. */
  fractional: { account_id: AccountId; quantity: DecimalString }[];
  /** Por qué no se ha generado la venta forzosa, cuando el `kind` la admitía y no hay picos. */
  no_fractional_reason?: "no_fractions";
}

export const corporateActionDraft = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  params: CorporateActionParams,
): CorporateActionDraft;
```

Garantías:

1. La secuencia de efectos que produce **pasa `checkEffectsAgainstKind`** por construcción; si los parámetros no bastan para el `kind`, lanza el mismo `ValidationError` que hoy lanza la CLI.
2. El cálculo de picos es el de hoy, trasladado sin cambios de comportamiento: los tests de `apps/cli/test/commands/corporate-actions.test.ts` son el guardián de que no se mueve nada.
3. `source_document` es obligatorio aquí también: sin él no hay borrador.
4. La CLI pasa a componer con esta función y sus nueve asistentes se quedan en el mapeo de banderas a `CorporateActionParams`.

**Esto toca la CLI y no estaba en el alcance literal del prompt.** Por eso es la pregunta **Q4**, con su alternativa escrita.
