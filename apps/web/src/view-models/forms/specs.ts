// The forms, described as data.
//
// Same idea as `ADD_SPECS` in the CLI: what a form is made of is a list of
// fields, not a hand-written component per event. A generic renderer paints it,
// and a test compares each spec against `knownFieldsOf(type)` of the domain, so
// a field the schema gains and a form forgets makes the suite fail (FR-048).
//
// The specs carry no validation: they say what to ask, with which keyboard and
// from which list to choose. Whether the value is acceptable is decided by
// `validateShape` and the projection, never here (decision (c)).
//
// LINE BUDGET: this file is a **data table**, not logic. It is one entry per
// form, each one a list of fields with its label, its keyboard and the list it
// chooses from — and the value of having them in one place is exactly that they
// can be read side by side. Splitting it by event type would scatter fourteen
// tables across fourteen files and make "does every form cover every field of
// the schema" a question nobody can answer by looking. The logic that reads it
// lives in `values.ts` and in `routes/registrar/FormFields.tsx`, both small.

import {
  ASSET_CLASSES,
  ASSET_TYPES,
  BOOKS,
  ORDER_SIDES,
  TRANSFER_REQUEST_STAGES,
} from "@atlas/domain";

export type FieldKind = "text" | "textarea" | "decimal" | "integer" | "date" | "select" | "switch";

export type OptionSource =
  | "accounts"
  | "bucketAccounts"
  | "assets"
  | "bucketAssets"
  | "currencies"
  | "openOrders"
  | "openTheses"
  | "openTransfers"
  | "books"
  | "assetTypes"
  | "assetClasses"
  | "sides";

export interface FieldSpec {
  /** Field of the event, exactly as it goes into the ledger. */
  name: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  /** One line saying what it is or where it is copied from. */
  hint?: string;
  initial?: string;
  /** Fixed list of options, or the name of a catalogue list. */
  options?: OptionSource;
  /** Literal options, when the list is part of the schema. */
  values?: readonly string[];
  /** Shown only when another field has (or has not) a value. */
  visibleWhen?: { field: string; equals?: string; notEquals?: string };
  /** Copy the default from the chosen asset or account. */
  derive?: "assetCurrency" | "accountCurrency";
  /**
   * Field this one is filled from when it is hidden but the schema still
   * requires it: the value taken is the last working day on or before that
   * date. It exists for `fx_rate_date` in euros, which is not asked for and
   * used to end up missing from the draft altogether.
   */
  hiddenFrom?: string;
  /** Occupies the full width of the grid. */
  full?: boolean;
  /**
   * For a list of assets: the field (an account or an asset) whose **book** the
   * list is narrowed to. A core account never buys a bucket share.
   */
  bookFrom?: string;
  /**
   * For a list of assets: the account field whose positions let an **inactive**
   * asset in. A delisted share is still held, and it still needs a valuation.
   */
  heldFrom?: string;
  /** For a list of assets: an inactive asset held in **any** account is offered too. */
  heldAnywhere?: boolean;
  /**
   * For a list of assets: leave out one a corporate action converted into
   * another — a fund merged away, a share class that no longer exists — and
   * that holds nothing (`view-models/weighted.ts`). It cannot be bought, and
   * offering it invites the mistake (review of 2026-09-19).
   */
  liveOnly?: boolean;
}

export interface EventFormSpec {
  /** Segment of the URL: /registrar/<slug>. */
  slug: string;
  /** Event type it writes. */
  type: string;
  title: string;
  /** One line about when it is used, for the chooser screen. */
  when: string;
  fields: FieldSpec[];
  /** Fields of the schema this form leaves out on purpose, with the reason. */
  omitted: { name: string; reason: string }[];
}

const account = (): FieldSpec => ({
  name: "account_id",
  label: "Cuenta",
  kind: "select",
  required: true,
  options: "accounts",
});

const asset = (account = "account_id"): FieldSpec => ({
  name: "asset_id",
  label: "Activo",
  kind: "select",
  required: true,
  options: "assets",
  bookFrom: account,
  heldFrom: account,
});

/** Where something arrives: active assets of the destination account's book, never a delisted one. */
const destinationAsset = (): FieldSpec => ({
  name: "to_asset_id",
  label: "Activo de destino",
  kind: "select",
  required: true,
  options: "assets",
  bookFrom: "to_account_id",
});

