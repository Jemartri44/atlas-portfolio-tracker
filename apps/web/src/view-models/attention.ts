// "What needs attention", ordered by importance and with somewhere to go.
//
// The order is **presentation**: it decides what the user looks at first, not
// what is true, and the domain does not order warnings. The texts come from the
// message catalogue and the destinations from the table below, which is what
// makes SC-008 checkable — every code shown has a screen where it is fixed.
//
// LINE BUDGET: three tables — where each code is fixed, how important it is
// and how severe — that have to be read side by side to review the order of the
// list, plus the forty lines that apply them. Splitting the tables from the
// function would leave two halves that only make sense together.

import {
  type CivilDate,
  type IntegrityFinding,
  type OpenOrder,
  type OpenTransfer,
  type Warning,
  type WashSaleWindow,
  washSaleWindowEnd,
} from "@atlas/domain";
import { describeFinding } from "../format/messages/findings.js";
import { describeWarning, describeWarningGroup } from "../format/messages/warnings.js";
import type { NameIndex } from "../format/names.js";
import { countOf } from "../format/number.js";

export type AttentionSeverity = "error" | "warning" | "info";

export interface AttentionItem {
  code: string;
  severity: AttentionSeverity;
  message: string;
  action: { label: string; to: string };
  /** Rank inside the list; lower comes first. */
  rank: number;
  /**
   * How many warnings this item stands for. The same rule tripped by eleven
   * purchases used to be eleven items in a row, pushing everything else down;
   * now it is one, with the count.
   */
  count: number;
  /** The events the warnings of this item come from, so a list can link each one. */
  eventIds: string[];
}

/** Where each code is fixed. A code missing from here is a bug the test catches. */
const DESTINATIONS: Record<string, { label: string; to: string }> = {
  invalid_events: { label: "Ver la verificación", to: "/ajustes/verificacion" },
  integrity_finding: { label: "Ver la verificación", to: "/ajustes/verificacion" },
  export_overdue: { label: "Exportar tus datos", to: "/ajustes" },
  // Prices and rates are fixed by recording a valuation.
  stale_price: { label: "Registrar valoración", to: "/registrar/valuation" },
  stale_fx_rate: { label: "Registrar valoración", to: "/registrar/valuation" },
  partial_core_total: { label: "Registrar valoración", to: "/registrar/valuation" },
  partial_bucket_total: { label: "Registrar valoración", to: "/registrar/valuation" },
  partial_net_worth: { label: "Registrar valoración", to: "/registrar/valuation" },
  missing_benchmark_price: { label: "Registrar valoración", to: "/registrar/valuation" },
  // Portfolio rules: the core and the bucket screens (next feature) explain them.
  deviation_above_threshold: { label: "Ver la cartera", to: "/cartera" },
  satellite_below_minimum: { label: "Ver la cartera", to: "/cartera" },
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
  transfer_overdue: { label: "Ver la solicitud", to: "/movimientos?tipo=transfer_requested" },
};

/**
 * Importance, top to bottom. **Losing the data comes first**: a ledger that
 * lives only in the browser and has not been exported is one "clear site data"
 * away from being gone, and nothing else on the list survives that. Then a
 * degraded ledger (nothing can be recorded), the conduct rules of the plan that
 * are already breached, the fiscal cost already incurred, what is pending with
 * the broker, and what is missing in order to be able to compute at all.
 */
const RANKS: readonly string[] = [
  "export_overdue",
  "invalid_events",
  "integrity_finding",
  "bucket_stop_loss_reached",
  "bucket_contribution_exceeded",
  "deviation_above_threshold",
  "satellite_below_minimum",
  "bucket_weight_exceeded",
  "bucket_contribution_near_limit",
  "transfer_overdue",
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
  // An error, not a warning: it is the one item that can cost everything.
  export_overdue: "error",
  invalid_events: "error",
  integrity_finding: "error",
  bucket_stop_loss_reached: "error",
  bucket_contribution_exceeded: "error",
  transfer_overdue: "warning",
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
  /** Privacy mode: the figures of a warning travel **inside** its sentence. */
  privacy: boolean;
  /**
   * The date the list is read at. A wash-sale window that had already closed
   * by then is history, not something to act on, and is left out.
   */
  date?: CivilDate;
  /** Fiscal date of each sale, to know when the window of a loss closes. */
  saleDates?: ReadonlyMap<string, CivilDate>;
}

const itemOf = (
  code: string,
  message: string,
  count = 1,
  eventIds: string[] = [],
): AttentionItem => ({
  code,
  severity: severityOf(code),
  message,
  action: DESTINATIONS[code] ?? FALLBACK,
  rank: rankOf(code),
  count,
  eventIds,
});

