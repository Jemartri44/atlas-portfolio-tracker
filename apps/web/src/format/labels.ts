// Spanish names for every event type and every field of the schema. The detail
// screen shows a ledger line with legible names, so a field the schema gains
// and this catalogue forgets would be painted as `snake_case` at the user: a
// test compares this against `knownFieldsOf` for every type and fails.
//
// The domain speaks English by contract (`errors.ts`); translating is the
// interface's job, and each interface does it its own way (decision (i)).

/** Event types, as a person names the operation. */
export const EVENT_LABELS: Record<string, string> = {
  account_created: "Alta de cuenta",
  account_updated: "Cambio de cuenta",
  asset_created: "Alta de activo",
  asset_updated: "Cambio de activo",
  settings_changed: "Cambio de configuración",
  buy: "Compra",
  sell: "Venta",
  transfer: "Traspaso",
  order_placed: "Orden dada",
  order_updated: "Cambio de orden",
  transfer_requested: "Traspaso solicitado",
  transfer_request_updated: "Cambio del traspaso",
  dividend: "Dividendo",
  interest: "Interés",
  fx_exchange: "Cambio de divisa",
  cash_deposit: "Ingreso de efectivo",
  cash_withdrawal: "Retirada de efectivo",
  standalone_fee: "Comisión",
  valuation: "Valoración",
  corporate_action: "Evento corporativo",
  thesis_opened: "Tesis abierta",
  thesis_closed: "Tesis cerrada",
  reversal: "Anulación",
};

export const eventLabel = (type: string): string => EVENT_LABELS[type] ?? type;

/** Field names. Covers the whole schema, envelope included. */
export const FIELD_LABELS: Record<string, string> = {
  // Envelope
  schema_version: "Versión del esquema",
  id: "Identificador",
  recorded_at: "Registrado el",
  type: "Tipo",
  corrects_id: "Corrige a",
  fingerprint: "Huella",
  // Catalogue: accounts
  account_id: "Cuenta",
  name: "Nombre",
  platform: "Plataforma",
  book: "Libro",
  base_currency: "Divisa de la cuenta",
  country: "País",
  active: "Activa",
  // Catalogue: assets
  asset_id: "Activo",
  asset_type: "Tipo de activo",
  asset_class: "Clase de activo",
  isin: "ISIN",
  market: "Mercado",
  fee_kind: "Tipo de comisión",
  issuer_country: "País del emisor",
  ticker: "Ticker",
  currency: "Divisa",
  ter: "TER",
  transferable: "Traspasable",
  reference_etf_id: "ETF de referencia",
  // Settings
  settings: "Configuración",
  // Operations
  trade_date: "Fecha de contratación",
  value_date: "Fecha valor",
  date: "Fecha",
  quantity: "Cantidad",
  unit_price: "Precio unitario",
  unit_value: "Valor unitario",
  amount: "Importe",
  amount_eur: "Importe en euros",
  fx_rate: "Tipo del BCE",
  fx_rate_date: "Fecha del tipo",
  fee: "Comisión",
  fee_currency: "Divisa de la comisión",
  broker_ref: "Referencia del bróker",
  source: "Origen del dato",
  notes: "Notas",
  description: "Concepto",
  withholding: "Retención",
  gross: "Importe bruto",
  withholding_origin: "Retención en origen",
  withholding_spain: "Retención en España",
  source_country: "País del pagador",
  per_unit: "Por título",
  // Transfers
  request_id: "Solicitud de traspaso",
  from_account_id: "Cuenta de origen",
  from_asset_id: "Activo de origen",
  to_account_id: "Cuenta de destino",
  to_asset_id: "Activo de destino",
  quantity_out: "Cantidad que sale",
  quantity_in: "Cantidad que entra",
  nav_out: "Valor liquidativo de salida",
  nav_in: "Valor liquidativo de entrada",
  value_date_out: "Fecha valor de salida",
  value_date_in: "Fecha valor de entrada",
  // Currency exchange
  sold_amount: "Importe vendido",
  sold_currency: "Divisa vendida",
  bought_amount: "Importe comprado",
  bought_currency: "Divisa comprada",
  fx_rate_sold: "Tipo de la divisa vendida",
  fx_rate_bought: "Tipo de la divisa comprada",
  // Orders
  side: "Sentido",
  requested_date: "Fecha de la solicitud",
  order_id: "Orden",
  stage: "Estado",
  // Corporate actions
  kind: "Subtipo",
  effective_date: "Fecha de efecto",
  source_document: "Fuente documental",
  effects: "Efectos",
  // Theses
  thesis_id: "Tesis",
  hypothesis: "Hipótesis",
  expected_horizon_days: "Plazo previsto (días)",
  invalidation: "Condición de invalidación",
  planned_size_eur: "Tamaño previsto",
  closing_notes: "Notas de cierre",
  // Rectification
  reverses_id: "Anula a",
  reason: "Motivo",
};

export const fieldLabel = (field: string): string => FIELD_LABELS[field] ?? field;

/** Values of the enumerations, in Spanish. */
export const VALUE_LABELS: Record<string, string> = {
  core: "Núcleo",
  bucket: "Cubo",
  equity: "Renta variable",
  fixed_income: "Renta fija",
  gold: "Oro",
  crypto: "Cripto",
  fund: "Fondo",
  etf: "ETF",
  etc: "ETC",
  etp: "ETP",
  stock: "Acción",
  money_market: "Monetario",
  buy: "Compra",
  sell: "Venta",
  cancelled: "Cancelada",
  note: "Nota",
  redeemed: "Reembolsado",
  subscribed: "Suscrito",
  trade_date: "Fecha de contratación",
  value_date: "Fecha valor",
  custody: "Custodia",
  administration: "Administración",
  connectivity: "Conectividad y datos de mercado",
  discretionary_management: "Gestión discrecional",
  other: "Otra",
  true: "Sí",
  false: "No",
};

export const valueLabel = (value: unknown): string => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return VALUE_LABELS[String(value)] ?? text ?? "";
};

/** State of an entry of the ledger, said with words and not only with a style. */
export const STATUS_LABELS: Record<string, string> = {
  current: "Vigente",
  reversed: "Anulado",
  reversal: "Es una anulación",
  correction: "Es una corrección",
};
