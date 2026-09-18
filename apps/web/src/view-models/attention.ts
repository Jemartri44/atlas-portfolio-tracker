// "What needs attention", ordered by importance and with somewhere to go.
//
// The order is **presentation**: it decides what the user looks at first, not
// what is true, and the domain does not order warnings. The texts come from the
// message catalogue and the destinations from the table below, which is what
// makes SC-008 checkable — every code shown has a screen where it is fixed.

import type { IntegrityFinding, OpenOrder, OpenTransfer, Warning } from "@atlas/domain";
import { describeWarning } from "../format/messages/warnings.js";
import { type NameIndex, NO_NAMES } from "../format/names.js";

export type AttentionSeverity = "error" | "warning" | "info";

export interface AttentionItem {
  code: string;
  severity: AttentionSeverity;
  message: string;
  action: { label: string; to: string };
  /** Rank inside the list; lower comes first. */
  rank: number;
}

/** Where each code is fixed. A code missing from here is a bug the test catches. */
const DESTINATIONS: Record<string, { label: string; to: string }> = {
  invalid_events: { label: "Ver la verificación", to: "/ajustes/verificacion" },
  integrity_finding: { label: "Ver la verificación", to: "/ajustes/verificacion" },
  export_overdue: { label: "Exportar el libro", to: "/ajustes" },
  // Prices and rates are fixed by recording a valuation.
  stale_price: { label: "Registrar valoración", to: "/registrar/valuation" },
  stale_fx_rate: { label: "Registrar valoración", to: "/registrar/valuation" },
  partial_core_total: { label: "Registrar valoración", to: "/registrar/valuation" },
  partial_bucket_total: { label: "Registrar valoración", to: "/registrar/valuation" },
  partial_net_worth: { label: "Registrar valoración", to: "/registrar/valuation" },
  missing_benchmark_price: { label: "Registrar valoración", to: "/registrar/valuation" },
  // Portfolio rules: the core and the bucket screens (next feature) explain them.
  deviation_above_threshold: { label: "Ver el núcleo", to: "/nucleo" },
  satellite_below_minimum: { label: "Ver el núcleo", to: "/nucleo" },
  asset_without_target: { label: "Revisar la configuración", to: "/ajustes/configuracion" },
  unknown_target_weight: { label: "Revisar la configuración", to: "/ajustes/configuracion" },
  missing_benchmark_asset: { label: "Revisar la configuración", to: "/ajustes/configuracion" },
  unknown_benchmark_asset: { label: "Revisar la configuración", to: "/ajustes/configuracion" },
  bucket_stop_loss_reached: { label: "Ver el cubo", to: "/cubo" },
  bucket_stop_loss_not_evaluated: { label: "Ver el cubo", to: "/cubo" },
  bucket_weight_exceeded: { label: "Ver el cubo", to: "/cubo" },
  bucket_weight_not_evaluated: { label: "Ver el cubo", to: "/cubo" },
  bucket_contribution_exceeded: { label: "Ver el cubo", to: "/cubo" },
  bucket_contribution_near_limit: { label: "Ver el cubo", to: "/cubo" },
  bucket_contaminated_theses: { label: "Ver el cubo", to: "/cubo" },
  bucket_sample_too_small: { label: "Ver el cubo", to: "/cubo" },
  sell_without_thesis: { label: "Ver el cubo", to: "/cubo" },
  thesis_size_exceeded: { label: "Ver el cubo", to: "/cubo" },
  thesis_closed_with_position: { label: "Ver el cubo", to: "/cubo" },
  // The rest are read on the event itself.
  wash_sale_window_repurchase: { label: "Ver movimientos", to: "/movimientos" },
  wash_sale_window_prior_buy: { label: "Ver movimientos", to: "/movimientos" },
  currency_mismatch: { label: "Ver movimientos", to: "/movimientos" },
  fx_rate_date_after_fiscal_date: { label: "Ver movimientos", to: "/movimientos" },
  same_asset_two_accounts: { label: "Ver movimientos", to: "/movimientos" },
  pending_orders: { label: "Ver movimientos", to: "/movimientos?tipo=order_placed" },
  pending_transfers: { label: "Ver movimientos", to: "/movimientos?tipo=transfer_requested" },
};

/**
 * Importance, top to bottom: a degraded ledger (nothing can be recorded), the
 * conduct rules of the plan that are already breached, the fiscal cost already
 * incurred, what is pending with the broker, and what is missing in order to be
 * able to compute at all.
 */
const RANKS: readonly string[] = [
  "invalid_events",
  "integrity_finding",
  "bucket_stop_loss_reached",
  "bucket_contribution_exceeded",
  "deviation_above_threshold",
  "satellite_below_minimum",
  "bucket_weight_exceeded",
  "bucket_contribution_near_limit",
  "wash_sale_window_repurchase",
  "wash_sale_window_prior_buy",
  "thesis_size_exceeded",
  "sell_without_thesis",
  "thesis_closed_with_position",
  "currency_mismatch",
  "fx_rate_date_after_fiscal_date",
  "same_asset_two_accounts",
  "pending_orders",
  "pending_transfers",
  "export_overdue",
  "stale_price",
  "stale_fx_rate",
  "partial_core_total",
  "partial_bucket_total",
  "partial_net_worth",
  "unknown_target_weight",
  "asset_without_target",
  "missing_benchmark_asset",
  "unknown_benchmark_asset",
  "missing_benchmark_price",
  "bucket_stop_loss_not_evaluated",
  "bucket_weight_not_evaluated",
  "bucket_contaminated_theses",
  "bucket_sample_too_small",
];

