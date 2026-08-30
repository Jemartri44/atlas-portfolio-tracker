// Draft construction from flags and the preview → confirm → record flow.

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
