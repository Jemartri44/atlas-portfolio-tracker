// atlas admin devices | revoke-all-tokens | forget-device | compact | restore
// --env <e> (feature 015, E5; ADR-0026, Part A; ADR-0032; ADR-0033, point 8;
// `contracts/cli-commands.md`): operations of administration **over the copy
// of reference**, with the short-lived credentials of the role
// `atlas-<env>-admin` (the standard chain of the SDK) — **never with the
// token of a device and never through the API**, which only appends. Nothing
// of this is reachable from `apps/api` (architecture test).

import { dirname } from "node:path";
import { folderSyncPresence } from "@atlas/adapters";
import {
  DependencyUnavailable,
  DeviceStore,
  S3LedgerBlob,
  TokenRegistry,
} from "@atlas/adapters/aws";
import { BlobLedgerStore } from "@atlas/adapters/blob";
import {
  compactLedger,
  DomainError,
  decodeLines,
  integrity,
  type LedgerEvent,
  type LedgerStore,
  planCompact,
  projectLedger,
  type UseCaseDeps,
} from "@atlas/domain";
import type { DeviceObject, TokenRecord } from "@atlas/domain/access";
import {
  type AdminDeviceRead,
  compareForRestore,
  forgetRefusal,
  forgottenDevice,
  remoteRewritePermission,
} from "@atlas/domain/admin";
import { linesOfText, RefusedError, syncArchiveName } from "@atlas/domain/sync";
import { deepCheck } from "@atlas/domain/tools";
import type { AdminClients } from "../admin/environment.js";
import {
  assertKnownFlags,
  booleanFlag,
  type Flags,
  listFlag,
  requireFlag,
  UsageError,
} from "../args.js";
import { ConfirmationRequired, type Context, EXIT, GLOBAL_FLAGS } from "../context.js";
import { table } from "../output/table.js";
import { render } from "./shared.js";

const LEDGER_KEY = "ledger/ledger.jsonl";

/** The name of an environment, as `admin.json` names it (review of PR #98, N6). */
const ENVIRONMENT = /^[a-z][a-z0-9-]*$/;

/** `--env`, required and with the shape of a name: never `toString` nor `__proto__`. */
export const environmentFlag = (flags: Flags): string => {
  const environment = requireFlag(flags, "env");
  if (!ENVIRONMENT.test(environment)) {
    throw new UsageError(`--env no es el nombre de un entorno: «${environment}»`);
  }
  return environment;
};

/** The clients of the environment `--env` names, with the role of administration. */
export const adminClientsOf = async (ctx: Context, flags: Flags): Promise<AdminClients> => {
  const environment = environmentFlag(flags);
  if (ctx.admin !== undefined) {
    return ctx.admin.clientsFor(environment);
  }
  const { systemAdminAccess } = await import("../admin/environment.js");
  return systemAdminAccess().clientsFor(environment);
};

/**
 * What AWS answers, said without the message of the SDK: unavailable (a 5xx,
 * a throttle, the network) or refused (no credentials, access denied, an
 * expired session). Anything else is left as it is.
 */
export const translateAwsFailure = (error: unknown): unknown => {
  if (error instanceof DependencyUnavailable) {
    return new DomainError("admin_remote_unavailable", "aws is not answering", {});
  }
  if (
    error instanceof Error &&
    !(error instanceof DomainError) &&
    ("$metadata" in error || /^(CredentialsProviderError|TokenProviderError)$/.test(error.name))
  ) {
    return new DomainError("admin_aws_refused", "aws refused the order", { name: error.name });
  }
  return error;
};

/**
 * The confirmation of an order that rewrites the remote or forgets a device
 * (review of PR #98, N1; ADR-0032, note of 2026-09-27): never `--yes`, which
 * is written before the list is on screen, and never a plain yes — the user
 * types the name of the environment, with what is at stake in front.
 */
const confirmEnvironment = async (
  ctx: Context,
  environment: string,
  question: string,
): Promise<boolean> => {
  const typed = await ctx.io.ask?.(`${question} Escribe «${environment}» para seguir: `);
  if (typed === undefined) {
    throw new ConfirmationRequired(
      "hace falta confirmar escribiendo el nombre del entorno, y no hay terminal interactiva",
    );
  }
  return typed === environment;
};