const SEVERITIES: Record<string, AttentionSeverity> = {
  invalid_events: "error",
  integrity_finding: "error",
  bucket_stop_loss_reached: "error",
  bucket_contribution_exceeded: "error",
  export_overdue: "warning",
  deviation_above_threshold: "warning",
  satellite_below_minimum: "warning",
  bucket_weight_exceeded: "warning",
  bucket_contribution_near_limit: "warning",
  wash_sale_window_repurchase: "warning",
  wash_sale_window_prior_buy: "warning",
  stale_price: "warning",
  stale_fx_rate: "warning",
};

const rankOf = (code: string): number => {
  const index = RANKS.indexOf(code);
  return index === -1 ? RANKS.length : index;
};

const severityOf = (code: string): AttentionSeverity => SEVERITIES[code] ?? "info";

const FALLBACK = { label: "Ver movimientos", to: "/movimientos" };

export interface AttentionInput {
  /** Invalid events of the degraded projection (ADR-0015). */
  invalidCount: number;
  /** Projection warnings plus those of the views the summary shows. */
  warnings: readonly Warning[];
  findings: readonly IntegrityFinding[];
  openOrders: readonly OpenOrder[];
  openTransfers: readonly OpenTransfer[];
  /** Days without exporting, when the ledger lives in the browser (ADR-0019). */
  exportOverdueDays?: number | "never";
  /** The catalogue, so a warning names the asset instead of its identifier. */
  names?: NameIndex;
}

const itemOf = (code: string, message: string): AttentionItem => ({
  code,
  severity: severityOf(code),
  message,
  action: DESTINATIONS[code] ?? FALLBACK,
  rank: rankOf(code),
});

export const attentionItems = (input: AttentionInput): AttentionItem[] => {
  const items: AttentionItem[] = [];

  if (input.invalidCount > 0) {
    items.push(
      itemOf(
        "invalid_events",
        `${input.invalidCount} ${
          input.invalidCount === 1 ? "evento inválido" : "eventos inválidos"
        } en el libro: las consultas siguen, registrar no (ADR-0015).`,
      ),
    );
  }

  for (const finding of input.findings) {
    items.push(
      itemOf(
        "integrity_finding",
        `${finding.code}: ${finding.message}${
          finding.event_ids.length === 0 ? "" : ` (${finding.event_ids.join(", ")})`
        }`,
      ),
    );
  }

  // One entry per distinct warning; the domain can repeat a code per asset.
  const seen = new Set<string>();
  for (const warning of input.warnings) {
    const key = `${warning.code}|${warning.details.asset_id ?? ""}|${warning.details.asset_class ?? ""}|${warning.details.currency ?? ""}|${warning.event_id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(itemOf(warning.code, describeWarning(warning, input.names ?? NO_NAMES)));
  }

  if (input.openOrders.length > 0) {
    const oldest = input.openOrders.reduce((max, order) => Math.max(max, order.days_open), 0);
    items.push(
      itemOf(
        "pending_orders",
        `${input.openOrders.length} ${
          input.openOrders.length === 1 ? "orden dada sin ejecutar" : "órdenes dadas sin ejecutar"
        }; la más antigua lleva ${oldest} días.`,
      ),
    );
  }

  if (input.openTransfers.length > 0) {
    const oldest = input.openTransfers.reduce((max, entry) => Math.max(max, entry.days_open), 0);
    items.push(
      itemOf(
        "pending_transfers",
        `${input.openTransfers.length} ${
          input.openTransfers.length === 1 ? "traspaso en curso" : "traspasos en curso"
        }; el más antiguo lleva ${oldest} días.`,
      ),
    );
  }

  if (input.exportOverdueDays !== undefined) {
    items.push(
      itemOf(
        "export_overdue",
        input.exportOverdueDays === "never"
          ? "El libro vive en el navegador y nunca se ha exportado: si borras los datos del sitio, se pierde."
          : `El libro vive en el navegador y la última exportación es de hace ${input.exportOverdueDays} días.`,
      ),
    );
  }

  const order: Record<AttentionSeverity, number> = { error: 0, warning: 1, info: 2 };
  return items.sort(
    (a, b) =>
      order[a.severity] - order[b.severity] ||
      a.rank - b.rank ||
      a.message.localeCompare(b.message),
  );
};

/** Every code this module can show, for the test that checks they all have a destination. */
export const ATTENTION_CODES: readonly string[] = RANKS;

export const attentionDestination = (code: string): { label: string; to: string } | undefined =>
  DESTINATIONS[code];
