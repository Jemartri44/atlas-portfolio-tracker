// Spanish names for every event type and every field of the schema. The detail
// screen shows a ledger line with legible names, so a field the schema gains
// and this catalogue forgets would be painted as `snake_case` at the user: a
// test compares this against `knownFieldsOf` for every type and fails.
//
// The domain speaks English by contract (`errors.ts`); translating is the
// interface's job, and each interface does it its own way (decision (i)).
//
// LINE BUDGET: six dictionaries — event types, fields, values, settings,
// platforms and states — and nothing else. They are the vocabulary of the
// screens and a reviewer reads them as one list; splitting them would only
// move the drift test's target around.

/** Event types, as a person names the operation. */
export const EVENT_LABELS: Record<string, string> = {
  account_created: "Alta de cuenta",
  account_updated: "Cambio de cuenta",
  asset_created: "Alta de activo",
  asset_updated: "Cambio de activo",
  settings_changed: "Cambio de configuración",
  buy: "Compra",
  sell: "Venta",
  swap: "Permuta",
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
  tax_return_filed: "Declaración presentada",
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
  book: "Cartera",
  base_currency: "Divisa de la cuenta",
  country: "País",
  active: "Activa",
  // Catalogue: assets
  asset_id: "Activo",
  asset_type: "Tipo de activo",
  asset_class: "Clase de activo",
  isin: "ISIN",
  market: "Mercado",
  // A swap reuses the vocabulary of a transfer (`from_*`, `quantity_out`), so
  // only what it adds needs a name of its own.
  market_value_out: "Valor de mercado de lo entregado",
  market_value_in: "Valor de mercado de lo recibido",
  fee_kind: "Tipo de comisión",
  neutrality_regime: "Régimen de neutralidad",
  income_eur: "Renta imputada (€)",
  income_base: "Base de la renta",
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
  // What was filed (ADR-0020)
  model: "Modelo",
  tax_year: "Ejercicio",
  filed_at: "Presentada el",
  receipt_reference: "Justificante",
  supersedes: "Sustituye a",
  declared: "Lo presentado",
  computed: "Lo calculado entonces",
  ledger_fingerprint: "Huella de tus datos",
  // Rectification
  reverses_id: "Anula a",
  reason: "Motivo",
};

export const fieldLabel = (field: string): string => FIELD_LABELS[field] ?? field;

/** Values of the enumerations, in Spanish. */
export const VALUE_LABELS: Record<string, string> = {
  core: "Cartera principal",
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
  general: "Base general",
  savings: "Base del ahorro",
  custody: "Custodia",
  administration: "Administración",
  connectivity: "Conectividad y datos de mercado",
  discretionary_management: "Gestión discrecional",
  other: "Otra",
  requested: "Solicitado",
  // The returns a filing may record (ADR-0020). The two forms are known by
  // their number, so they are said as the tax agency says them.
  renta: "Renta",
  "720": "Modelo 720",
  "721": "Modelo 721",
  accounts: "Cuentas",
  securities: "Valores",
  // The scheduled jobs and their frequencies (settings, `job_frequencies`).
  prices: "Precios",
  reminder: "Recordatorio",
  reconciliation: "Conciliación",
  daily: "Diaria",
  weekly: "Semanal",
  monthly: "Mensual",
  quarterly: "Trimestral",
  yearly: "Anual",
  capital_gain: "Ganancia patrimonial",
  movable_capital: "Rendimiento del capital mobiliario",
  // Corporate actions, by kind: the detail and the list said "reverse_split".
  split: "Split",
  reverse_split: "Contrasplit",
  stock_dividend: "Dividendo en acciones",
  merger: "Fusión",
  spin_off: "Escisión",
  fund_merger: "Fusión de fondos",
  share_class_change: "Cambio de clase",
  fund_liquidation: "Liquidación de un fondo",
  issuer_liquidation: "Liquidación del emisor",
  delisting: "Exclusión de cotización",
  crypto_fork: "Bifurcación de una cripto",
  token_migration: "Migración de token",
  issuer_restructuring: "Reestructuración del emisor",
  true: "Sí",
  false: "No",
};

export const valueLabel = (value: unknown): string => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return VALUE_LABELS[String(value)] ?? text ?? "";
};

/**
 * The settings, by the name the configuration screen gives them. A message
 * about a setting used to name it by its key — "deviation_threshold_pp debe
 * ser…" — which is the ledger talking, not the application.
 */
export const SETTING_LABELS: Record<string, string> = {
  fiscal_date_rule: "Fecha fiscal por tipo de activo",
  wash_sale_window: "Ventana de recompra por tipo de activo",
  income_category: "Tipo de renta por tipo de activo",
  wash_sale_window_days: "Ventana de recompra en días",
  wash_sale_transfer_counts: "Un traspaso entrante cuenta como recompra",
  target_weights: "Pesos objetivo",
  deviation_threshold_pp: "Umbral de desviación",
  satellite_min_weight_pct: "Mínimo de un satélite",
  monthly_contribution_eur: "Aportación mensual",
  bucket_pct_of_contribution: "Porcentaje de la aportación al cubo",
  bucket_max_cumulative_contribution: "Tope de aporte al cubo",
  bucket_stop_loss_pct: "Regla de parada del cubo",
  bucket_max_weight_pct: "Peso máximo del cubo",
  bucket_benchmark_asset_id: "Índice de referencia del cubo",
  stale_price_days: "Días para que un precio caduque",
  model_720_threshold_eur: "Umbral que obliga al Modelo 720",
  model_720_increase_eur: "Subida que obliga a repetir el Modelo 720",
  model_720_alert_threshold_eur: "Aviso previo del Modelo 720",
  model_721_threshold_eur: "Umbral que obliga al Modelo 721",
  model_721_increase_eur: "Subida que obliga a repetir el Modelo 721",
  model_721_alert_threshold_eur: "Aviso previo del Modelo 721",
  renta_season_start: "Inicio de la temporada de Renta",
  renta_season_end: "Fin de la temporada de Renta",
  savings_tax_brackets: "Tramos de la base del ahorro",
  tax_residence: "Residencia fiscal",
  notification_email: "Correo de avisos",
  job_frequencies: "Frecuencia de los avisos automáticos",
  transfer_max_days: "Días máximos de un traspaso",
};

export const settingLabel = (key: string): string => SETTING_LABELS[key] ?? key;

/**
 * The platforms the project integrates with, by their proper names. The ledger
 * keeps what was typed when the account was created (`myinvestor`, `ibkr`), and
 * the lists of accounts used to print it as it was: "myinvestor · ibkr" in
 * lower case, which reads like a configuration key. Anything else the user
 * typed is theirs and comes back untouched.
 */
const PLATFORMS: Record<string, string> = {
  myinvestor: "MyInvestor",
  ibkr: "Interactive Brokers",
};

export const platformLabel = (platform: string): string =>
  PLATFORMS[platform.trim().toLowerCase()] ?? platform;

/** State of an entry of the ledger, said with words and not only with a style. */
export const STATUS_LABELS: Record<string, string> = {
  current: "Vigente",
  reversed: "Anulado",
  reversal: "Es una anulación",
  correction: "Es una corrección",
};
