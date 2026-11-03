// atlas thesis open · close <id> · show <id> [--date]

import {
  type BenchmarkGap,
  type BucketThesisView,
  DomainError,
  settingsAt,
  type ThesisLeg,
} from "@atlas/domain";
import { bucketTheses } from "@atlas/domain/portfolio";
import { assertKnownFlags, type Flags, requireFlag, UsageError, wholeNumber } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { eur } from "../output/format.js";
import { keyValue, table } from "../output/table.js";
import { loadQuotes, sayNotes } from "../prices/load.js";
import { confirmAndRecord, dateFlag, loadForQuery, renderQuery, requireId } from "./shared.js";

/** A thesis as `--json` shows it, index comparison included. */
const jsonThesis = (thesis: BucketThesisView) => ({
  thesis_id: thesis.thesis_id,
  account_id: thesis.account_id,
  asset_id: thesis.asset_id,
  status: thesis.status,
  hypothesis: thesis.hypothesis,
  invalidation: thesis.invalidation,
  expected_horizon_days: thesis.expected_horizon_days,
  opened_at: thesis.opened_at,
  closed_at: thesis.closed_at,
  closing_notes: thesis.closing_notes,
  days_open: thesis.days_open,
  planned_size_eur: thesis.planned_size_eur.amount.toString(),
  invested_eur: thesis.invested_eur.amount.toString(),
  fees_eur: thesis.fees_eur.amount.toString(),
  result_eur: thesis.result_eur.amount.toString(),
  result_eur_rounded: thesis.result_eur_rounded.amount.toString(),
  unrealized_eur: thesis.unrealized_eur?.amount.toString(),
  benchmark_asset_id: thesis.benchmark_asset_id,
  benchmark_equivalent_eur: thesis.benchmark_equivalent_eur?.amount.toString(),
  result_vs_index_eur: thesis.result_vs_index_eur?.amount.toString(),
  missing_benchmark: thesis.missing_benchmark,
  position: thesis.position.toString(),
  quantity_bought: thesis.quantity_bought.toString(),
  quantity_sold: thesis.quantity_sold.toString(),
  buys: thesis.buys.map(jsonLeg),
  sells: thesis.sells.map(jsonLeg),
});

/** A linked trade as `--json` shows it: decimals as strings, like everywhere else. */
const jsonLeg = (leg: ThesisLeg) => ({
  event_id: leg.event_id,
  fiscal_date: leg.fiscal_date,
  quantity: leg.quantity.toString(),
  amount_eur: leg.amount_eur.amount.toString(),
  fee_eur: leg.fee_eur.amount.toString(),
  gain_eur: leg.gain_eur?.amount.toString(),
});

const OPEN_FLAGS = [
  "id",
  "account",
  "asset",
  "hypothesis",
  "horizon-days",
  "invalidation",
  "planned-size",
];

/** Why a thesis has no comparison with the index, in Spanish and in full. */
const gapText = (gap: BenchmarkGap): string => {
  switch (gap.reason) {
    case "no_benchmark":
      return "no hay índice de referencia configurado";
    case "unknown_asset":
      return `el índice ${gap.asset_id} no está en el catálogo`;
    case "no_price":
      return `falta el precio del índice ${gap.asset_id} a ${gap.date}`;
    case "no_linked_buys":
      return "la tesis no tiene ninguna compra enlazada: un sumatorio vacío no es cero";
    default:
      return `falta el precio de ${gap.asset_id} a ${gap.date}`;
  }
};

