// `atlas sync …` (feature 015, E3, block 4; `contracts/cli-commands.md`): the
// console syncs **its folder** with the API (ADR-0026, «Quién sincroniza»).
// Every order is explicit — none syncs, initialises, joins or downloads as an
// effect of another (ADR-0026, Part B) —; every write of the folder is under
// its lock and nothing of the network is done with the lock taken (the
// client of the sync holds that); which remote and which session are the
// domain's (`folderSyncState`, `entryToSync`, `entryToStart`), never deduced.

import {
  FileLedgerStore,
  FolderSyncStore,
  folderSyncPresence,
  readLocalConfig,
} from "@atlas/adapters";
import {
  confirmHeldUnit,
  deactivateSync,
  discardHeldUnit,
  finishInitialisation,
  finishRedo,
  heldUnits,
  initialiseRemote,
  joinWithOwnLines,
  recordRedoPlan,
  redoRecorded,
  replaceFromRemote,
  type SyncOptions,
  type SyncOutcome,
  startRedo,
  syncDevice,
} from "@atlas/adapters/sync-client";
import { httpRemote } from "@atlas/adapters/sync-http";
import {
  CURRENT_LEDGER_SCHEMA,
  createUlidGenerator,
  DomainError,
  decodeLines,
} from "@atlas/domain";
import {
  type EntryChoice,
  entryToStart,
  entryToSync,
  expiryWarning,
  folderSyncState,
  serializeRemoteJson,
} from "@atlas/domain/access";
import {
  initState,
  parseHeld,
  RemoteError,
  type RemoteLedger,
  remoteFailed,
  unresolvedHeld,
} from "@atlas/domain/sync";
import { assertKnownFlags, booleanFlag, type Flags, stringFlag, UsageError } from "../args.js";
import { type Context, EXIT, GLOBAL_FLAGS } from "../context.js";
import { describeError } from "../output/messages.js";
import { describeEntryRefusal, INIT_REMOTE_NOT_EMPTY } from "../output/sync.js";
import { type RemoteEnvironment, systemRemote } from "../remote/environment.js";
import { expiryText, where } from "../remote/where.js";
import { confirm } from "./shared.js";

const USAGE_SYNC =
  "uso: atlas sync | atlas sync status | held | confirm <unidad> | discard <unidad> [--reversal-only] | redo <unidad> | init [--origin <https://…>] [--device <id>] | join --from-remote|--with-own-lines [--origin <https://…>] [--device <id>] | redownload | deactivate";

/** A code of the sync, said as the domain's errors are. */
const said = (code: string, details: Readonly<Record<string, unknown>>): string =>
  describeError(new DomainError(code, code, { ...details }));

const optionsOf = (ctx: Context, remoteJson?: string): SyncOptions => ({
  schema: CURRENT_LEDGER_SCHEMA,
  now: () => ctx.deps.clock.now(),
  ...(remoteJson === undefined ? {} : { remoteJson }),
});

const storeOf = (ctx: Context): FolderSyncStore =>
  new FolderSyncStore(new FileLedgerStore(ctx.ledgerPath, CURRENT_LEDGER_SCHEMA));

/** The remote of an entry: the API of its origin, with its token, never following a redirect. */
const remoteOf = (
  entry: Extract<EntryChoice, { entry: unknown }>["entry"],
  env: RemoteEnvironment,
): RemoteLedger => httpRemote({ origin: entry.origin, fetch: env.fetch, token: entry.token });

const refuse = (ctx: Context, message: string): number => {
  ctx.io.err(`Error: ${message}`);
  return EXIT.domain;
};

/** What a sync, an initialisation or a join did, said; and its exit code. */
const report = (ctx: Context, outcome: SyncOutcome, done: string): number => {
  if (outcome.status === "refused") {
    return refuse(
      ctx,
      `(${outcome.refusal.code}) ${said(outcome.refusal.code, outcome.refusal.details)}`,
    );
  }
  if (outcome.status === "stopped") {
    return refuse(ctx, `(${outcome.stop.code}) ${said(outcome.stop.code, outcome.stop.details)}`);
  }
  ctx.io.out(`${done}: ${outcome.uploaded} líneas subidas; quedan ${outcome.pending} pendientes.`);
  if (outcome.held !== undefined) {
    ctx.io.out(
      `Retenida (${outcome.held.code}): ${said(outcome.held.code, {})} Mírala con «atlas sync held».`,
    );
  }
  if (outcome.notice !== undefined) {
    ctx.io.err(
      `Aviso (${outcome.notice.code}): ${said(outcome.notice.code, outcome.notice.details)}`,
    );
  }
  return EXIT.ok;
};