/** Every object under `sync/devices/`, read strictly: an unreadable one is kept as such. */
const readDevices = async (clients: AdminClients): Promise<AdminDeviceRead[]> => {
  const devices = new DeviceStore(clients.objects);
  const reads: AdminDeviceRead[] = [];
  for (const id of await devices.ids()) {
    const read = await devices.read(id);
    if (read !== undefined) {
      reads.push(read === "unreadable" ? { device_id: id, unreadable: true } : read);
    }
  }
  return reads;
};

/** `atlas admin devices`: every object of `sync/devices/`, with its type and its state. */
const devicesOrder = async (ctx: Context, clients: AdminClients): Promise<number> => {
  const reads = await readDevices(clients);
  render(
    ctx,
    { devices: reads },
    reads.length === 0
      ? "No hay ningún dispositivo en sync/devices/."
      : table(
          [
            "dispositivo",
            "tipo",
            "estado",
            "pendientes",
            "retenidas",
            "última sincronización",
            "nombre",
          ],
          reads.map((read) =>
            "unreadable" in read
              ? [read.device_id, "?", "ilegible", "?", "?", "", ""]
              : [
                  read.device_id,
                  read.type === "web" ? "web" : "consola",
                  read.state === "active" ? "activo" : "olvidado",
                  String(read.pending),
                  String(read.held),
                  read.last_sync_at ?? "",
                  read.device_name ?? "",
                ],
          ),
        ),
  );
  return EXIT.ok;
};

/**
 * Revokes the live records `which` picks with the **same code the API
 * writes** (`TokenRegistry.revoke`, `revokedRecord`; §7 P4): one already
 * revoked is left as it is, so it can be repeated without harm. An unreadable
 * record is said and left: the API refuses it anyway.
 */
const revokeTokens = async (
  clients: AdminClients,
  now: number,
  which: (record: TokenRecord) => boolean,
): Promise<{ revoked: string[]; already: number; unreadable: string[] }> => {
  const registry = new TokenRegistry(clients.parameters, clients.ssmPrefix, {});
  const revoked: string[] = [];
  const unreadable: string[] = [];
  let already = 0;
  for (const { tokenId, read } of await registry.list()) {
    if (read === "unreadable") {
      unreadable.push(tokenId);
    } else if (!which(read)) {
      // Another device's.
    } else if (read.revoked_at !== undefined) {
      already += 1;
    } else {
      await registry.revoke(read, now);
      revoked.push(tokenId);
    }
  }
  return { revoked, already, unreadable };
};

const revokeAllOrder = async (ctx: Context, clients: AdminClients): Promise<number> => {
  const done = await revokeTokens(clients, ctx.deps.clock.now().getTime(), () => true);
  render(
    ctx,
    done,
    [
      `Revocados ${done.revoked.length} tokens; ${done.already} ya lo estaban y se han dejado igual.`,
      ...(done.unreadable.length === 0
        ? []
        : [
            `Registros que esta consola no entiende, sin tocar: ${done.unreadable.join(", ")}. No se puede asegurar que estén revocados: revísalos con la CLI de AWS (procedimiento «Revocar todos los tokens», apartado 2).`,
          ]),
    ].join("\n"),
  );
  // Revoking **all** is not done while a record could not be read (review of
  // PR #98, N2): a console older than the API may not understand a live one.
  return done.unreadable.length === 0 ? EXIT.ok : EXIT.domain;
};

/**
 * `atlas admin forget-device <id> [--force]` (§7 P9, amended in §7.1 bis, B1):
 * **first** its tokens are revoked, **then** its object is rewritten on the
 * ETag it was read at, with `state: "forgotten"`. Never deleted. A cut between
 * the two leaves it revoked and not forgotten — safe, and repeating finishes
 * it; forgotten and not revoked cannot exist.
 */