const currency = (): FieldSpec => ({
  name: "currency",
  label: "Divisa",
  kind: "select",
  required: true,
  options: "currencies",
  initial: "EUR",
  derive: "assetCurrency",
  hint: "La del activo; el euro no lleva tipo de cambio.",
});

/**
 * The ECB rate and its date, hidden when the currency is the euro because
 * neither is asked for: the rate is "1" and the date is taken from `dateField`.
 *
 * `dateField` is the **earliest** business date of the form (`trade_date` where
 * there is one), so the date taken can never be later than the fiscal date and
 * the `fx_rate_date_after_fiscal_date` warning is never raised by a value the
 * user did not type.
 */
const fxRate = (dateField: string): FieldSpec[] => [
  {
    name: "fx_rate",
    label: "Tipo del BCE",
    kind: "decimal",
    required: true,
    initial: "1",
    hint: "Tal como lo publica el BCE: unidades de la divisa por euro.",
    visibleWhen: { field: "currency", notEquals: "EUR" },
  },
  {
    name: "fx_rate_date",
    label: "Fecha del tipo",
    kind: "date",
    required: true,
    hint: "La del tipo aplicado; el BCE no publica sábados ni domingos.",
    visibleWhen: { field: "currency", notEquals: "EUR" },
    hiddenFrom: dateField,
  },
];

const notes = (): FieldSpec => ({
  name: "notes",
  label: "Notas",
  kind: "textarea",
  full: true,
});

const tradeFields = (): FieldSpec[] => [
  account(),
  asset(),
  {
    name: "trade_date",
    label: "Fecha de contratación",
    kind: "date",
    required: true,
    hint: "Cuando se dio la orden.",
  },
  {
    name: "value_date",
    label: "Fecha valor",
    kind: "date",
    required: true,
    hint: "Cuando liquidó. En fondos es la que manda para la fiscalidad.",
  },
  { name: "quantity", label: "Cantidad", kind: "decimal", required: true },
  {
    name: "unit_price",
    label: "Precio unitario",
    kind: "decimal",
    hint: "Obligatorio si no indicas el importe liquidado.",
  },
  {
    name: "amount",
    label: "Importe liquidado",
    kind: "decimal",
    hint: "Bruto, sin comisión. Si lo indicas, es la base de coste.",
  },
  currency(),
  ...fxRate("trade_date"),
  { name: "fee", label: "Comisión", kind: "decimal", initial: "0", required: true },
  { name: "broker_ref", label: "Referencia del bróker", kind: "text" },
  {
    name: "source",
    label: "Origen del dato",
    kind: "text",
    initial: "manual",
    required: true,
  },
  notes(),
];

/**
 * A purchase lists only the assets in force. A delisted one is still held,
 * still valued and still sold, but never bought again (review of 2026-09-18),
 * and one a merger or a class change converted away is not bought either
 * (`liveOnly`); a correction that already holds one keeps it on its list
 * (`choices.ts`).
 */
const buyFields = (): FieldSpec[] =>
  tradeFields().map((field) => {
    if (field.name !== "asset_id") {
      return field;
    }
    const { heldFrom: _held, ...inForce } = field;
    return { ...inForce, liveOnly: true };
  });

const cashFields = (): FieldSpec[] => [
  account(),
  { name: "value_date", label: "Fecha valor", kind: "date", required: true },
  { name: "amount", label: "Importe", kind: "decimal", required: true },
  { ...currency(), derive: "accountCurrency", hint: "La de la cuenta." },
  ...fxRate("value_date"),
  notes(),
];

