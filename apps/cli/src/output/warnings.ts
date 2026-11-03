// What a warning of the domain says to the person, in Spanish.

import type { Warning } from "@atlas/domain";
import { say, windowText as windowName } from "@atlas/domain/messages";
import { text } from "./format.js";
import { CLI_VOICE } from "./voice.js";

/**
 * Spanish text of a projection warning. The domain speaks English and the CLI
 * translates the `code` (see `errors.ts`); an unknown code falls back to the
 * message, so a warning added later is never swallowed.
 */
export const describeWarning = (warning: Warning): string =>
  say("warning", warning.code, warning.details, CLI_VOICE, warning.message) ?? warning.message;

export interface WarningLine {
  readonly code: string;
  readonly text: string;
  /** The events the line is about: the sale, for a group of purchases inside its window. */
  readonly event_ids: readonly string[];
}

const datesOf = (warnings: readonly Warning[]): string[] =>
  warnings.map((w) => text(w.details.buy_date)).sort();

/**
 * The warnings as lines of `atlas check`. Every purchase inside the window of a loss-making sale
 * (or every earlier purchase still held when it is made) has its own warning, with the same text
 * but for its date: a real ledger would print dozens per sale, so they are said once per sale.
 * `--json` keeps each warning.
 */
export const warningLines = (warnings: readonly Warning[]): WarningLine[] => {
  const groups = new Map<string, Warning[]>();
  const lines: (WarningLine | string)[] = [];
  for (const warning of warnings) {
    if (
      warning.code !== "wash_sale_window_repurchase" &&
      warning.code !== "wash_sale_window_prior_buy"
    ) {
      lines.push({
        code: warning.code,
        text: describeWarning(warning),
        event_ids: [warning.event_id],
      });
      continue;
    }
    const sale =
      warning.code === "wash_sale_window_repurchase"
        ? text(warning.details.sale_event_id)
        : warning.event_id;
    const key = `${warning.code}|${sale}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [warning]);
      lines.push(key);
    } else {
      group.push(warning);
    }
  }
  return lines.map((line) => {
    if (typeof line !== "string") {
      return line;
    }
    const [first, ...rest] = groups.get(line) as [Warning, ...Warning[]];
    if (rest.length === 0) {
      return { code: first.code, text: describeWarning(first), event_ids: [first.event_id] };
    }
    const d = first.details;
    const all = [first, ...rest];
    const dates = datesOf(all);
    const [from, to] = [dates[0], dates[dates.length - 1]];
    if (first.code === "wash_sale_window_repurchase") {
      return {
        code: first.code,
        text: `${all.length} compras dentro de la ventana de recompra de la venta con pérdida de ${text(d.asset_id)} del ${text(d.sale_date)} (${text(d.loss_eur)} EUR; ${windowName(CLI_VOICE, d.window)}, hasta el ${text(d.window_end)}), del ${from} al ${to}: puede hacer que esa pérdida no sea computable en ${text(d.tax_year)}. Cuánto difiere, lo dice \`atlas tax ${text(d.tax_year)}\` (business-rules.md §5.4).`,
        event_ids: [text(d.sale_event_id)],
      };
    }
    return {
      code: first.code,
      text: `Venta con pérdida de ${text(d.asset_id)} del ${text(d.sale_date)} (${text(d.loss_eur)} EUR) cuando siguen en cartera ${all.length} compras anteriores, del ${from} al ${to}, dentro de la ventana (${windowName(CLI_VOICE, d.window)}): la pérdida puede no ser computable en ${text(d.tax_year)}. Cuánto, lo dice \`atlas tax ${text(d.tax_year)}\` (business-rules.md §5.4).`,
      event_ids: [first.event_id],
    };
  });
};
