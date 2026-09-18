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

import { ASSET_CLASSES, ASSET_TYPES, BOOKS, ORDER_SIDES } from "@atlas/domain";

export type FieldKind = "text" | "textarea" | "decimal" | "integer" | "date" | "select" | "switch";

export type OptionSource =
  | "accounts"
  | "bucketAccounts"
  | "assets"
  | "currencies"
  | "openOrders"
  | "openTheses"
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
  /** Occupies the full width of the grid. */
  full?: boolean;
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

const asset = (): FieldSpec => ({
  name: "asset_id",
  label: "Activo",
  kind: "select",
  required: true,
  options: "assets",
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

const fxRate = (): FieldSpec[] => [
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
  ...fxRate(),
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

const cashFields = (): FieldSpec[] => [
  account(),
  { name: "value_date", label: "Fecha valor", kind: "date", required: true },
  { name: "amount", label: "Importe", kind: "decimal", required: true },
  { ...currency(), derive: "accountCurrency", hint: "La de la cuenta." },
  ...fxRate(),
  notes(),
];

export const FORM_SPECS: readonly EventFormSpec[] = [
  {
    slug: "buy",
    type: "buy",
    title: "Compra",
    when: "Has comprado participaciones, acciones o unidades.",
    fields: [
      ...tradeFields(),
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
        hint: "Obligatoria en el cubo (regla 15): se abre antes de comprar.",
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
      ...fxRate(),
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
      ...fxRate(),
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
      asset(),
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
        hint: "Corto y estable, como acc_mi. No se puede cambiar después.",
      },
      { name: "name", label: "Nombre", kind: "text", required: true },
      { name: "platform", label: "Plataforma", kind: "text", required: true },
      {
        name: "book",
        label: "Libro",
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
        hint: "Corto y estable, como ast_world. No se puede cambiar después.",
      },
      {
        name: "asset_type",
        label: "Tipo de activo",
        kind: "select",
        required: true,
        values: ASSET_TYPES,
        initial: "fund",
        hint: "Decide la fecha fiscal y la ventana de recompra (ADR-0013).",
      },
      {
        name: "book",
        label: "Libro",
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
        hint: "Solo en el núcleo: es la clase sobre la que se aplican los pesos objetivo.",
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
      {
        name: "ter",
        label: "TER",
        kind: "decimal",
        hint: "En porcentaje anual, por ejemplo 0.12.",
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
