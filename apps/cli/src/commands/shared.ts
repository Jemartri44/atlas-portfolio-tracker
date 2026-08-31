// Draft construction from flags and the preview → confirm → record flow.

import { access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import {
  completeDraft,
  createUlidGenerator,
  type Draft,
  type FiscalLot,
  fiscalLots,
  type LedgerEvent,
  type LedgerState,
  loadAndProject,
  type PhysicalPosition,
  type ProjectedLedger,
  physicalPositions,
  projectLedger,
  type RealizedGain,
  type RecordResult,
  recordEvent,
  type SupportedEvent,
  type Warning,
} from "@atlas/domain";
import { assertKnownFlags, type Flags, stringFlag } from "../args.js";
import {
  ConfirmationRequired,
  type Context,
  describeWarnings,
  GLOBAL_FLAGS,
  summarize,
} from "../context.js";
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

export const confirmAndRecord = async (
  ctx: Context,
  draft: Record<string, unknown>,
): Promise<RecordResult | undefined> => {
  preview(ctx, "Evento a registrar:", draft);
  if (!(await confirm(ctx, "¿Registrar? [s/N] "))) {
    ctx.io.out("Cancelado.");
    return undefined;
  }
  const result = await recordEvent(ctx.deps, draft as unknown as Draft, {
    confirmDuplicate: ctx.confirmDuplicate,
  });
  ctx.io.out(`Registrado ${summarize(result.event)}.`);
  for (const line of describeWarnings(result.warnings)) {
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
 */
export const loadForQuery = (ctx: Context): Promise<ProjectedLedger> =>
  loadAndProject(ctx.deps, { collectErrors: true });

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

export interface Snapshot {
  positions: PhysicalPosition[];
  lots: FiscalLot[];
}

export interface CandidatePreview {
  candidate: SupportedEvent;
  before: Snapshot;
  after: Snapshot;
  /** Gains the candidate itself books. */
  gains: RealizedGain[];
  warnings: Warning[];
  events: readonly LedgerEvent[];
  state: LedgerState;
}

const snapshotOf = (state: LedgerState, assets: readonly string[]): Snapshot => ({
  positions: physicalPositions(state).filter((p) => assets.includes(p.asset_id)),
  lots: fiscalLots(state).filter((lot) => assets.includes(lot.asset_id)),
});

/**
 * Projects the ledger with the draft completed as a provisional event — the same
 * code path as recordEvent — and returns what changes for the given assets.
 * Throws the domain error the record would throw.
 */
export const previewCandidate = async (
  ctx: Context,
  draft: Record<string, unknown>,
  assets: readonly string[],
): Promise<CandidatePreview> => {
  const { events, state } = await loadAndProject(ctx.deps);
  const candidate = completeDraft(
    ctx.deps,
    draft as unknown as Draft,
    createUlidGenerator(ctx.deps).next(),
  );
  const after = projectLedger([...events, candidate]);
  return {
    candidate,
    before: snapshotOf(state, assets),
    after: snapshotOf(after, assets),
    gains: after.gains.filter((gain) => gain.event_id === candidate.id),
    warnings: after.warnings.filter((warning) => warning.event_id === candidate.id),
    events,
    state,
  };
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
