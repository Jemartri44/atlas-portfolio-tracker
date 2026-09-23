// Draft construction from flags and the preview → confirm → record flow.

import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import {
  type CivilDate,
  DomainError,
  type Draft,
  isCivilDate,
  type LedgerEvent,
  type LedgerState,
  loadAndProject,
  type ProjectedLedger,
  previewEvent,
  type RecordResult,
  recordEvent,
  type SupportedEvent,
  todayInMadrid,
} from "@atlas/domain";
import { closedYearImpact } from "@atlas/domain/fiscal";
import { assertKnownFlags, type Flags, stringFlag, UsageError } from "../args.js";
import {
  ConfirmationRequired,
  type Context,
  describeWarnings,
  GLOBAL_FLAGS,
  summarize,
} from "../context.js";
import { closedYearLines, unfiledYearsNote } from "../output/closed-years.js";
import { keyValue } from "../output/table.js";

const FLAG_ALIASES: Record<string, string> = {
  account: "account_id",
  asset: "asset_id",
  "from-account": "from_account_id",
  "from-asset": "from_asset_id",
  "to-account": "to_account_id",
  "to-asset": "to_asset_id",
  order: "order_id",
  request: "request_id",
  "reference-etf": "reference_etf_id",
  type: "asset_type",
  thesis: "thesis_id",
};

export const fieldOf = (flag: string): string => FLAG_ALIASES[flag] ?? flag.replaceAll("-", "_");

export interface DraftSpec {
  type: SupportedEvent["type"];
  /** Flags accepted by the command (kebab-case, without the global ones). */
  flags: readonly string[];
  defaults?: Record<string, string>;
}

/** Builds a draft from the string flags of a command; every value stays a string for the domain to validate. */
export const draftFromFlags = (spec: DraftSpec, flags: Flags): Record<string, unknown> => {
  assertKnownFlags(flags, [...spec.flags, ...GLOBAL_FLAGS]);
  const draft: Record<string, unknown> = { type: spec.type, ...spec.defaults };
  for (const flag of spec.flags) {
    const value = stringFlag(flags, flag);
    if (value !== undefined) {
      draft[fieldOf(flag)] = value;
    }
  }
  return draft;
};

/**
 * `--date` of a read-only view, today in Europe/Madrid when it is absent. A
 * typo has to fail as a usage error and not produce a plausible answer: the
 * date comparisons are lexicographic, so a word would pick the last price and
 * the last settings of the whole ledger and report an age of NaN.
 */
export const dateFlag = (ctx: Context, flags: Flags): CivilDate => {
  const raw = stringFlag(flags, "date");
  if (raw === undefined) {
    return todayInMadrid(ctx.deps.clock);
  }
  if (!isCivilDate(raw)) {
    throw new UsageError(`--date debe ser una fecha YYYY-MM-DD válida (recibido: ${raw})`);
  }
  return raw;
};

export const preview = (ctx: Context, title: string, draft: Record<string, unknown>): void => {
  ctx.io.out(title);
  ctx.io.out(keyValue(draft));
};

/** Asks unless --yes; throws ConfirmationRequired when it cannot ask. Returns false when the user declines. */
export const confirm = async (ctx: Context, question: string): Promise<boolean> => {
  if (ctx.yes) {
    return true;
  }
  const answer = await ctx.io.confirm(question);
  if (answer === undefined) {
    throw new ConfirmationRequired();
  }
  return answer;
};

/**
 * Which filed returns a write would reach, and how much it moves of each.
 *
 * The **fact** comes free with every write (`RecordResult.closed`), so no
 * interface can forget to warn; the **figure** is put on here, where the tax
 * engine is already available. The fast path is the one that matters: a ledger
 * with nothing filed —every ledger today— stops at reading the file, without a
 * single projection.
 *
 * Best effort on purpose: if the candidate cannot be built, nothing is printed
 * and the write raises the same error right after, with its own message.
 */
export const closedYearNotes = async (
  ctx: Context,
  draft: Record<string, unknown>,
): Promise<string[]> => {
  try {
    const { events } = await ctx.deps.store.load();
    if (!events.some((event) => event.type === "tax_return_filed")) {
      return [];
    }
    const { candidates } = await previewEvent(ctx.deps, draft as unknown as Draft);
    return closedYearLines(
      closedYearImpact(
        { events },
        { events: [...events, ...candidates] },
        todayInMadrid(ctx.deps.clock),
      ),
    );
  } catch (error) {
    if (error instanceof DomainError) {
      return [];
    }
    throw error;
  }
};

