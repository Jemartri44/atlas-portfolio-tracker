// Drafts from the console (feature 012, block 5; ADR-0029, point 9):
//
//   atlas add … --draft          an operation whose ECB rate is not published
//                                yet, kept in drafts/ next to the ledger
//   atlas draft list             what is pending, and what can be confirmed
//   atlas draft confirm <id>     records it with the official rate, as always
//   atlas draft discard <id>     throws it away; nothing is recorded
//
// A draft is not a fact: no command counts it, and **nothing confirms it but
// `atlas draft confirm`**, not even `atlas fx update` bringing its rate. What
// the console says **always** is that there are drafts: every command ends
// with the reminder while one is pending (`pendingDraftsNote`).

import { dirname } from "node:path";
import { FileDraftStore, readLocalConfig } from "@atlas/adapters";
import { type CivilDate, loadAndProject } from "@atlas/domain";
import {
  type DraftStatus,
  draftRecordedAs,
  type EcbHistory,
  type PendingDraft,
  pendingDraftStatus,
  preparePendingDraft,
  recordPendingDraft,
} from "@atlas/domain/ecb";
import { UsageError } from "../args.js";
import { type Context, EXIT } from "../context.js";
import { day } from "../output/ecb.js";
import { historyOf } from "./rates.js";
import { confirm, confirmAndRecord, preview, render } from "./shared.js";

const storeOf = (ctx: Context): FileDraftStore => new FileDraftStore(dirname(ctx.ledgerPath));

/** One line that tells a draft apart: what, where and when. */
const summaryOf = (draft: PendingDraft): string => {
  const event = draft.event;
  const what = [event.asset_id ?? event.from_asset_id ?? event.account_id, event.quantity]
    .filter((value) => typeof value === "string")
    .join(" × ");
  const date = String(event.trade_date ?? event.value_date ?? event.effective_date ?? "?");
  return `${draft.id}  ${String(event.type)} ${what} del ${day(date)} en ${String(event.currency ?? "?")}`;
};

const describeStatus = (status: DraftStatus): string => {
  switch (status.kind) {
    case "no_history":
      return "Sin histórico del BCE junto al libro no se puede saber si ya se publicó el tipo: descárgalo con `atlas fx update`.";
    case "waiting":
      return status.rates
        .map(
          (rate) =>
            `Esperando el tipo de ${rate.currency} del ${day(rate.reference)}: el histórico llega hasta el ${day(rate.latest)}. Actualízalo con \`atlas fx update\`.`,
        )
        .join(" ");
    case "confirmable":
      return `El BCE ya ha publicado el tipo: se puede registrar con \`atlas draft confirm\`. ${status.proposed
        .filter((official) => official.resolution.kind === "resolved")
        .map((official) => {
          const resolution = official.resolution as { rate: string; date: CivilDate };
          return `${official.point.currency}: ${resolution.rate} del ${day(resolution.date)}.`;
        })
        .join(" ")}`;
    case "needs_rate":
      return `El BCE no publica ${status.currencies.join(", ")} para esa fecha: no habrá tipo oficial que proponer. Descarta el borrador y regístralo tecleando el tipo (--fx-rate y --fx-rate-date).`;
  }
};

/** Saves an operation that waits for its ECB rate, after showing it and asking. */
export const saveAsDraft = async (
  ctx: Context,
  draft: Record<string, unknown>,
  history: EcbHistory | undefined,
  staleDays: number,
): Promise<number> => {
  const prepared = await preparePendingDraft(ctx.deps, history, staleDays, draft);
  preview(ctx, "Borrador a guardar (sin tipo; no es un movimiento del libro):", draft);
  if (prepared.duplicates.length > 0) {
    ctx.io.out(
      `Aviso: ya hay ${prepared.duplicates.length === 1 ? "un movimiento registrado" : `${prepared.duplicates.length} movimientos registrados`} con la misma huella (${prepared.duplicates.join(", ")}). Si es el mismo, no hace falta el borrador.`,
    );
  }
  await storeOf(ctx).save(prepared.draft);
  ctx.io.out(
    `Guardado el borrador ${prepared.draft.id} en drafts/. No cuenta en ninguna cifra y no se registra solo: cuando el BCE publique el tipo, \`atlas fx update\` y \`atlas draft confirm ${prepared.draft.id}\`.`,
  );
  return EXIT.ok;
};

const find = async (ctx: Context, id: string | undefined): Promise<PendingDraft | undefined> => {
  if (id === undefined) {
    throw new UsageError("uso: atlas draft confirm|discard <id>");
  }
  const found = (await storeOf(ctx).list()).drafts.find((draft) => draft.id === id);
  if (found === undefined) {
    ctx.io.err(`Error: no hay ningún borrador ${id} en drafts/. Consulta \`atlas draft list\`.`);
  }
  return found;
};