const forgetOrder = async (
  ctx: Context,
  clients: AdminClients,
  environment: string,
  id: string,
  force: boolean,
): Promise<number> => {
  const devices = new DeviceStore(clients.objects);
  const first = await devices.readForUpdate(id);
  const refusal = forgetRefusal(first?.device, force);
  const sweep = () =>
    revokeTokens(clients, ctx.deps.clock.now().getTime(), (record) => record.device_id === id);
  if (refusal === "already_forgotten") {
    // A cut after the mark and before the sweep below is finished here.
    const late = await sweep();
    ctx.io.out(
      late.revoked.length === 0
        ? `El dispositivo ${id} ya estaba olvidado: no se ha tocado nada.`
        : `El dispositivo ${id} ya estaba olvidado; revocados ${late.revoked.length} tokens suyos que seguían vivos.`,
    );
    return EXIT.ok;
  }
  if (refusal !== undefined) {
    throw new RefusedError(refusal);
  }
  const device = first?.device as DeviceObject;
  if (device.pending > 0 || device.held > 0) {
    ctx.io.out(
      `Con --force: ${device.pending} operaciones pendientes y ${device.held} retenidas de ese dispositivo dejarán de verse desde aquí. Siguen en él, pero nunca llegarán a la nube.`,
    );
  }
  const described = [
    device.type === "web" ? "web" : "consola",
    ...(device.device_name === undefined ? [] : [`«${device.device_name}»`]),
    `última sincronización ${device.last_sync_at ?? "ninguna"}`,
  ].join(", ");
  if (
    !(await confirmEnvironment(
      ctx,
      environment,
      `¿Olvidar en ${environment} el dispositivo ${id} (${described}) y revocar sus tokens?`,
    ))
  ) {
    ctx.io.out("Cancelado: no se ha tocado nada.");
    return EXIT.ok;
  }
  const now = ctx.deps.clock.now();
  // First the tokens: a cut here leaves it revoked and alive, which is safe.
  const tokens = await revokeTokens(clients, now.getTime(), (record) => record.device_id === id);
  // Then the mark, on the ETag it was read at. A write that came in between is
  // read again, never written over, and the rule is asked again.
  let current = first;
  for (let attempt = 1; ; attempt += 1) {
    const again = forgetRefusal(current?.device, force);
    if (again === "already_forgotten") {
      break;
    }
    if (again !== undefined) {
      throw new RefusedError(again);
    }
    const read = current as { device: DeviceObject; etag: string };
    if (
      (await devices.replace(forgottenDevice(read.device, now.toISOString()), read.etag)) ===
      "written"
    ) {
      break;
    }
    if (attempt === 3) {
      throw new DomainError(
        "forget_contention",
        "the object changed three times while forgetting it",
        {
          device_id: id,
        },
      );
    }
    current = await devices.readForUpdate(id);
  }
  // And again once it is forgotten (review of PR #98, N8): a sign-in that
  // ended between the revocation and the mark left a token nobody revoked.
  const late = await sweep();
  const revoked = [...tokens.revoked, ...late.revoked];
  render(
    ctx,
    { device_id: id, revoked, already: tokens.already },
    [
      `Olvidado ${id}: revocados ${revoked.length} tokens (${tokens.already} ya lo estaban).`,
      "La API rechazará toda credencial de ese dispositivo con device_forgotten. Si era una web, recibirá otro dispositivo al volver a iniciar sesión.",
    ].join("\n"),
  );
  return EXIT.ok;
};

/**
 * What refuses a rewrite of the remote from here (ADR-0026, Part A): this
 * folder's queue when it is synced, and every device's published one.
 */
const rewriteRefusal = async (ctx: Context, clients: AdminClients) => {
  const { presence } = await folderSyncPresence(dirname(ctx.ledgerPath));
  const pendingHere =
    presence.present && typeof presence.marker === "object"
      ? (await ctx.deps.store.load()).lines.length - presence.marker.synced_lines
      : 0;
  return remoteRewritePermission(presence, pendingHere, await readDevices(clients));
};

/** The remote ledger as a store: the bytes of S3, archiving before every rewrite. */
const remoteStore = (ctx: Context, clients: AdminClients): LedgerStore =>
  new BlobLedgerStore(new S3LedgerBlob(clients.objects), ctx.deps.store.schema);

/**
 * `atlas admin compact` (ADR-0026, Part A): refused by the rule of the
 * rewrite; the plan and the confirmation of the local `compact`; the store
 * archives the bytes first (`archive/`, never overwritten) and writes on the
 * condition of the remote that was read. Every device then sees the rewrite by
 * the hash of its prefix and downloads again when its user asks.
 */