/** The sheet of one thesis: what was written, what was done, and how it ended. */
const thesisSheet = (thesis: BucketThesisView): string => {
  const legs = (rows: readonly ThesisLeg[], title: string, kind: "compra" | "venta"): string[] =>
    rows.length === 0
      ? [`${title}: (ninguna)`]
      : [
          `${title}:`,
          table(
            [
              "fecha fiscal",
              "evento",
              "cantidad",
              `${kind === "compra" ? "coste" : "transmisión"} EUR`,
              "comisión EUR",
              "ganancia EUR",
            ],
            rows.map((leg) => [
              leg.fiscal_date,
              leg.event_id,
              leg.quantity.toString(),
              eur(leg.amount_eur),
              eur(leg.fee_eur),
              eur(leg.gain_eur),
            ]),
          ),
        ];
  const missing = thesis.missing_benchmark.map(gapText).join("; ");
  return [
    `Tesis ${thesis.thesis_id} (${thesis.status === "open" ? "abierta" : "cerrada"})`,
    keyValue({
      cuenta: thesis.account_id,
      activo: thesis.asset_id,
      hipótesis: thesis.hypothesis,
      "plazo previsto": `${thesis.expected_horizon_days} días (lleva ${thesis.days_open}${
        thesis.days_open > thesis.expected_horizon_days ? " ⚠ superado" : ""
      })`,
      invalidación: thesis.invalidation,
      "tamaño previsto": `${eur(thesis.planned_size_eur)} EUR`,
      invertido: `${eur(thesis.invested_eur)} EUR`,
      comisiones: `${eur(thesis.fees_eur)} EUR`,
      resultado: `${eur(thesis.result_eur_rounded)} EUR`,
      latente: `${eur(thesis.unrealized_eur)} EUR`,
      "posición de la pareja": `${thesis.position.toString()} (cuenta y activo, no solo de esta tesis)`,
      "equivalente en índice": `${eur(thesis.benchmark_equivalent_eur)} EUR${
        thesis.benchmark_asset_id === undefined ? "" : ` (${thesis.benchmark_asset_id})`
      }`,
      "resultado vs índice": `${eur(thesis.result_vs_index_eur)} EUR`,
      ...(missing === "" ? {} : { "sin comparación por": missing }),
      ...(thesis.closed_at === undefined ? {} : { cierre: thesis.closed_at }),
      ...(thesis.closing_notes === undefined ? {} : { notas: thesis.closing_notes }),
    }),
    "",
    ...legs(thesis.buys, "Compras", "compra"),
    "",
    ...legs(thesis.sells, "Ventas", "venta"),
  ].join("\n");
};

export const thesisCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const [, action] = positionals;
  if (action === "open") {
    assertKnownFlags(flags, [...OPEN_FLAGS, ...GLOBAL_FLAGS]);
    const horizon = wholeNumber("horizon-days", requireFlag(flags, "horizon-days"));
    if (horizon <= 0) {
      throw new UsageError("--horizon-days debe ser un entero positivo (días)");
    }
    await confirmAndRecord(ctx, {
      type: "thesis_opened",
      thesis_id: requireFlag(flags, "id"),
      account_id: requireFlag(flags, "account"),
      asset_id: requireFlag(flags, "asset"),
      hypothesis: requireFlag(flags, "hypothesis"),
      expected_horizon_days: horizon,
      invalidation: requireFlag(flags, "invalidation"),
      planned_size_eur: requireFlag(flags, "planned-size"),
    });
    return 0;
  }
  if (action === "close") {
    const thesisId = requireId(positionals, 2, "uso: atlas thesis close <thesis_id> --notes …");
    assertKnownFlags(flags, ["notes", ...GLOBAL_FLAGS]);
    await confirmAndRecord(ctx, {
      type: "thesis_closed",
      thesis_id: thesisId,
      closing_notes: requireFlag(flags, "notes"),
    });
    return 0;
  }
  if (action === "show") {
    const thesisId = requireId(positionals, 2, "uso: atlas thesis show <thesis_id> [--date]");
    assertKnownFlags(flags, ["date", ...GLOBAL_FLAGS]);
    const date = dateFlag(ctx, flags);
    const { state } = await loadForQuery(ctx, date);
    const quotes = await loadQuotes(ctx, state);
    sayNotes(ctx, quotes.notes);
    const thesis = bucketTheses(
      state,
      date,
      settingsAt(state, date).settings,
      quotes.external,
    ).rows.find((candidate) => candidate.thesis_id === thesisId);
    if (thesis === undefined) {
      throw new DomainError("unknown_thesis", `thesis ${thesisId} does not exist`, {
        thesis_id: thesisId,
      });
    }
    renderQuery(ctx, state, jsonThesis(thesis), thesisSheet(thesis));
    return 0;
  }
  throw new UsageError("uso: atlas thesis open|close <id>|show <id> [--date YYYY-MM-DD]");
};
