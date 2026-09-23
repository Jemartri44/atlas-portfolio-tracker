// atlas m720 <año> [--json] · atlas m721 <año> [--json]
//
// Two commands and not `atlas tax 720`, which the argument parser would read as
// the tax year 720 (prompt 010, block 5).
//
// The CLI only formats: what counts, what it is worth, whether it obliges and
// why is decided in `packages/domain/src/informative/` (§2 bis of the prompt).

import { todayInMadrid } from "@atlas/domain";
import type {
  InformativeCategory,
  InformativeItem,
  InformativeReturn,
  VerdictReason,
} from "@atlas/domain/fiscal";
import { informativeReturn } from "@atlas/domain/fiscal";
import { assertKnownFlags, type Flags, UsageError } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { eur } from "../output/format.js";
import { describeWarning } from "../output/messages.js";
import { table } from "../output/table.js";
import { loadForQuery, renderQuery } from "./shared.js";

const USAGE = "uso: atlas m720 <año> [--json] · atlas m721 <año> [--json]";

/** A figure of the model: always two decimals, so a column reads as money. */
const VERDICT: Record<InformativeCategory["verdict"], string> = {
  obliged: "OBLIGADO",
  not_obliged: "no obligado",
  // Not the same as "no obligado": nothing has been written down in this
  // category, so there is nothing to be under the threshold.
  nothing_recorded: "no hay nada registrado",
  undetermined: "NO SE PUEDE DETERMINAR",
  not_applicable: "sin veredicto",
};

const FLAG: Record<InformativeItem["flags"][number], string> = {
  valuation_not_year_end: "la valoración no es del 31/12",
  rate_not_year_end: "el tipo no es el del último día hábil",
  price_missing: "falta la valoración a 31/12",
};

const CATEGORY: Record<string, string> = {
  accounts: "Cuentas",
  securities: "Valores",
  crypto: "Criptomonedas",
};

const reasonText = (reason: VerdictReason): string => {
  switch (reason.kind) {
    case "threshold":
      return `supera el umbral (${eur(reason.after_eur)})`;
    case "first_time_category":
      return `supera el umbral y esta categoría no se declaró en el ${String(reason.against_year)} (${eur(reason.after_eur)})`;
    case "increase":
      return `sube más del límite sobre el ${String(reason.against_year)}: ${eur(reason.before_eur)} → ${eur(reason.after_eur)}`;
    case "increase_q4_average":
      return `el saldo medio del cuarto trimestre sube más del límite sobre el ${String(reason.against_year)}: ${eur(reason.before_eur)} → ${eur(reason.after_eur)}`;
    case "extinction":
      return `se ha dejado de tener ${reason.asset_id ?? reason.account_id}, que se declaró en el ${String(reason.against_year)}`;
    default:
      return `aviso: ${eur(reason.after_eur)}, cerca del umbral`;
  }
};

const accountRows = (items: readonly InformativeItem[]): string[][] =>
  items.map((item) => [
    item.account_id,
    (item.balances ?? [])
      .map((part) => `${part.amount.amount.toString()} ${part.currency}`)
      .join(" · "),
    eur(item.value_eur),
    eur(item.q4_average_eur),
    (item.balances ?? [])[0] === undefined ? "" : String((item.balances ?? [])[0]?.days ?? ""),
    item.flags.map((flag) => FLAG[flag]).join("; "),
  ]);

const assetRows = (items: readonly InformativeItem[]): string[][] =>
  items.map((item) => [
    item.account_id,
    item.asset_id ?? "",
    item.quantity?.toString() ?? "",
    item.unit_value === undefined ? "—" : `${item.unit_value} (${item.valuation_date ?? "?"})`,
    item.fx_rate === undefined ? "—" : `${item.fx_rate} (${item.fx_rate_date ?? "?"})`,
    eur(item.value_eur),
    item.flags.map((flag) => FLAG[flag]).join("; "),
  ]);

