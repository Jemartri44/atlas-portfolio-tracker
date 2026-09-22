// atlas filed <renta|720|721> <año> — record a return that was actually filed.
//
// **What was filed is a fact, not a calculation** (ADR-0020). The command
// starts from what the application computes, because nobody wants to type a
// dozen figures, and then lets the user replace any of them with what he really
// declared: the two are not the same thing, and the whole point of the event is
// that the ledger keeps the second one even when the application computes
// something else today.
//
// Nothing is written without an explicit confirmation (decision (l)): turning a
// calculation into "what was filed" by pressing enter is exactly what ADR-0020
// separates.

import {
  type FiledItem,
  type FilingCategory,
  type FilingModel,
  fingerprintOfEvents,
  type InformativeReturn,
  informativeReturn,
  type Money,
  normalizeSettings,
  settingsAt,
  type TaxYearReport,
  taxYear,
  todayInMadrid,
} from "@atlas/domain";
import { assertKnownFlags, type Flags, listFlag, stringFlag, UsageError } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { table } from "../output/table.js";
import { confirmAndRecord, loadForQuery } from "./shared.js";

const USAGE =
  "uso: atlas filed <renta|720|721> <año> [--set <clave>=<importe>]… [--filed-at YYYY-MM-DD] [--receipt <referencia>] [--notes <texto>] [--supersedes <id>]";

const MODELS: readonly FilingModel[] = ["renta", "720", "721"];

const cents = (money: Money): string => {
  const [whole, fraction = ""] = money.roundToCents().amount.toString().split(".");
  return `${whole}.${fraction.padEnd(2, "0")}`;
};

/**
 * What the application computes for the return, one **key per figure**. The key
 * is what `--set` names, and it is the same key the output prints, so there is
 * nothing to translate between reading and correcting.
 */
const rentaFigures = (report: TaxYearReport): Map<string, string> => {
  const figures = new Map<string, string>();
  figures.set("base", cents(report.base_eur));
  for (const entry of report.compensation.pending) {
    figures.set(`pending.${entry.origin_year}.${entry.category}`, cents(entry.amount_eur));
  }
  figures.set(
    "deferred",
    cents(
      report.wash_sale.pending.reduce(
        (total, entry) => total.add(entry.amount_eur),
        report.base_eur.sub(report.base_eur),
      ),
    ),
  );
  return figures;
};

const informativeFigures = (report: InformativeReturn): Map<string, string> => {
  const figures = new Map<string, string>();
  for (const category of report.categories) {
    if (category.items.length === 0) {
      continue;
    }
    figures.set(`${category.category}.value`, cents(category.value_eur));
    if (category.q4_average_eur !== undefined) {
      figures.set(`${category.category}.q4_average`, cents(category.q4_average_eur));
    }
    for (const item of category.items) {
      const key = `item.${item.account_id}${item.asset_id === undefined ? "" : `.${item.asset_id}`}`;
      if (item.value_eur !== undefined) {
        figures.set(item.asset_id === undefined ? `${key}.balance` : key, cents(item.value_eur));
      }
      if (item.q4_average_eur !== undefined) {
        figures.set(`${key}.q4_average`, cents(item.q4_average_eur));
      }
    }
  }
  return figures;
};

/** `--set clave=importe`, checked against the keys the return actually has. */
const applyOverrides = (
  computed: ReadonlyMap<string, string>,
  values: readonly string[],
): Map<string, string> => {
  const declared = new Map(computed);
  for (const raw of values) {
    const at = raw.indexOf("=");
    if (at < 0) {
      throw new UsageError(`--set se escribe clave=importe (recibido: ${raw})`);
    }
    const key = raw.slice(0, at);
    if (!computed.has(key)) {
      throw new UsageError(
        `--set ${key}: esta declaración no tiene esa cifra. Las que tiene: ${[...computed.keys()].join(", ")}`,
      );
    }
    declared.set(key, raw.slice(at + 1));
  }
  return declared;
};

/** The figures of a `renta`, back in the shape the event declares. */
const rentaDeclared = (figures: ReadonlyMap<string, string>): Record<string, unknown> => ({
  savings_base_eur: figures.get("base") as string,
  pending_losses: [...figures]
    .filter(([key]) => key.startsWith("pending."))
    .map(([key, amount]) => {
      const [, year, category] = key.split(".") as [string, string, string];
      return { origin_year: Number(year), category, amount_eur: amount };
    }),
  deferred_losses_eur: figures.get("deferred") as string,
});