/** Where the folder stands: its state, its credentials and the choice for this order. */
const standing = async (ctx: Context, env: RemoteEnvironment) => {
  const at = await where(ctx, env);
  const { presence } = await folderSyncPresence(at.folder);
  return { at, state: folderSyncState(presence, at.remote) };
};

const refusedChoice = (
  ctx: Context,
  choice: Extract<EntryChoice, { refused: string }>,
  context: { origin?: string; device?: string },
): number => refuse(ctx, `(${choice.refused}) ${describeEntryRefusal(choice, context)}`);

const syncNow = async (ctx: Context, env: RemoteEnvironment): Promise<number> => {
  const { at, state } = await standing(ctx, env);
  const choice = entryToSync(state, at.credentials);
  if ("refused" in choice) {
    return refusedChoice(ctx, choice, at.remote ?? {});
  }
  const outcome = await syncDevice(storeOf(ctx), remoteOf(choice.entry, env), optionsOf(ctx));
  return report(ctx, outcome, "Sincronizado");
};

const status = async (ctx: Context, env: RemoteEnvironment): Promise<number> => {
  const { at, state } = await standing(ctx, env);
  if (state.state === "unsynced") {
    ctx.io.out("Esta carpeta no está sincronizada.");
    return EXIT.ok;
  }
  if (state.state === "unknown_remote") {
    ctx.io.out(
      `Esta carpeta está sincronizada pero no dice con qué remoto: ${describeEntryRefusal({ refused: "sync_remote_unknown" }, {})}`,
    );
  } else {
    ctx.io.out(
      `Remoto: ${state.remote.origin}, como el dispositivo ${state.remote.device_id}${state.state === "half" ? " (a medio empezar: repite «atlas sync init» o «atlas sync join» para terminar)" : state.enabled ? "" : " (sincronización desactivada)"}.`,
    );
  }
  const read = await storeOf(ctx).read();
  const marker =
    read.presence.present && typeof read.presence.marker === "object"
      ? read.presence.marker
      : undefined;
  const held = unresolvedHeld(parseHeld(read.heldText));
  ctx.io.out(
    marker === undefined
      ? `Sin marcador legible: no se sabe cuántas líneas faltan por subir. Retenidas: ${held.length}.`
      : `Pendientes: ${read.ledger.lines.length - marker.synced_lines}. Retenidas: ${held.length}. Última sincronización: ${marker.last_sync_at ?? "ninguna"}.`,
  );
  if (state.state !== "unknown_remote") {
    const choice = entryToSync(state, at.credentials);
    if ("entry" in choice) {
      const { token_expiry_warning_days: warnDays } = await readLocalConfig(at.folder);
      ctx.io.out(
        `Sesión: token ${choice.entry.token_id}, caduca el ${choice.entry.expires_at.slice(0, 10)}${expiryText(expiryWarning(choice.entry, ctx.deps.clock.now().getTime(), warnDays))}`,
      );
    } else {
      ctx.io.out(describeEntryRefusal(choice, state.remote));
    }
  }
  return EXIT.ok;
};

const held = async (ctx: Context): Promise<number> => {
  const views = await heldUnits(storeOf(ctx), optionsOf(ctx));
  if (views.length === 0) {
    ctx.io.out("No hay nada retenido.");
    return EXIT.ok;
  }
  const names = { confirm: "confirmar", redo: "rehacer", discard: "descartar" } as const;
  for (const view of views) {
    ctx.io.out(`Unidad ${view.unit.unit} (${view.unit.reason.code}):`);
    ctx.io.out(`  ${said(view.unit.reason.code, view.unit.reason.details)}`);
    for (const event of decodeLines(view.unit.lines, CURRENT_LEDGER_SCHEMA)) {
      ctx.io.out(`  - ${event.type} ${event.id}`);
    }
    ctx.io.out(
      `  Se puede: ${view.resolutions.map((resolution) => names[resolution]).join(", ")}.`,
    );
  }
  return EXIT.ok;
};

