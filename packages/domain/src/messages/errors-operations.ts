// Errors of operations: positions and lots, transfers, exchange rates, orders and transfer requests.

import type { Details, Entry, Voice } from "./voice.js";

/** The stage of an order or request in Spanish; the console's word is the ledger's English one. */
const stage = (d: Details, v: Voice): string =>
  d.stage === "cancelled" ? "cancelada" : v.word(d.stage);

export const ERRORS_OPERATIONS: Record<string, Entry> = {
  insufficient_position: (d, v) =>
    `La cuenta ${v.one(d.account_id)} no tiene suficiente ${v.one(d.asset_id)} en esa fecha (disponibles: ${v.titles(d.available)}).`,
  insufficient_lots: (d, v) =>
    `Los lotes abiertos de ${v.one(d.asset_id)} no cubren la cantidad (abiertos: ${v.titles(d.open ?? d.missing)}).`,
  missing_basis: {
    say: () => "Falta la base de la operación: indica el importe liquidado o el precio unitario.",
    cli: (d, v) =>
      `${d.type === undefined ? "" : `(${v.text(d.type)}) `}Indica --amount o --unit-price.`,
  },
  not_transferable: (d, v) =>
    d.asset_id === undefined
      ? "Un traspaso fiscal exige que los dos activos sean traspasables."
      : `El activo ${v.one(d.asset_id)} no es traspasable: el diferimiento solo existe entre fondos de inversión; registra una venta y una compra.`,
  transfer_not_resident: (d, v) =>
    `Tu residencia fiscal no es España${d.tax_residence === undefined ? "" : ` (${v.text(d.tax_residence)})`}: el diferimiento del traspaso solo existe para residentes en España.`,
  not_core_asset: (d, v) =>
    `El activo ${v.one(d.asset_id)} no pertenece a la cartera principal: el simulador de traspaso solo opera sobre ella.`,
  eur_fx_rate_not_one: (d, v) =>
    `${v.field(d.field)} debe ser exactamente 1 cuando la divisa es el euro (recibido: ${v.num(d.value)}): el BCE no publica un tipo del euro contra sí mismo.`,
  fx_rate_date_weekend: (d, v) =>
    `${v.field(d.field)} (${v.date(d.value)}) cae en fin de semana y el BCE no publica: usa el último día hábil anterior.`,
  transfer_fee_not_allowed: {
    say: () =>
      "Un traspaso no lleva comisión: registra el cargo del depositario como una comisión aparte.",
    cli: () => "Es una standalone_fee: atlas add fee.",
  },
  currency_mismatch: (d, v) => `No se pueden operar ${v.text(d.left)} con ${v.text(d.right)}.`,
  division_by_zero: () => "División por cero en un cálculo interno: no se ha registrado nada.",
  invalid_amount: (d, v) => `El importe debe ser mayor que cero (recibido: ${v.money(d.value)}).`,
  invalid_quantity: (d, v) =>
    `La cantidad debe ser mayor que cero (recibido: ${v.titles(d.value)}).`,
  broker_settled_eur_in_eur: {
    say: () =>
      "Lo liquidado por el bróker en euros solo se indica en una operación en otra divisa: en euros repetiría el importe.",
    cli: () => "(--broker-settled-eur)",
  },
  broker_settled_eur_negative: {
    say: () =>
      "Lo liquidado por el bróker en euros nunca es negativo: el sentido lo da el tipo de movimiento. Indica lo que movió el bróker, sin signo.",
    cli: () => "(--broker-settled-eur)",
  },
  broker_settled_eur_zero: {
    say: () =>
      "Lo liquidado por el bróker en euros no puede ser cero en una compra, una venta o una comisión. Si el extracto no da la cifra, déjalo vacío: sin él, la cifra queda como desconocida.",
    cli: () => "(--broker-settled-eur)",
  },
  unknown_order: {
    say: () => "La orden elegida no existe en esa fecha.",
    cli: (d, v) => `Orden: ${v.text(d.order_id)}.`,
  },
  order_closed: {
    say: (d, v) =>
      d.stage === "filled"
        ? "La orden elegida ya se ejecutó: otra operación la cerró."
        : `La orden elegida está ${stage(d, v)}: ya no se puede ejecutar.`,
    cli: (d, v) => `Orden: ${v.text(d.order_id)}.`,
  },
  order_mismatch: {
    say: () =>
      "La orden elegida no coincide con la cuenta, el activo o el sentido de la operación.",
    cli: (d, v) => `Orden: ${v.text(d.order_id)}.`,
  },
  unknown_request: {
    say: () => "La solicitud de traspaso elegida no existe en esa fecha.",
    cli: (d, v) => `Solicitud: ${v.text(d.request_id)}.`,
  },
  request_closed: {
    say: (d, v) =>
      d.stage === "completed"
        ? "La solicitud de traspaso elegida ya se completó."
        : `La solicitud de traspaso elegida está ${stage(d, v)}: ya no admite más pasos.`,
    cli: (d, v) => `Solicitud: ${v.text(d.request_id)}.`,
  },
  request_mismatch: {
    say: () => "La solicitud de traspaso elegida se refiere a otras cuentas o a otros fondos.",
    cli: (d, v) => `Solicitud: ${v.text(d.request_id)}.`,
  },
};