export const confirmAndRecord = async (
  ctx: Context,
  draft: Record<string, unknown>,
  /** Lines printed between the preview and the question: what the user has to know *before* saying yes. */
  notes: readonly string[] = [],
): Promise<RecordResult | undefined> => {
  preview(ctx, "Evento a registrar:", draft);
  for (const note of [...notes, ...(await closedYearNotes(ctx, draft))]) {
    ctx.io.out(note);
  }
  if (!(await confirm(ctx, "¿Registrar? [s/N] "))) {
    ctx.io.out("Cancelado.");
    return undefined;
  }
  const result = await recordEvent(ctx.deps, draft as unknown as Draft, {
    confirmDuplicate: ctx.confirmDuplicate,
    acceptInvalid: ctx.acceptInvalid,
  });
  ctx.io.out(`Registrado ${summarize(result.event)}.`);
  if (result.newlyInvalid.length > 0) {
    ctx.io.out(
      `${result.newlyInvalid.length} eventos registrados quedan inválidos bajo la configuración nueva; las consultas lo avisarán. Ejecuta \`atlas check\`.`,
    );
  }
  for (const line of [
    ...describeWarnings(result.warnings),
    ...unfiledYearsNote(result.unfiledPastYears),
  ]) {
    ctx.io.out(line);
  }
  return result;
};

/** Strips the envelope and the fingerprint of an existing event to obtain its draft. */
export const draftOf = (event: LedgerEvent): Record<string, unknown> => {
  const {
    schema_version: _version,
    id: _id,
    recorded_at: _recordedAt,
    corrects_id: _corrects,
    fingerprint: _fingerprint,
    ...rest
  } = event as LedgerEvent & { fingerprint?: string };
  return rest;
};

export const render = (ctx: Context, data: unknown, text: string): void => {
  ctx.io.out(ctx.json ? JSON.stringify(data, null, 2) : text);
};

/**
 * Every read-only command projects in degraded mode (ADR-0015): one invalid
 * event must never leave the ledger unreadable, because reading it is the only
 * way to repair it. Mutations keep loading strictly.
 *
 * A view asked for a past date passes it as `asOf`, so the answer is the
 * portfolio of that day and not the one of today read with the prices of then
 * (data-schema.md §7).
 */
export const loadForQuery = (ctx: Context, asOf?: CivilDate): Promise<ProjectedLedger> =>
  loadAndProject(ctx.deps, {
    collectErrors: true,
    ...(asOf === undefined ? {} : { asOf }),
  });

/** Visible degradation (constitution V): never a partial answer that looks complete. */
export const degradedHeader = (state: LedgerState): string | undefined =>
  state.invalid.length === 0
    ? undefined
    : `Aviso: ${state.invalid.length} ${
        state.invalid.length === 1 ? "evento inválido" : "eventos inválidos"
      } en el libro; lo que sigue es una proyección parcial. Ejecuta \`atlas check\` para verlos.`;

/**
 * Renders the result of a read-only command: the warning header before the
 * table, and `invalid_count` beside the payload in JSON, where a header would
 * corrupt the output.
 */
export const renderQuery = (
  ctx: Context,
  state: LedgerState,
  data: unknown,
  text: string,
  channel: "out" | "err" = "out",
): void => {
  if (ctx.json) {
    ctx.io.out(JSON.stringify({ invalid_count: state.invalid.length, data }, null, 2));
    return;
  }
  const header = degradedHeader(state);
  if (header !== undefined) {
    ctx.io[channel](header);
  }
  ctx.io.out(text);
};

/** Type of the event that created a lot or booked a gain; corporate actions add their kind. */
export const originOf = (
  events: readonly LedgerEvent[],
  state: LedgerState,
  sourceEventId: string,
): string => {
  const position = state.positionOf.get(sourceEventId);
  const event = position === undefined ? undefined : events[position];
  if (event === undefined) {
    return "";
  }
  return event.type === "corporate_action" ? `corporate_action:${event.kind}` : event.type;
};

/**
 * The git working tree the path belongs to, if any: a `.git` entry (directory
 * or file, so worktrees count) found walking up from it. Writing a ledger copy
 * inside the repository is how private data ends up in a commit, so the CLI
 * asks first. No `git` process involved.
 */
export const insideGitWorktree = async (path: string): Promise<string | undefined> => {
  let current = resolve(path);
  let parent = dirname(current);
  while (true) {
    try {
      await access(join(current, ".git"));
      return current;
    } catch {
      // Not a working tree root; keep walking up.
    }
    if (parent === current) {
      return undefined;
    }
    current = parent;
    parent = dirname(current);
  }
};

/** Asks before writing `destination` when it falls inside a git working tree. Returns false if the user declines. */
export const confirmOutsideRepository = async (
  ctx: Context,
  destination: string,
): Promise<boolean> => {
  const repository = await insideGitWorktree(destination);
  if (repository === undefined) {
    return true;
  }
  ctx.io.out(
    `El destino está dentro del repositorio ${repository}: un fichero con datos reales podría acabar en un commit.`,
  );
  return confirm(ctx, "¿Escribir de todas formas? [s/N] ");
};