const unitArgument = (positionals: readonly string[]): string => {
  const unit = positionals[2];
  if (unit === undefined) {
    throw new UsageError("falta la unidad: la enseña «atlas sync held»");
  }
  return unit;
};

const redo = async (ctx: Context, unit: string): Promise<number> => {
  const store = storeOf(ctx);
  const options = optionsOf(ctx);
  const ids = createUlidGenerator(ctx.deps);
  const plan = await startRedo(store, unit, () => ids.next(), options);
  if (await redoRecorded(store, unit, options)) {
    // A redo cut between recording and finishing: it is in the ledger by its
    // sealed ids, so it is finished and never recorded twice (review of PR #96, N1).
    await finishRedo(store, unit, options);
    ctx.io.out(
      "El rehacer ya estaba registrado con sus identificadores sellados (se cortó antes de terminar): se termina, sin registrar nada otra vez.",
    );
    return EXIT.ok;
  }
  ctx.io.out(
    plan.kind === "correct"
      ? `Se registrará la corrección de ${plan.target_id} (anulación ${plan.reversal_id} y operación ${plan.id}):`
      : plan.kind === "reverse"
        ? `Se registrará la anulación ${plan.id} de ${plan.target_id}:`
        : `Se registrará la operación ${plan.id}:`,
  );
  ctx.io.out(JSON.stringify(plan.draft));
  if (!(await confirm(ctx, "¿Registrarla así, sobre el libro actual? [s/N] "))) {
    ctx.io.out(
      "No se ha registrado nada. Los identificadores quedan sellados para cuando lo rehagas; para registrar otra cosa, descarta lo retenido.",
    );
    return EXIT.ok;
  }
  await recordRedoPlan(ctx.deps, plan, { confirmDuplicate: ctx.confirmDuplicate });
  await finishRedo(store, unit, options);
  ctx.io.out("Rehecho: lo retenido queda sustituido; sube en la próxima sincronización.");
  return EXIT.ok;
};

const init = async (ctx: Context, flags: Flags, env: RemoteEnvironment): Promise<number> => {
  const { at, state } = await standing(ctx, env);
  const asked = { origin: stringFlag(flags, "origin"), device: stringFlag(flags, "device") };
  const choice = entryToStart("init", state, at.credentials, at.realFolder, clean(asked));
  if ("refused" in choice) {
    return refusedChoice(ctx, choice, at.remote ?? clean(asked));
  }
  const remote = remoteOf(choice.entry, env);
  const options = optionsOf(ctx, serializeRemoteJson(choice.remote));
  let snapshot: Awaited<ReturnType<RemoteLedger["read"]>>;
  try {
    snapshot = await remote.read();
  } catch (error) {
    if (!(error instanceof RemoteError)) {
      throw error;
    }
    const stop = remoteFailed(error);
    return refuse(ctx, `(${stop.code}) ${said(stop.code, stop.details)}`);
  }
  const store = storeOf(ctx);
  const found = initState((await store.read()).ledger.lines, snapshot.text);
  if (found === "other") {
    return refuse(ctx, `(init_remote_not_empty) ${INIT_REMOTE_NOT_EMPTY}`);
  }
  // Exactly this ledger: an initialisation cut after uploading, finished here.
  const outcome =
    found === "same"
      ? await finishInitialisation(store, snapshot, options)
      : await initialiseRemote(store, remote, options);
  return report(
    ctx,
    outcome,
    found === "same"
      ? `Inicialización terminada con ${choice.remote.origin}`
      : `Inicializada ${choice.remote.origin}`,
  );
};