const listDrafts = async (ctx: Context): Promise<number> => {
  const { drafts, unreadable } = await storeOf(ctx).list();
  const { history, problem, staleDays } = await ecbOf(ctx);
  const { state, events } = await loadAndProject(ctx.deps, { collectErrors: true });
  const rows = drafts.map((draft) => ({
    draft,
    status: pendingDraftStatus(history, state, draft, staleDays),
    recorded: draftRecordedAs(state, events, draft),
  }));
  const lines = [
    drafts.length === 0
      ? "No hay borradores pendientes."
      : `${drafts.length === 1 ? "Un borrador pendiente" : `${drafts.length} borradores pendientes`}: no cuentan en ninguna cifra hasta que se registran.`,
    ...(problem === undefined
      ? []
      : [`El histórico del BCE guardado no se puede usar (${problem}).`]),
    ...rows.flatMap(({ draft, status, recorded }) => [
      summaryOf(draft),
      recorded.length > 0
        ? `  Ya está registrado (${recorded.join(", ")}): \`atlas draft confirm ${draft.id}\` solo quitará el borrador.`
        : `  ${describeStatus(status)}`,
    ]),
    ...unreadable.map(
      (name) =>
        `drafts/${name} no se puede leer: no se ha tocado. Revísalo a mano; puede ser la única copia de una operación.`,
    ),
  ];
  render(
    ctx,
    {
      drafts: rows.map(({ draft, status }) => ({
        ...draft,
        status: status.kind,
        ...(status.kind === "confirmable" ? { proposed: status.event } : {}),
      })),
      unreadable,
    },
    lines.join("\n"),
  );
  return EXIT.ok;
};

const ecbOf = async (
  ctx: Context,
): Promise<{ history?: EcbHistory; problem?: string; staleDays: number }> => {
  const { ecb_stale_currency_days } = await readLocalConfig(dirname(ctx.ledgerPath));
  return { ...(await historyOf(ctx)), staleDays: ecb_stale_currency_days };
};

const confirmDraft = async (ctx: Context, id: string | undefined): Promise<number> => {
  const draft = await find(ctx, id);
  if (draft === undefined) {
    return EXIT.domain;
  }
  const { history, staleDays } = await ecbOf(ctx);
  const { state, events } = await loadAndProject(ctx.deps, { collectErrors: true });
  // Confirmed already, and the draft was not removed (a cut, a failure of
  // drafts/): confirming again only removes it — never a second line.
  const recorded = draftRecordedAs(state, events, draft);
  if (recorded.length > 0) {
    await storeOf(ctx).remove(draft.id);
    ctx.io.out(
      `El borrador ${draft.id} ya estaba registrado (${recorded.join(", ")}): se quita de drafts/ sin registrarlo otra vez.`,
    );
    return EXIT.ok;
  }
  const status = pendingDraftStatus(history, state, draft, staleDays);
  if (status.kind !== "confirmable") {
    ctx.io.out(describeStatus(status));
    return EXIT.domain;
  }
  const notes = status.proposed.flatMap((official) =>
    official.resolution.kind === "resolved"
      ? [
          `Tipo del BCE propuesto para ${official.point.currency}: ${official.resolution.rate} del ${day(official.resolution.date)}, el publicado en o antes de la fecha ${official.point.basis === "fiscal" ? "fiscal" : "de la operación"} (${day(official.point.reference)}).`,
        ]
      : [],
  );
  const result = await confirmAndRecord(ctx, status.event, notes, (options) =>
    recordPendingDraft(ctx.deps, storeOf(ctx), draft, status.event, options),
  );
  if (result !== undefined) {
    ctx.io.out(`Borrador ${draft.id} registrado y quitado de drafts/.`);
  }
  return EXIT.ok;
};

const discardDraft = async (ctx: Context, id: string | undefined): Promise<number> => {
  const draft = await find(ctx, id);
  if (draft === undefined) {
    return EXIT.domain;
  }
  ctx.io.out(summaryOf(draft));
  if (!(await confirm(ctx, "¿Descartar el borrador? No se registra nada. [s/N] "))) {
    ctx.io.out("Cancelado.");
    return EXIT.ok;
  }
  await storeOf(ctx).remove(draft.id);
  ctx.io.out(`Borrador ${draft.id} descartado.`);
  return EXIT.ok;
};

export const draftCommand = async (ctx: Context, positionals: string[]): Promise<number> => {
  switch (positionals[1]) {
    case "list":
      return listDrafts(ctx);
    case "confirm":
      return confirmDraft(ctx, positionals[2]);
    case "discard":
      return discardDraft(ctx, positionals[2]);
    default:
      throw new UsageError("uso: atlas draft list|confirm <id>|discard <id>");
  }
};

/**
 * The reminder every command ends with while a draft is pending: said
 * **always**, not only by a command nobody runs. Best effort: a folder that
 * cannot be listed must not turn a successful command into a failure.
 */
export const pendingDraftsNote = async (ledgerPath: string): Promise<string | undefined> => {
  try {
    const { drafts, unreadable } = await new FileDraftStore(dirname(ledgerPath)).list();
    const total = drafts.length + unreadable.length;
    if (total === 0) {
      return undefined;
    }
    return `Pendiente: ${total === 1 ? "hay un borrador" : `hay ${total} borradores`} sin registrar en drafts/ (no cuentan en ninguna cifra). Consulta \`atlas draft list\`.`;
  } catch {
    return "No se ha podido leer drafts/ junto al libro: puede haber borradores pendientes.";
  }
};