/** The last day on which the window a wash-sale warning talks about is open. */
const windowEndOf = (
  warning: Warning,
  saleDates: ReadonlyMap<string, CivilDate> | undefined,
): CivilDate | undefined => {
  if (warning.code === "wash_sale_window_repurchase") {
    return warning.details.window_end as CivilDate | undefined;
  }
  if (warning.code === "wash_sale_window_prior_buy") {
    const sale = saleDates?.get(warning.event_id);
    return sale === undefined
      ? undefined
      : washSaleWindowEnd(sale, warning.details.window as WashSaleWindow);
  }
  return undefined;
};

/**
 * What makes two warnings "the same one": the rule and what it is about. The
 * wash-sale ones are about **a sale** — eleven purchases inside the window of
 * one loss are one thing to know, not eleven.
 */
/** Rules whose repeats are one thing to do: all of them, one item, one sentence. */
const GATHERED = new Set(["stale_price", "stale_fx_rate", "deviation_above_threshold"]);

const groupKey = (warning: Warning): string => {
  if (GATHERED.has(warning.code)) {
    return warning.code;
  }
  const d = warning.details;
  const subject =
    warning.code === "wash_sale_window_repurchase"
      ? d.sale_event_id
      : warning.code === "wash_sale_window_prior_buy"
        ? warning.event_id
        : [d.asset_id, d.thesis_id, d.asset_class, d.currency, d.from_asset_id, d.to_asset_id]
            .filter((part) => part !== undefined)
            .join("|");
  return `${warning.code}|${String(subject)}`;
};

export const attentionItems = (input: AttentionInput): AttentionItem[] => {
  const items: AttentionItem[] = [];

  if (input.invalidCount > 0) {
    items.push(
      itemOf(
        "invalid_events",
        `${countOf(input.invalidCount, "movimiento inválido", "movimientos inválidos")} en tus datos: se puede consultar, pero no registrar hasta rectificarlos.`,
      ),
    );
  }

  // The explanation of a finding in Spanish. Its evidence — the domain's own
  // message, in English, with identifiers and figures — stays in the
  // verification screen, folded away, where it can be checked.
  for (const finding of input.findings) {
    items.push(itemOf("integrity_finding", describeFinding(finding).what));
  }

  // The same warning can arrive twice — the summary gathers them from the
  // projection and from three views that share rules — and that is one warning,
  // not two of a kind: exact copies go first, then the repeats are counted.
  const seen = new Set<string>();
  const groups = new Map<
    string,
    { warning: Warning; count: number; events: Set<string>; all: Warning[] }
  >();
  for (const warning of input.warnings) {
    const identity = `${warning.code}|${warning.event_id}|${JSON.stringify(warning.details)}`;
    if (seen.has(identity)) {
      continue;
    }
    seen.add(identity);
    const end = windowEndOf(warning, input.saleDates);
    if (end !== undefined && input.date !== undefined && end < input.date) {
      continue;
    }
    const key = groupKey(warning);
    const group = groups.get(key) ?? { warning, count: 0, events: new Set<string>(), all: [] };
    group.count += 1;
    group.all.push(warning);
    if (warning.event_id !== "") {
      group.events.add(warning.event_id);
    }
    groups.set(key, group);
  }
  for (const { warning, count, events, all } of groups.values()) {
    // `input` **is** the prose context: it carries the catalogue and the mode.
    // A gathered rule says its number in the sentence, so it carries no count.
    const gathered = count > 1 ? describeWarningGroup(warning.code, all, input) : undefined;
    items.push(
      gathered === undefined
        ? itemOf(warning.code, describeWarning(warning, input), count, [...events])
        : itemOf(warning.code, gathered, 1, [...events]),
    );
  }

  if (input.openOrders.length > 0) {
    const oldest = input.openOrders.reduce((max, order) => Math.max(max, order.days_open), 0);
    items.push(
      itemOf(
        "pending_orders",
        `${countOf(input.openOrders.length, "orden dada sin ejecutar", "órdenes dadas sin ejecutar")}; la más antigua lleva ${countOf(oldest, "día", "días")}.`,
      ),
    );
  }

  if (input.openTransfers.length > 0) {
    const oldest = input.openTransfers.reduce((max, entry) => Math.max(max, entry.days_open), 0);
    items.push(
      itemOf(
        "pending_transfers",
        `${countOf(input.openTransfers.length, "traspaso en curso", "traspasos en curso")}; el más antiguo lleva ${countOf(oldest, "día", "días")}.`,
      ),
    );
  }

  if (input.exportOverdueDays !== undefined) {
    items.push(
      itemOf(
        "export_overdue",
        input.exportOverdueDays === "never"
          ? "Tus datos viven en el navegador y nunca se han exportado: si borras los datos del sitio, se pierden."
          : `Tus datos viven en el navegador y la última exportación es de hace ${countOf(input.exportOverdueDays, "día", "días")}: si borras los datos del sitio, se pierde lo registrado desde entonces.`,
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
