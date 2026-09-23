// atlas edit <id> --reason … [campos] · atlas delete <id> --reason …

import {
  closedYearImpact,
  correctEvent,
  DomainError,
  type Draft,
  type EventPreview,
  type LedgerEvent,
  loadAndProject,
  previewCorrection,
  previewReversal,
  reverseEvent,
  type SupportedEvent,
  todayInMadrid,
} from "@atlas/domain";
import { type Flags, requireFlag, stringFlag, UsageError } from "../args.js";
import { type Context, describeWarnings, GLOBAL_FLAGS, summarize } from "../context.js";
import { closedYearLines, unfiledYearsNote } from "../output/closed-years.js";
import { priorYearWarning } from "../output/messages.js";
import { ADD_SPECS } from "./add.js";
import { requireId } from "./catalogue.js";
import { confirm, draftOf, fieldOf, preview } from "./shared.js";

/**
 * Which filed returns a rectification reaches, said **before** the question.
 *
 * A correction and an annulment move declared figures exactly as a new event
 * does, and the one moment the warning is useful is before the confirmation.
 * Best effort: if the candidate cannot be built, the write raises the same
 * error right after, with its own message.
 */
const closedNotes = async (
  ctx: Context,
  preview: () => Promise<EventPreview>,
): Promise<string[]> => {
  try {
    const { events, candidates } = await preview();
    if (!events.some((event) => event.type === "tax_return_filed")) {
      return [];
    }
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

const findEvent = (events: readonly LedgerEvent[], id: string): LedgerEvent => {
  const event = events.find((candidate) => candidate.id === id);
  if (event === undefined) {
    throw new UsageError(`el evento ${id} no existe`);
  }
  return event;
};

/** Flags accepted to override fields of an existing event, by type. */
const editableFlags = (type: string): readonly string[] => {
  const spec = Object.values(ADD_SPECS).find((candidate) => candidate.type === type);
  if (spec !== undefined) {
    return spec.flags;
  }
  switch (type) {
    case "order_placed":
      return ["account", "asset", "side", "amount", "quantity", "requested-date", "notes"];
    case "order_updated":
      return ["stage", "date", "notes"];
    case "transfer_requested":
      return [
        "from-account",
        "from-asset",
        "to-account",
        "to-asset",
        "quantity-out",
        "amount-eur",
        "requested-date",
        "notes",
      ];
    case "transfer_request_updated":
      return ["stage", "date", "nav-out", "quantity-out", "notes"];
    case "corporate_action":
    case "thesis_opened":
    case "thesis_closed":
      throw new UsageError(
        `el tipo ${type} no se edita: usa atlas delete <id> --reason … y regístralo de nuevo`,
      );
    default:
      throw new UsageError(
        `el tipo ${type} no se edita con atlas edit; usa los comandos de catálogo o delete`,
      );
  }
};

export const editCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const id = requireId(positionals, 1, "uso: atlas edit <id> --reason … [--campo valor …]");
  const reason = requireFlag(flags, "reason");
  const { events } = await loadAndProject(ctx.deps);
  const target = findEvent(events, id);
  const allowed = editableFlags(target.type);
  for (const name of flags.keys()) {
    if (
      name !== "reason" &&
      !allowed.includes(name) &&
      !(GLOBAL_FLAGS as readonly string[]).includes(name)
    ) {
      throw new UsageError(`opción desconocida para ${target.type}: --${name}`);
    }
  }
  const draft = { ...draftOf(target) };
  for (const flag of allowed) {
    const value = stringFlag(flags, flag);
    if (value !== undefined) {
      draft[fieldOf(flag)] = value;
    }
  }
  preview(ctx, `Evento original ${summarize(target)}:`, draftOf(target));
  preview(ctx, "Evento corregido (se anula el original y se registra este):", draft);
  for (const line of await closedNotes(ctx, () =>
    previewCorrection(ctx.deps, id, draft as unknown as Draft<SupportedEvent>, reason),
  )) {
    ctx.io.out(line);
  }
  if (!(await confirm(ctx, "¿Rectificar? [s/N] "))) {
    ctx.io.out("Cancelado.");
    return 0;
  }
  const result = await correctEvent(
    ctx.deps,
    id,
    draft as unknown as Draft<SupportedEvent>,
    reason,
    { confirmDuplicate: ctx.confirmDuplicate },
  );
  ctx.io.out(`Registrados ${summarize(result.reversal)} y ${summarize(result.event)}.`);
  if (result.priorYear) {
    ctx.io.out(priorYearWarning);
  }
  for (const line of [
    ...describeWarnings(result.warnings),
    ...unfiledYearsNote(result.unfiledPastYears),
  ]) {
    ctx.io.out(line);
  }
  return 0;
};

export const deleteCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const id = requireId(positionals, 1, "uso: atlas delete <id> --reason …");
  const reason = requireFlag(flags, "reason");
  const { events } = await loadAndProject(ctx.deps);
  const target = findEvent(events, id);
  preview(ctx, `Evento a anular ${summarize(target)}:`, draftOf(target));
  for (const line of await closedNotes(ctx, () => previewReversal(ctx.deps, id, reason))) {
    ctx.io.out(line);
  }
  if (!(await confirm(ctx, "¿Anular? [s/N] "))) {
    ctx.io.out("Cancelado.");
    return 0;
  }
  const result = await reverseEvent(ctx.deps, id, reason);
  ctx.io.out(`Registrado ${summarize(result.reversal)}.`);
  if (result.priorYear) {
    ctx.io.out(priorYearWarning);
  }
  for (const line of unfiledYearsNote(result.unfiledPastYears)) {
    ctx.io.out(line);
  }
  return 0;
};