const compactOrder = async (
  ctx: Context,
  clients: AdminClients,
  environment: string,
  flags: Flags,
): Promise<number> => {
  const refusal = await rewriteRefusal(ctx, clients);
  if (refusal !== undefined) {
    throw new RefusedError(refusal);
  }
  const deps: UseCaseDeps = { ...ctx.deps, store: remoteStore(ctx, clients) };
  const plan = await planCompact(deps);
  if (plan.outdated === 0) {
    ctx.io.out(
      `Nada que compactar en la nube: las ${plan.lines} líneas están en schema_version ${plan.targetVersion}.`,
    );
    return EXIT.ok;
  }
  ctx.io.out(
    `La nube tiene ${plan.lines} líneas, ${plan.outdated} en versiones anteriores a ${plan.targetVersion}. El original se archivará como archive/${plan.archiveName}, que nunca se sobrescribe.`,
  );
  if (!(await confirmEnvironment(ctx, environment, `¿Compactar la nube de ${environment}?`))) {
    ctx.io.out("Cancelado: no se ha tocado nada.");
    return EXIT.ok;
  }
  const result = await compactLedger(deps, plan, {
    acceptUnverified: listFlag(flags, "accept-unverified"),
  });
  render(
    ctx,
    result,
    result.status === "compacted"
      ? `Compactada la nube: ${result.linesBefore} → ${result.linesAfter} líneas. El original está en archive/${result.archiveName}. Cada dispositivo verá la reescritura al sincronizar, se detendrá y volverá a descargar cuando su usuario lo pida.`
      : "Nada que compactar en la nube.",
  );
  return EXIT.ok;
};

/**
 * The bytes of the candidate as text, **strictly** (review of PR #98, N9): a
 * byte that is not UTF-8 would become U+FFFD, pass the check and be written
 * as other bytes than the copy's. Refused instead, as a candidate that does
 * not pass.
 */
const strictText = (bytes: Uint8Array): string => {
  try {
    // `ignoreBOM`: a BOM is kept as a character, so the first line cannot be
    // read and the copy is refused — never written back without it (round 2
    // of the review of PR #98).
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new DomainError("restore_candidate_invalid", "the candidate is not UTF-8", {
      invalid: [],
      findings: ["not_utf8"],
    });
  }
};

/** Step 1 of ADR-0032: the candidate, from a version of S3, a monthly dump or a file. */
const candidateText = async (clients: AdminClients, from: string): Promise<string> => {
  if (from.startsWith("s3-version:")) {
    const stored = await clients.objects.getVersion(LEDGER_KEY, from.slice("s3-version:".length));
    if (stored === undefined) {
      throw new DomainError("restore_source_missing", `no version ${from}`, { from });
    }
    return strictText(stored.body);
  }
  if (/^backups\/\d{4}-\d{2}$/.test(from)) {
    const stored = await clients.objects.get(`${from}/ledger.jsonl`);
    if (stored === undefined) {
      throw new DomainError("restore_source_missing", `no dump ${from}`, { from });
    }
    return strictText(stored.body);
  }
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(from).catch(() => undefined);
  if (bytes === undefined) {
    throw new DomainError("restore_source_missing", `no file ${from}`, { from });
  }
  return strictText(bytes);
};

/** Step 2: it loads with the current schema, projects with nothing invalid, and verifies. */
const checkCandidate = (ctx: Context, lines: string[]): LedgerEvent[] => {
  const events = decodeLines(lines, ctx.deps.store.schema);
  const state = projectLedger(events, { collectErrors: true });
  const errors = [...integrity(state), ...deepCheck(lines, events, state, ctx.deps.store.schema)]
    .filter((finding) => finding.severity === "error")
    .map((finding) => finding.code);
  if (state.invalid.length > 0 || errors.length > 0) {
    throw new DomainError("restore_candidate_invalid", "the candidate does not pass the check", {
      invalid: state.invalid.map((entry) => entry.event.id),
      findings: errors,
    });
  }
  return events;
};

/**
 * `atlas admin restore --from …` (ADR-0032), **the six steps in order**, none
 * skipped, and refused by the rule of the rewrite. Restoring never deletes:
 * the current bytes are archived first (`archive/pre-restore-…`), and the
 * candidate is written **line by line as it is** (`replaceLines`, never
 * `replace`, which reserialises), on the condition of the remote compared.
 */
