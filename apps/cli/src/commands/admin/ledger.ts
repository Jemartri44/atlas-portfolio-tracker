// atlas admin compact | restore: rewriting the ledger of the cloud (ADR-0026, Part A; ADR-0032).

import { readFile } from "node:fs/promises";
import { S3LedgerBlob } from "@atlas/adapters/aws";
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
import { compareForRestore } from "@atlas/domain/admin";
import { linesOfText, syncArchiveName } from "@atlas/domain/sync";
import { deepCheck } from "@atlas/domain/tools";
import type { AdminClients } from "../../admin/environment.js";
import { type Flags, listFlag, requireFlag } from "../../args.js";
import { type Context, EXIT } from "../../context.js";
import { strictUtf8 } from "../../fs.js";
import { describeWaivers } from "../compact.js";
import { aside, render } from "../shared.js";
import { confirmEnvironment } from "./confirm.js";

const LEDGER_KEY = "ledger/ledger.jsonl";

/** The remote ledger as a store: the bytes of S3, archiving before every rewrite. */
const remoteStore = (ctx: Context, clients: AdminClients): LedgerStore =>
  new BlobLedgerStore(new S3LedgerBlob(clients.objects), ctx.deps.store.schema);

/**
 * `atlas admin compact` (ADR-0026, Part A): the plan and the confirmation of
 * the local `compact`; the store archives the bytes first (`archive/`, never
 * overwritten) and writes on the condition of the remote that was read
 * (`If-Match`), so a ledger that changed meanwhile is never overwritten. There
 * is no queue to check (ADR-0035): clients reload the ledger on their next `412`.
 */
export const compactOrder = async (
  ctx: Context,
  clients: AdminClients,
  environment: string,
  flags: Flags,
): Promise<number> => {
  const deps: UseCaseDeps = { ...ctx.deps, store: remoteStore(ctx, clients) };
  const plan = await planCompact(deps);
  if (plan.outdated === 0) {
    render(
      ctx,
      { status: "nothing_to_compact", plan },
      `Nada que compactar en la nube: las ${plan.lines} líneas están en schema_version ${plan.targetVersion}.`,
    );
    return EXIT.ok;
  }
  const accepted = listFlag(flags, "accept-unverified");
  aside(
    ctx,
    `La nube tiene ${plan.lines} líneas, ${plan.outdated} en versiones anteriores a ${plan.targetVersion}. El original se archivará como archive/${plan.archiveName}, que nunca se sobrescribe.`,
  );
  // What is given up has to be on screen before the yes, as in the local compact.
  const waiving = plan.unverified.filter((entry) => accepted.includes(entry.filing_id));
  if (waiving.length > 0) {
    aside(ctx, describeWaivers(waiving));
  }
  if (!(await confirmEnvironment(ctx, environment, `¿Compactar la nube de ${environment}?`))) {
    render(ctx, { status: "cancelled" }, "Cancelado: no se ha tocado nada.");
    return EXIT.ok;
  }
  const result = await compactLedger(deps, plan, { acceptUnverified: accepted });
  render(
    ctx,
    result,
    result.status === "compacted"
      ? `Compactada la nube: ${result.linesBefore} → ${result.linesAfter} líneas. El original está en archive/${result.archiveName}. Quien tenga Atlas abierto lo notará en su siguiente escritura: la web recarga el libro y pide confirmar otra vez, y la consola pide repetir la orden.`
      : "Nada que compactar en la nube.",
  );
  return EXIT.ok;
};

/**
 * The bytes of the candidate as text, **strictly**: a
 * byte that is not UTF-8 would become U+FFFD, pass the check and be written
 * as other bytes than the copy's. Refused instead, as a candidate that does
 * not pass.
 */
const strictText = (bytes: Uint8Array): string => {
  // A BOM is kept as a character, so the first line cannot be read and the
  // copy is refused — never written back without it.
  const text = strictUtf8(bytes);
  if (text === undefined) {
    throw new DomainError("restore_candidate_invalid", "the candidate is not UTF-8", {
      invalid: [],
      findings: ["not_utf8"],
    });
  }
  return text;
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
 * skipped. Restoring never deletes:
 * the current bytes are archived first (`archive/pre-restore-…`), and the
 * candidate is written **line by line as it is** (`replaceLines`, never
 * `replace`, which reserialises), on the condition of the remote compared.
 */
export const restoreOrder = async (
  ctx: Context,
  clients: AdminClients,
  environment: string,
  flags: Flags,
): Promise<number> => {
  // 1. The candidate.
  const from = requireFlag(flags, "from");
  const lines = linesOfText(await candidateText(clients, from));
  const say = (text: string): void => aside(ctx, text);
  say(`1. Copia candidata: ${from}.`);
  // 2. Checked before touching anything.
  const events = checkCandidate(ctx, lines);
  say(
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
  say(`3. La copia ${said}`);
  // 4. The explicit yes, with that list on screen.
  if (
    !(await confirmEnvironment(
      ctx,
      environment,
      `4. ¿Sustituir la nube de ${environment} por esta copia?`,
    ))
  ) {
    render(ctx, { status: "cancelled" }, "Cancelado: no se ha tocado nada.");
    return EXIT.ok;
  }
  // 5. Archived first, then the lines as they are, on the condition of step 3.
  const archive = syncArchiveName("restore", ctx.deps.clock.now(), remote.etag);
  await store.replaceLines(lines, remote.etag, archive);
  say(`5. Restaurada. Lo que había está en archive/${archive}, que nunca se sobrescribe.`);
  // 6. What each device has to do.
  render(
    ctx,
    { status: "restored", comparison, archive },
    "6. Quien tenga Atlas abierto lo notará en su siguiente escritura: la web recarga el libro restaurado y pide confirmar otra vez, y la consola pide repetir la orden.",
  );
  return EXIT.ok;
};