const join = async (ctx: Context, flags: Flags, env: RemoteEnvironment): Promise<number> => {
  const fromRemote = booleanFlag(flags, "from-remote");
  const withOwn = booleanFlag(flags, "with-own-lines");
  if (fromRemote === withOwn) {
    throw new UsageError("elige cómo te unes: --from-remote o --with-own-lines");
  }
  const { at, state } = await standing(ctx, env);
  const asked = { origin: stringFlag(flags, "origin"), device: stringFlag(flags, "device") };
  const choice = entryToStart("join", state, at.credentials, at.realFolder, clean(asked));
  if ("refused" in choice) {
    return refusedChoice(ctx, choice, at.remote ?? clean(asked));
  }
  const store = storeOf(ctx);
  const remote = remoteOf(choice.entry, env);
  const options = optionsOf(ctx, serializeRemoteJson(choice.remote));
  if (fromRemote) {
    return report(
      ctx,
      await replaceFromRemote(store, remote, options, "join"),
      `Unida a ${choice.remote.origin} empezando desde la nube (tu libro anterior queda archivado; lo que la nube no tenía, retenido)`,
    );
  }
  const joined = await joinWithOwnLines(store, remote, options);
  const code = report(
    ctx,
    joined.outcome,
    `Unida a ${choice.remote.origin} con tus líneas como pendientes`,
  );
  if (joined.invalid.length > 0) {
    ctx.io.err(
      `Aviso: ${joined.invalid.length} de tus líneas ya son inválidas (${joined.invalid.map((entry) => `${entry.id}: ${entry.code}`).join(", ")}); se retendrán al sincronizar.`,
    );
  }
  return code;
};

const redownload = async (ctx: Context, env: RemoteEnvironment): Promise<number> => {
  const { at, state } = await standing(ctx, env);
  const choice = entryToSync(state, at.credentials);
  if ("refused" in choice) {
    return refusedChoice(ctx, choice, at.remote ?? {});
  }
  return report(
    ctx,
    await replaceFromRemote(
      storeOf(ctx),
      remoteOf(choice.entry, env),
      optionsOf(ctx),
      "redownload",
    ),
    "Descargado otra vez el libro de la nube (el anterior queda archivado; lo tuyo que no tiene, retenido)",
  );
};

const deactivate = async (ctx: Context): Promise<number> => {
  const refusal = await deactivateSync(storeOf(ctx), optionsOf(ctx));
  if (refusal !== undefined) {
    return refuse(ctx, `(${refusal.code}) ${said(refusal.code, refusal.details)}`);
  }
  ctx.io.out(
    "Sincronización desactivada. Lo retenido se queda aquí. Para volver, únete otra vez con «atlas sync join --from-remote» o «atlas sync join --with-own-lines».",
  );
  return EXIT.ok;
};

/** The flags a user did not give, left out: `undefined` is not a value. */
const clean = (asked: { origin: string | undefined; device: string | undefined }) => ({
  ...(asked.origin === undefined ? {} : { origin: asked.origin }),
  ...(asked.device === undefined ? {} : { device: asked.device }),
});

export const syncCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const env = ctx.remote ?? systemRemote();
  const sub = positionals[1];
  const known = (...own: string[]) => assertKnownFlags(flags, [...GLOBAL_FLAGS, ...own]);
  switch (sub) {
    case undefined:
      known();
      return syncNow(ctx, env);
    case "status":
      known();
      return status(ctx, env);
    case "held":
      known();
      return held(ctx);
    case "confirm":
      known();
      await confirmHeldUnit(storeOf(ctx), unitArgument(positionals), optionsOf(ctx));
      ctx.io.out(
        "Confirmada: vuelve a la cola, delante de lo pendiente; sube en la próxima sincronización.",
      );
      return EXIT.ok;
    case "discard":
      known("reversal-only");
      await discardHeldUnit(
        storeOf(ctx),
        unitArgument(positionals),
        optionsOf(ctx),
        booleanFlag(flags, "reversal-only") ? "reversal" : "unit",
      );
      ctx.io.out("Descartada: queda en sync/discarded.jsonl, fuera del libro.");
      return EXIT.ok;
    case "redo":
      known();
      return redo(ctx, unitArgument(positionals));
    case "init":
      known("origin", "device");
      return init(ctx, flags, env);
    case "join":
      known("from-remote", "with-own-lines", "origin", "device");
      return join(ctx, flags, env);
    case "redownload":
      known();
      return redownload(ctx, env);
    case "deactivate":
      known();
      return deactivate(ctx);
    default:
      throw new UsageError(USAGE_SYNC);
  }
};