export const FORM_SPECS: readonly EventFormSpec[] = [
  {
    slug: "buy",
    type: "buy",
    title: "Compra",
    when: "Has comprado participaciones, acciones o unidades.",
    fields: [
      ...buyFields(),
      {
        name: "order_id",
        label: "Orden que cierra",
        kind: "select",
        options: "openOrders",
        hint: "Si la compra ejecuta una orden que diste antes.",
      },
      {
        name: "thesis_id",
        label: "Tesis",
        kind: "select",
        options: "openTheses",
        hint: "Obligatoria en el cubo: se abre antes de comprar.",
      },
    ],
    omitted: [],
  },
  {
    slug: "sell",
    type: "sell",
    title: "Venta",
    when: "Has vendido o reembolsado.",
    fields: [
      ...tradeFields(),
      {
        name: "withholding",
        label: "Retención",
        kind: "decimal",
        hint: "Si el bróker retuvo algo en la venta.",
      },
      { name: "order_id", label: "Orden que cierra", kind: "select", options: "openOrders" },
      { name: "thesis_id", label: "Tesis", kind: "select", options: "openTheses" },
    ],
    omitted: [],
  },
  {
    slug: "cash-in",
    type: "cash_deposit",
    title: "Ingreso de efectivo",
    when: "Has metido dinero en la cuenta de inversión.",
    fields: cashFields(),
    omitted: [],
  },
  {
    slug: "cash-out",
    type: "cash_withdrawal",
    title: "Retirada de efectivo",
    when: "Has sacado dinero de la cuenta de inversión.",
    fields: cashFields(),
    omitted: [],
  },
  {
    slug: "dividend",
    type: "dividend",
    title: "Dividendo",
    when: "Un activo ha pagado un dividendo.",
    fields: [
      account(),
      asset(),
      { name: "value_date", label: "Fecha valor", kind: "date", required: true },
      { name: "gross", label: "Importe bruto", kind: "decimal", required: true },
      {
        name: "withholding_origin",
        label: "Retención en origen",
        kind: "decimal",
        initial: "0",
        required: true,
      },
      {
        name: "withholding_spain",
        label: "Retención en España",
        kind: "decimal",
        initial: "0",
        required: true,
      },
      currency(),
      ...fxRate("value_date"),
      {
        name: "source_country",
        label: "País del pagador",
        kind: "text",
        hint: "Dos letras (ISO 3166-1): decide el convenio de doble imposición.",
      },
      { name: "per_unit", label: "Por título", kind: "decimal" },
      { name: "broker_ref", label: "Referencia del bróker", kind: "text" },
      notes(),
    ],
    omitted: [],
  },
  {
    slug: "valuation",
    type: "valuation",
    title: "Valoración",
    when: "Anotas el valor de un activo a una fecha (el precio del mes, el 31 de diciembre).",
    fields: [
      account(),
      asset(),
      { name: "date", label: "Fecha", kind: "date", required: true },
      { name: "quantity", label: "Cantidad", kind: "decimal", required: true },
      { name: "unit_value", label: "Valor unitario", kind: "decimal", required: true },
      currency(),
      ...fxRate("date"),
      {
        name: "source",
        label: "Origen del dato",
        kind: "text",
        initial: "manual",
        required: true,
        hint: "De dónde sale el precio: la plataforma, el folleto, la web del emisor.",
      },
    ],
    omitted: [],
  },
  {
    slug: "order",
    type: "order_placed",
    title: "Orden dada",
    when: "Has dado una orden que aún no ha ejecutado.",
    fields: [
      account(),
      // An order is placed on an asset that exists: never on one converted away.
      { ...asset(), liveOnly: true },
      {
        name: "side",
        label: "Sentido",
        kind: "select",
        required: true,
        values: ORDER_SIDES,
        initial: "buy",
      },
      { name: "requested_date", label: "Fecha de la solicitud", kind: "date", required: true },
      {
        name: "amount",
        label: "Importe pedido",
        kind: "decimal",
        hint: "En euros. Indica importe o cantidad, lo que hayas pedido.",
      },
      { name: "quantity", label: "Cantidad pedida", kind: "decimal" },
      notes(),
    ],
    omitted: [],
  },
  {
    slug: "cuenta",
    type: "account_created",
    title: "Alta de cuenta",
    when: "Abres una cuenta nueva en una plataforma.",
    fields: [
      {
        name: "account_id",
        label: "Identificador",
        kind: "text",
        required: true,
        hint: "Una clave corta y sin espacios, por ejemplo «indexados». No se puede cambiar después.",
      },
      { name: "name", label: "Nombre", kind: "text", required: true },
      { name: "platform", label: "Plataforma", kind: "text", required: true },
      {
        name: "book",
        label: "Cartera",
        kind: "select",
        required: true,
        values: BOOKS,
        initial: "core",
      },
      {
        name: "base_currency",
        label: "Divisa de la cuenta",
        kind: "select",
        required: true,
        options: "currencies",
        initial: "EUR",
      },
      {
        name: "country",
        label: "País",
        kind: "text",
        required: true,
        initial: "ES",
        hint: "Dos letras (ISO 3166-1): cuenta para el Modelo 720.",
      },
      { name: "active", label: "Activa", kind: "switch", initial: "true", required: true },
    ],
    omitted: [],
  },
  {
    slug: "activo",
    type: "asset_created",
    title: "Alta de activo",
    when: "Vas a operar un fondo, un ETF, un ETC, una acción o una cripto por primera vez.",
    fields: [
      {
        name: "asset_id",
        label: "Identificador",
        kind: "text",
        required: true,
        hint: "Una clave corta y sin espacios, por ejemplo «mundo». No se puede cambiar después.",
      },
      {
        name: "asset_type",
        label: "Tipo de activo",
        kind: "select",
        required: true,
        values: ASSET_TYPES,
        initial: "fund",
        hint: "Decide qué fecha cuenta para Hacienda y cuánto dura la ventana de recompra.",
      },
      {
        name: "book",
        label: "Cartera",
        kind: "select",
        required: true,
        values: BOOKS,
        initial: "core",
      },
      {
        name: "asset_class",
        label: "Clase de activo",
        kind: "select",
        values: ASSET_CLASSES,
        visibleWhen: { field: "book", equals: "core" },
        hint: "Solo en la cartera principal: es la clase sobre la que se aplican los pesos objetivo.",
      },
      { name: "name", label: "Nombre", kind: "text", required: true },
      {
        name: "currency",
        label: "Divisa",
        kind: "select",
        required: true,
        options: "currencies",
        initial: "EUR",
      },
      { name: "isin", label: "ISIN", kind: "text" },
      { name: "ticker", label: "Ticker", kind: "text" },
      // Optional and asked for only here, where the prospectus is in front of
      // the user: in three years neither can be reconstructed (ADR-0021).
      {
        name: "market",
        label: "Mercado",
        kind: "text",
        hint: "Dónde cotiza: código MIC (XMAD, XETR) o el nombre del mercado.",
      },
      {
        name: "issuer_country",
        label: "País del emisor",
        kind: "text",
        hint: "Dos letras, como en el folleto: IE, LU, JE. Es el domicilio, no el mercado.",
      },
      {
        name: "ter",
        label: "TER",
        kind: "decimal",
        hint: "En porcentaje anual, por ejemplo 0,12.",
      },
      {
        name: "transferable",
        label: "Traspasable",
        kind: "switch",
        initial: "false",
        required: true,
        hint: "Los fondos españoles sí; los ETF, ETC y acciones, no.",
      },
      {
        name: "reference_etf_id",
        label: "ETF de referencia",
        kind: "select",
        options: "assets",
        hint: "Para estimar el precio de un fondo entre valoraciones.",
      },
      { name: "active", label: "Activo", kind: "switch", initial: "true", required: true },
    ],
    omitted: [],
  },
  // --- Transfers (ADR-0010) -----------------------------------------------
  //
  // Three events, not one, because they are three different facts: the request
  // and its stages are **tracking** and touch no lot, and the transfer itself is
  // the single atomic accounting fact carrying both sides. Splitting the
  // accounting one in two would create a half-transfer, which the FIFO engine
  // would read as a sale — the mistake the whole model exists to prevent.
  {
    slug: "traspaso-solicitud",
    type: "transfer_requested",
    title: "Solicitar un traspaso",
    when: "Has pedido a la gestora mover un fondo a otro. Todavía no ha pasado nada.",
    fields: [
      { ...account(), name: "from_account_id", label: "Cuenta de origen" },
      { ...asset("from_account_id"), name: "from_asset_id", label: "Fondo de origen" },
      { ...account(), name: "to_account_id", label: "Cuenta de destino" },
      { ...destinationAsset(), label: "Fondo de destino" },
      {
        name: "quantity_out",
        label: "Participaciones",
        kind: "decimal",
        hint: "O el importe, si lo pediste en euros. Uno de los dos.",
      },
      { name: "amount_eur", label: "Importe en euros", kind: "decimal" },
      { name: "requested_date", label: "Fecha de la solicitud", kind: "date", required: true },
      notes(),
    ],
    omitted: [],
  },
  {
    slug: "traspaso-etapa",
    type: "transfer_request_updated",
    title: "Etapa de un traspaso",
    when: "La gestora ha reembolsado, ha suscrito o ha cancelado la solicitud.",
    fields: [
      {
        name: "request_id",
        label: "Solicitud",
        kind: "select",
        required: true,
        options: "openTransfers",
      },
      {
        name: "stage",
        label: "Etapa",
        kind: "select",
        required: true,
        values: TRANSFER_REQUEST_STAGES,
      },
      { name: "date", label: "Fecha", kind: "date", required: true },
      {
        name: "nav_out",
        label: "Valor liquidativo de salida",
        kind: "decimal",
        hint: "Si ya se conoce, al reembolsar.",
      },
      { name: "quantity_out", label: "Participaciones reembolsadas", kind: "decimal" },
      notes(),
    ],
    omitted: [],
  },
  {
    slug: "traspaso",
    type: "transfer",
    title: "Traspaso completado",
    when: "El dinero ya está en el fondo de destino. Un solo hecho, con sus dos lados.",
    fields: [
      {
        name: "request_id",
        label: "Solicitud que cierra",
        kind: "select",
        options: "openTransfers",
        hint: "La solicitud que este traspaso completa, si la registraste.",
      },
      { ...account(), name: "from_account_id", label: "Cuenta de origen" },
      { ...asset("from_account_id"), name: "from_asset_id", label: "Fondo de origen" },
      {
        name: "quantity_out",
        label: "Participaciones reembolsadas",
        kind: "decimal",
        required: true,
      },
      { name: "nav_out", label: "Valor liquidativo de salida", kind: "decimal" },
      { name: "value_date_out", label: "Fecha valor de salida", kind: "date", required: true },
      { ...account(), name: "to_account_id", label: "Cuenta de destino" },
      { ...destinationAsset(), label: "Fondo de destino" },
      {
        name: "quantity_in",
        label: "Participaciones suscritas",
        kind: "decimal",
        required: true,
      },
      { name: "nav_in", label: "Valor liquidativo de entrada", kind: "decimal" },
      { name: "value_date_in", label: "Fecha valor de entrada", kind: "date", required: true },
      notes(),
    ],
    // Nothing omitted: `fee` is not a field of a transfer at all. The
    // depositary's charge is a `standalone_fee`, and sending one here is
    // rejected by the domain (`transfer_fee_not_allowed`).
    omitted: [],
  },
  // --- Bucket theses (rule 15) --------------------------------------------
  {
    slug: "tesis",
    type: "thesis_opened",
    title: "Abrir una tesis",
    when: "Antes de comprar en el cubo. En el cubo no se compra sin una tesis escrita.",
    fields: [
      {
        name: "thesis_id",
        label: "Identificador",
        kind: "text",
        required: true,
        hint: "Una clave corta y sin espacios, por ejemplo «robotica-2026». Las compras se enlazan a ella.",
      },
      { ...account(), name: "account_id", label: "Cuenta del cubo", options: "bucketAccounts" },
      { ...asset(), options: "bucketAssets" },
      {
        name: "hypothesis",
        label: "Hipótesis",
        kind: "textarea",
        required: true,
        full: true,
        hint: "Qué crees que va a pasar y por qué.",
      },
      {
        name: "expected_horizon_days",
        label: "Plazo previsto (días)",
        kind: "integer",
        required: true,
      },
      {
        name: "invalidation",
        label: "Condición de invalidación",
        kind: "textarea",
        required: true,
        full: true,
        hint: "Qué te haría estar equivocado. Se muestra cada vez que mires la posición.",
      },
      { name: "planned_size_eur", label: "Tamaño previsto", kind: "decimal", required: true },
    ],
    omitted: [],
  },
  {
    slug: "tesis-cierre",
    type: "thesis_closed",
    title: "Cerrar una tesis",
    when: "La has cerrado: salió bien, salió mal o se invalidó.",
    fields: [
      {
        name: "thesis_id",
        label: "Tesis",
        kind: "select",
        required: true,
        options: "openTheses",
      },
      {
        name: "closing_notes",
        label: "Cómo acabó",
        kind: "textarea",
        required: true,
        full: true,
        hint: "Qué pasó y qué aprendiste. Es lo que hace útil el registro dentro de un año.",
      },
    ],
    omitted: [],
  },
];

export const formSpec = (slug: string): EventFormSpec | undefined =>
  FORM_SPECS.find((spec) => spec.slug === slug);

/** Fields of the envelope: the use case fills them, no form asks for them. */
export const ENVELOPE_FIELDS: readonly string[] = [
  "schema_version",
  "id",
  "recorded_at",
  "type",
  "corrects_id",
  "fingerprint",
];