/** The same for a `720` or a `721`: the categories declared and the list of assets. */
const informativeDeclared = (
  report: InformativeReturn,
  figures: ReadonlyMap<string, string>,
): Record<string, unknown> => {
  const declared: Record<string, unknown> = {};
  const items: FiledItem[] = [];
  for (const category of report.categories) {
    if (category.items.length === 0) {
      continue;
    }
    const value = figures.get(`${category.category}.value`) as string;
    const average = figures.get(`${category.category}.q4_average`);
    declared[category.category] =
      average === undefined
        ? { value_eur: value }
        : { balance_eur: value, q4_average_eur: average };
    for (const item of category.items) {
      const key = `item.${item.account_id}${item.asset_id === undefined ? "" : `.${item.asset_id}`}`;
      const own = figures.get(item.asset_id === undefined ? `${key}.balance` : key);
      items.push({
        category: category.category as FilingCategory,
        account_id: item.account_id,
        ...(item.asset_id === undefined ? {} : { asset_id: item.asset_id }),
        ...(own === undefined
          ? {}
          : item.asset_id === undefined
            ? { balance_eur: own }
            : { value_eur: own }),
        ...(figures.has(`${key}.q4_average`)
          ? { q4_average_eur: figures.get(`${key}.q4_average`) as string }
          : {}),
      });
    }
  }
  return { ...declared, items };
};

export const filedCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["set", "filed-at", "receipt", "notes", "supersedes", ...GLOBAL_FLAGS]);
  const model = positionals[1] as FilingModel | undefined;
  const year = Number(positionals[2]);
  if (model === undefined || !MODELS.includes(model) || !Number.isInteger(year)) {
    throw new UsageError(USAGE);
  }
  const today = todayInMadrid(ctx.deps.clock);
  const { events, state } = await loadForQuery(ctx);
  const report =
    model === "renta"
      ? taxYear(events, year, { today })
      : informativeReturn(events, model, year, { today });
  const computed =
    model === "renta"
      ? rentaFigures(report as TaxYearReport)
      : informativeFigures(report as InformativeReturn);
  const declared = applyOverrides(computed, listFlag(flags, "set"));
  ctx.io.out(
    `Lo que la aplicación calcula hoy para ${model === "renta" ? "la Renta" : `el Modelo ${model}`} de ${year}, y lo que vas a declarar:`,
  );
  ctx.io.out(
    table(
      ["clave", "calculado", "declarado"],
      [...computed].map(([key, amount]) => [
        key,
        amount,
        declared.get(key) === amount ? "=" : (declared.get(key) as string),
      ]),
    ),
  );
  const figures =
    model === "renta"
      ? rentaDeclared(declared)
      : informativeDeclared(report as InformativeReturn, declared);
  const computedFigures =
    model === "renta"
      ? rentaDeclared(computed)
      : informativeDeclared(report as InformativeReturn, computed);
  // What it takes to reproduce the calculation of this day: the whole resolved
  // configuration and not only the `settings_changed` in force, because with
  // anything taken from the code that line alone does not reproduce it (S13).
  const resolved = settingsAt(state, today);
  const supersedes = stringFlag(flags, "supersedes");
  const notes = stringFlag(flags, "notes");
  const draft: Record<string, unknown> = {
    type: "tax_return_filed",
    model,
    tax_year: year,
    filed_at: stringFlag(flags, "filed-at") ?? today,
    receipt_reference: stringFlag(flags, "receipt") ?? "",
    ...(supersedes === undefined ? {} : { supersedes }),
    declared: figures,
    computed: {
      ...computedFigures,
      as_of: today,
      settings_origin: resolved.origin,
      settings: normalizeSettings(resolved.settings),
    },
    // The fingerprint covers exactly the lines before this one, which is where
    // it will land: nothing else writes between the load and the record.
    ledger_fingerprint: fingerprintOfEvents(events),
    ...(notes === undefined ? {} : { notes }),
  };
  await confirmAndRecord(ctx, draft, [
    "Lo que se guarda es lo que declaras, aunque la aplicación calcule otra cosa: es un hecho con consecuencias legales (ADR-0020).",
    ...(supersedes === undefined
      ? []
      : ["Es una complementaria: sustituye a la presentación que indicas, no la anula."]),
  ]);
  return 0;
};