const restoreOrder = async (
  ctx: Context,
  clients: AdminClients,
  environment: string,
  flags: Flags,
): Promise<number> => {
  const refusal = await rewriteRefusal(ctx, clients);
  if (refusal !== undefined) {
    throw new RefusedError(refusal);
  }
  // 1. The candidate.
  const from = requireFlag(flags, "from");
  const lines = linesOfText(await candidateText(clients, from));
  ctx.io.out(`1. Copia candidata: ${from}.`);
  // 2. Checked before touching anything.
  const events = checkCandidate(ctx, lines);
  ctx.io.out(
    `2. Comprobada: ${lines.length} líneas, sin eventos inválidos ni errores de la verificación a fondo.`,
  );
  // 3. Compared with the remote, by identifier.
  const store = remoteStore(ctx, clients);
  const remote = await store.load();
  const comparison = compareForRestore(events, remote.events);
  const said =
    comparison.kind === "same"
      ? "tiene los mismos eventos que la nube, en el mismo orden."
      : comparison.kind === "prefix"
        ? `es un prefijo de la nube: se pierde esta cola de ${comparison.lost.length} eventos: ${comparison.lost.join(", ")}.`
        : `difiere de la nube. Solo en la copia: ${comparison.onlyCandidate.join(", ") || "nada"}. Solo en la nube, que se pierde: ${comparison.onlyRemote.join(", ") || "nada"}.`;
  ctx.io.out(`3. La copia ${said}`);
  // 4. The explicit yes, with that list on screen.
  if (
    !(await confirmEnvironment(
      ctx,
      environment,
      `4. ¿Sustituir la nube de ${environment} por esta copia?`,
    ))
  ) {
    ctx.io.out("Cancelado: no se ha tocado nada.");
    return EXIT.ok;
  }
  // 5. Archived first, then the lines as they are, on the condition of step 3.
  const archive = syncArchiveName("restore", ctx.deps.clock.now(), remote.etag);
  await store.replaceLines(lines, remote.etag, archive);
  ctx.io.out(`5. Restaurada. Lo que había está en archive/${archive}, que nunca se sobrescribe.`);
  // 6. What each device has to do.
  ctx.io.out(
    "6. Cada dispositivo verá la reescritura al sincronizar y se detendrá (remote_rewritten). Que su usuario vuelva a descargar: lo que tenía y la copia no queda retenido para revisarlo, y nunca se vuelve a subir solo.",
  );
  return EXIT.ok;
};

const USAGE =
  "uso: atlas admin devices | revoke-all-tokens | forget-device <dispositivo> [--force] | compact [--accept-unverified <id>]… | restore --from <fichero|s3-version:<id>|backups/AAAA-MM>, siempre con --env <entorno>";

export const adminCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["env", "force", "from", "accept-unverified", ...GLOBAL_FLAGS]);
  const order = positionals[1];
  if (
    order === undefined ||
    !["devices", "revoke-all-tokens", "forget-device", "compact", "restore"].includes(order)
  ) {
    throw new UsageError(USAGE);
  }
  const id = positionals[2];
  if (order === "forget-device" && id === undefined) {
    throw new UsageError("falta el dispositivo: los enseña «atlas admin devices»");
  }
  // Review of PR #98, N1: a `--yes` is written before the list is on screen.
  if (ctx.yes && ["forget-device", "compact", "restore"].includes(order)) {
    throw new UsageError(
      `--yes no vale en «atlas admin ${order}»: se confirma escribiendo el nombre del entorno, con lo que se pierde delante (ADR-0032)`,
    );
  }
  const environment = environmentFlag(flags);
  try {
    const clients = await adminClientsOf(ctx, flags);
    switch (order) {
      case "devices":
        return await devicesOrder(ctx, clients);
      case "revoke-all-tokens":
        return await revokeAllOrder(ctx, clients);
      case "forget-device":
        return await forgetOrder(
          ctx,
          clients,
          environment,
          id as string,
          booleanFlag(flags, "force"),
        );
      case "compact":
        return await compactOrder(ctx, clients, environment, flags);
      default:
        return await restoreOrder(ctx, clients, environment, flags);
    }
  } catch (error) {
    throw translateAwsFailure(error);
  }
};
