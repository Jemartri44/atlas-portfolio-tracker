// The ECB rates after a change of `fiscal_date_rule`, from the console
// (ADR-0029, point 10; block 6 of prompt 012; criterion 25):
//
// - `atlas settings set --fiscal-date-rule …` says, **before** the question,
//   which lines would be left with a rate that is not the one of their new
//   fiscal date (`confirmRuleChangeRates`);
// - `atlas fx correct` proposes the correction — each line reversed and
//   recorded again with the official rate —, shows the whole chain with the
//   filed returns it reaches, and writes it **in one write** after a yes.
//
// Nothing is recalculated: every figure keeps using the rate of the ledger
// until the user writes the correction. The rules are the domain's.

import { dirname } from "node:path";
import { readLocalConfig } from "@atlas/adapters";
import { type LedgerEvent, type Settings, todayInMadrid } from "@atlas/domain";
import {
  type EcbHistory,
  prepareRateCorrections,
  type RuleChangeLine,
  ruleChangeRates,
  writeRateCorrections,
} from "@atlas/domain/ecb";
import { closedYearImpact } from "@atlas/domain/fiscal";
import { assertKnownFlags, type Flags, stringFlag } from "../args.js";
import { type Context, EXIT, GLOBAL_FLAGS } from "../context.js";
import { closedYearLines } from "../output/closed-years.js";
import { day } from "../output/ecb.js";
import { historyOf } from "./rates.js";
import { confirm } from "./shared.js";

/** The reason written into every reversal of the chain, unless the user gives one. */
export const CORRECTION_REASON =
  "Tipo del BCE de la fecha fiscal vigente, tras cambiar fiscal_date_rule (criterio 25)";

const ecb = async (ctx: Context): Promise<{ history?: EcbHistory; staleDays: number }> => {
  const { history } = await historyOf(ctx);
  const { ecb_stale_currency_days } = await readLocalConfig(dirname(ctx.ledgerPath));
  return { ...(history === undefined ? {} : { history }), staleDays: ecb_stale_currency_days };
};

const official = (line: { official?: { rate: string; date: string } }): string =>
  line.official === undefined
    ? ""
    : ` El oficial es ${line.official.rate} del ${day(line.official.date)}.`;

const describeLine = (line: RuleChangeLine): string => {
  const head = `  ${line.event_id} ${line.path} (${line.currency}): ${line.rate} del ${day(line.rate_date)}; su fecha fiscal pasa del ${day(line.fiscal_date)} al ${day(line.new_fiscal_date)}.`;
  switch (line.verdict) {
    case "after_fiscal_date":
      return `${head} El tipo queda fechado después de la fecha fiscal.${official(line)}`;
    case "not_official":
      return `${head} Deja de ser el tipo de su fecha fiscal.${official(line)}`;
    case "unverifiable":
      return `${head} No se puede verificar contra el oficial.`;
  }
};

/**
 * Before a `settings_changed` is confirmed: the lines whose rate it would
 * leave as not the one of their fiscal date. False when the user says no.
 */
export const confirmRuleChangeRates = async (
  ctx: Context,
  events: readonly LedgerEvent[],
  current: Settings,
  next: Settings,
): Promise<{ go: boolean; lines: number }> => {
  const { history, staleDays } = await ecb(ctx);
  const impact = ruleChangeRates(history, events, current, next, staleDays);
  if (impact.lines.length === 0) {
    return { go: true, lines: 0 };
  }
  ctx.io.out(
    `Este cambio de fiscal_date_rule deja ${impact.lines.length === 1 ? "una línea" : `${impact.lines.length} líneas`} con un tipo del BCE que puede no ser el de su nueva fecha fiscal (criterio 25). No se recalcula nada: las cifras seguirán usando el tipo del libro hasta que lo corrijas con \`atlas fx correct\`.`,
  );
  for (const line of impact.lines) {
    ctx.io.out(describeLine(line));
  }
  if (!impact.checked) {
    ctx.io.out(
      "Sin histórico del BCE junto al libro solo se sabe qué tipos quedan fechados después de su fecha fiscal; el resto no se puede verificar contra el oficial (`atlas fx update`).",
    );
  }
  return { go: await confirm(ctx, "¿Continuar? [s/N] "), lines: impact.lines.length };
};

/** `atlas fx correct [--reason …]`: the chain, whole, and one write after a yes. */
export const correctRates = async (ctx: Context, flags: Flags): Promise<number> => {
  assertKnownFlags(flags, ["reason", ...GLOBAL_FLAGS]);
  const { history, staleDays } = await ecb(ctx);
  const reason = stringFlag(flags, "reason") ?? CORRECTION_REASON;
  const prepared = await prepareRateCorrections(ctx.deps, history, staleDays, reason);
  if (prepared.corrections.length === 0) {
    ctx.io.out(
      history === undefined
        ? "No hay nada que se pueda corregir sin el histórico del BCE (solo los tipos en euros fechados después de su fecha fiscal). Descárgalo con `atlas fx update`."
        : "Ningún tipo del libro es de otro día que el de su fecha fiscal: no hay nada que corregir.",
    );
    return EXIT.ok;
  }
  ctx.io.out(
    `Corrección propuesta (criterio 25): ${prepared.corrections.length === 1 ? "una línea" : `${prepared.corrections.length} líneas`}, cada una anulada y registrada de nuevo con el tipo oficial de su fecha fiscal, todas en una sola escritura.`,
  );
  for (const line of prepared.corrections) {
    ctx.io.out(
      `  ${line.event_id} ${line.path} (${line.currency}): ${line.rate} del ${day(line.rate_date)} → ${line.official.rate} del ${day(line.official.date)} (fecha fiscal ${day(line.fiscal_date)}).`,
    );
  }
  const declared = closedYearLines(
    closedYearImpact(
      { events: prepared.events },
      { events: [...prepared.events, ...prepared.chain] },
      todayInMadrid(ctx.deps.clock),
    ),
  );
  for (const line of declared) {
    ctx.io.out(line);
  }
  if (!(await confirm(ctx, "¿Escribir la corrección entera? [s/N] "))) {
    ctx.io.out("Cancelado.");
    return EXIT.ok;
  }
  await writeRateCorrections(ctx.deps, prepared);
  ctx.io.out(
    `Corrección escrita: ${prepared.chain.length / 2} ${prepared.chain.length === 2 ? "línea anulada y registrada" : "líneas anuladas y registradas"} de nuevo.`,
  );
  return EXIT.ok;
};
