// The ECB rate of an operation being recorded from the console (ADR-0029,
// points 3 and 7; decisions (p) and (w) of prompt 012).
//
// - With the history next to the ledger, an operation in a foreign currency
//   **without** `--fx-rate` gets the official rate of its reference date — the
//   fiscal date for a buy or a sale — proposed and shown before confirming.
// - An operation in euros without them gets "1", dated from the fiscal date
//   too, so every date the application fills in comes from the same rule.
// - A typed rate that differs from a conclusive official one asks for an
//   **explicit** confirmation: `--confirm-fx-rate`, or a yes to its own
//   question. `--yes` does not answer it: it is not the same question.
// - Without a history nothing is proposed, and the rate is typed as always.
//
// What to propose and when to ask is the domain's; this only says it.

import { dirname } from "node:path";
import { FileEcbHistoryStore, readLocalConfig } from "@atlas/adapters";
import {
  DomainError,
  type LedgerEvent,
  type LedgerState,
  loadAndProject,
  todayInMadrid,
} from "@atlas/domain";
import {
  checkLedgerRates,
  type EcbHistory,
  proposeRates,
  type RateCheck,
  type RateMismatch,
  rateConfirmations,
  readEcbHistory,
  unpublishedRates,
} from "@atlas/domain/ecb";
import { ConfirmationRequired, type Context } from "../context.js";
import { day } from "../output/ecb.js";

/** The history in force, or `undefined` — with the reason when there is one but it cannot be used. */
export const historyOf = async (
  ctx: Context,
): Promise<{ history?: EcbHistory; problem?: string }> => {
  try {
    const active = await new FileEcbHistoryStore(dirname(ctx.ledgerPath)).active();
    return active === undefined ? {} : { history: readEcbHistory(active.text, active.meta.source) };
  } catch (error) {
    return { problem: error instanceof Error ? error.message : String(error) };
  }
};

export interface RatedDraft {
  draft: Record<string, unknown>;
  /** What to print before the question: what was proposed, and what cannot be checked. */
  notes: string[];
  /** Typed rates that differ from the official one: each needs its explicit yes. */
  mismatches: RateMismatch[];
  /** A rate the ECB has not published yet and nobody typed: it cannot be recorded as it is. */
  waiting: boolean;
  /** The history in force, for the draft that waits for it. */
  history?: EcbHistory;
  staleDays: number;
}

export const rateDraft = async (
  ctx: Context,
  draft: Record<string, unknown>,
): Promise<RatedDraft> => {
  const { history, problem } = await historyOf(ctx);
  const { ecb_stale_currency_days: stale } = await readLocalConfig(dirname(ctx.ledgerPath));
  let state: Awaited<ReturnType<typeof loadAndProject>>["state"];
  try {
    state = (await loadAndProject(ctx.deps, { collectErrors: true })).state;
  } catch (error) {
    if (error instanceof DomainError) {
      return { draft, notes: [], mismatches: [], waiting: false, staleDays: stale };
    }
    throw error;
  }
  const notes: string[] = [];
  let waiting = false;
  if (problem !== undefined) {
    notes.push(
      `El histórico del BCE guardado no se puede usar (${problem}): no se propone ni se comprueba ningún tipo. Descárgalo otra vez con \`atlas fx update\`.`,
    );
  }
  const proposal = proposeRates(history, state, draft, stale);
  for (const { point, resolution } of proposal.proposed) {
    if (resolution.kind === "resolved") {
      notes.push(
        `Tipo del BCE propuesto para ${point.currency}: ${resolution.rate} del ${day(resolution.date)}, el publicado en o antes de la fecha ${point.basis === "fiscal" ? "fiscal" : "de la operación"} (${day(point.reference)}).`,
      );
    }
  }
  for (const { point, resolution } of unpublishedRates(history, state, proposal.draft, stale)) {
    if (resolution.kind === "not_yet_published") {
      waiting ||= point.rate === undefined;
      notes.push(
        point.rate === undefined
          ? `El BCE todavía no ha publicado el tipo de ${point.currency} del ${day(point.reference)} (el último publicado es del ${day(resolution.latest)}). Se puede guardar como borrador hasta que se publique, o teclear el tipo con --fx-rate y --fx-rate-date.`
          : `El tipo de ${point.currency} del ${day(point.reference)} aún no está en el histórico (llega hasta el ${day(resolution.latest)}): el tecleado no se puede comprobar contra el oficial.`,
      );
    }
  }
  const mismatches = rateConfirmations(history, state, proposal.draft, stale);
  return {
    draft: proposal.draft,
    notes,
    mismatches,
    waiting,
    ...(history === undefined ? {} : { history }),
    staleDays: stale,
  };
};

/** The explicit yes for each typed rate that is not the official one. */
export const confirmRates = async (
  ctx: Context,
  mismatches: readonly RateMismatch[],
): Promise<boolean> => {
  for (const { point, official } of mismatches) {
    ctx.io.out(
      `El tipo tecleado para ${point.currency} (${point.rate}${point.rate_date === undefined ? "" : ` del ${day(point.rate_date)}`}) no es el oficial de la fecha ${point.basis === "fiscal" ? "fiscal" : "de la operación"} (${day(point.reference)}): el BCE publicó ${official.rate} el ${day(official.date)}. Se registra el tecleado si lo confirmas; la comprobación del libro lo señalará.`,
    );
  }
  if (mismatches.length === 0 || ctx.confirmFxRate) {
    return true;
  }
  const answer = await ctx.io.confirm("¿Registrar con el tipo tecleado? [s/N] ");
  if (answer === undefined) {
    throw new ConfirmationRequired(
      "el tipo tecleado no es el oficial y no hay terminal para preguntarlo: añade --confirm-fx-rate (--yes no basta, es otra pregunta)",
    );
  }
  return answer;
};

/** The ledger's rates against the history next to it, or `unchecked` without one. */
export const ratesOf = async (
  ctx: Context,
  state: LedgerState,
  events: readonly LedgerEvent[],
): Promise<RateCheck> => {
  const folder = dirname(ctx.ledgerPath);
  const active = await new FileEcbHistoryStore(folder).active();
  const { ecb_stale_currency_days } = await readLocalConfig(folder);
  return checkLedgerRates(
    active === undefined ? undefined : readEcbHistory(active.text, active.meta.source),
    state,
    events,
    ecb_stale_currency_days,
    todayInMadrid(ctx.deps.clock),
  );
};

/**
 * The findings of the ECB check, by event, for the notes of the tax report
 * (ADR-0029, point 8). With no history, none: the report still notes a rate
 * dated after its fiscal date, which the projection sees on its own.
 */
export const rateFindingsOf = async (
  ctx: Context,
): Promise<{ event_id: string; code: string }[]> => {
  try {
    const { state, events } = await loadAndProject(ctx.deps, { collectErrors: true });
    const check = await ratesOf(ctx, state, events);
    return check.kind === "unchecked"
      ? []
      : check.findings.flatMap((finding) =>
          finding.event_ids.map((event_id) => ({ event_id, code: finding.code })),
        );
  } catch (error) {
    if (error instanceof DomainError) {
      // The report itself will say what is wrong with the ledger.
      return [];
    }
    throw error;
  }
};