const categoryText = (category: InformativeCategory, index: number): string => {
  const heading = `\n${index}. ${CATEGORY[category.category] ?? category.category}`;
  const body =
    category.category === "accounts"
      ? table(
          ["cuenta", "saldos", "a 31/12 EUR", "medio 4T EUR", "días", "marcas"],
          accountRows(category.items),
        )
      : table(
          ["cuenta", "activo", "cantidad", "valoración", "tipo BCE", "valor EUR", "marcas"],
          assetRows(category.items),
        );
  const total =
    category.category === "accounts"
      ? `Total a 31/12 ${eur(category.value_eur)} · medio del cuarto trimestre ${eur(category.q4_average_eur)}`
      : `Total ${eur(category.value_eur)}`;
  const lines = [heading, body, `${total} → ${VERDICT[category.verdict]}`];
  for (const reason of category.reasons) {
    lines.push(`  · ${reasonText(reason)}`);
  }
  if (category.missing.length > 0) {
    lines.push(
      `Falta para poder decidir: ${category.missing
        .map(
          (entry) =>
            `${entry.account_id}${entry.asset_id === undefined ? "" : `/${entry.asset_id}`} (${FLAG[entry.flag]})`,
        )
        .join(", ")}. Registra las valoraciones a 31/12.`,
    );
  }
  if (category.decided_with.length > 0) {
    lines.push(
      `Decidido con ${category.decided_with.length === 1 ? "un valor marcado" : "valores marcados"}: ${category.decided_with
        .map(
          (entry) =>
            `${entry.account_id}${entry.asset_id === undefined ? "" : `/${entry.asset_id}`}`,
        )
        .join(", ")}. Sin él, el veredicto sería otro.`,
    );
  }
  return lines.join("\n");
};

const PERIOD: Record<InformativeReturn["period"], string> = {
  closed_year: "ejercicio cerrado",
  current_year: "año en curso, estado a la fecha de consulta",
  before_model: "el modelo no existía ese ejercicio",
};

export const renderInformative = (report: InformativeReturn): string => {
  const out: string[] = [
    `MODELO ${report.model} de ${report.year} — núcleo y cubo agregados por contribuyente (constitución III).`,
    `${PERIOD[report.period]}. Fecha de consulta: ${report.today}.`,
    `Umbral ${eur(report.threshold_eur)} · vuelve a obligar por encima de +${eur(report.increase_eur)} · aviso desde ${eur(report.alert_eur)}.`,
  ];
  report.categories.forEach((category, index) => {
    out.push(categoryText(category, index + 1));
  });
  if (report.excluded.length > 0) {
    out.push(
      `\nQuedan fuera por ser cuentas españolas: ${report.excluded.map((entry) => entry.account_id).join(", ")}.`,
    );
  }
  if (report.previous !== undefined) {
    out.push(
      `\nÚltimo ${report.model} presentado: el de ${report.previous.tax_year}, el ${report.previous.filed_at}.`,
      table(
        ["categoría", "declarado", "declarado medio 4T", "hoy", "hoy medio 4T"],
        report.previous.categories.map((entry) => [
          CATEGORY[entry.category] ?? entry.category,
          eur(entry.declared_eur),
          eur(entry.declared_q4_average_eur),
          eur(entry.computed_eur),
          eur(entry.computed_q4_average_eur),
        ]),
      ),
    );
  }
  if (report.filed !== undefined) {
    out.push(
      `\nEste ejercicio consta presentado el ${report.filed.filed_at} (justificante en el libro).`,
      table(
        ["categoría", "declarado", "declarado medio 4T", "hoy", "hoy medio 4T"],
        report.filed.categories.map((entry) => [
          CATEGORY[entry.category] ?? entry.category,
          eur(entry.declared_eur),
          eur(entry.declared_q4_average_eur),
          eur(entry.computed_eur),
          eur(entry.computed_q4_average_eur),
        ]),
      ),
    );
  }
  out.push(`\nCriterios de los que depende: ${report.criteria.join(", ")}.`);
  out.push("\nAvisos", report.notes.map((note) => `- ${describeWarning(note)}`).join("\n"));
  return out.join("\n");
};

/** `atlas m720 <año>` and `atlas m721 <año>`: the same command with its model fixed. */
export const informativeCommand =
  (model: "720" | "721") =>
  async (ctx: Context, positionals: string[], flags: Flags): Promise<number> => {
    assertKnownFlags(flags, [...GLOBAL_FLAGS]);
    const year = Number(positionals[1]);
    if (positionals[1] === undefined || !Number.isInteger(year)) {
      throw new UsageError(USAGE);
    }
    const { events, state } = await loadForQuery(ctx);
    const report = informativeReturn(events, model, year, {
      today: todayInMadrid(ctx.deps.clock),
    });
    renderQuery(ctx, state, report, renderInformative(report));
    return 0;
  };

export const m720Command = informativeCommand("720");
export const m721Command = informativeCommand("721");
