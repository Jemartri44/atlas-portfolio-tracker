// atlas remote upload --from <ledger.jsonl>: the initial upload to an **empty**
// cloud (ADR-0035, §4; `docs/api.md` §5.5; feature 024). The whole bytes of a
// ledger go in one `PUT /api/ledger` on the etag of nothing, with the token of
// the cloud folder: the cloud refuses anything else. It is not a sync: the file
// stays as it is, the folder gets no copy of the ledger, and a cloud that
// already has a ledger is never written over (`atlas admin restore` is the
// only way to replace one, ADR-0032).

import { readFile } from "node:fs/promises";
import { DomainError, decodeLines } from "@atlas/domain";
import {
  EMPTY_ETAG,
  initDuplicateIds,
  initRefusal,
  linesOfText,
  RemoteError,
  textOfLines,
} from "@atlas/domain/sync";
import { assertKnownFlags, type Flags, requireFlag, UsageError } from "../args.js";
import { type Context, EXIT, GLOBAL_FLAGS } from "../context.js";
import { cloudStoreOf } from "../folder-mode.js";
import { confirm, render } from "./shared.js";

const strictText = async (path: string): Promise<string> => {
  const bytes = await readFile(path).catch(() => undefined);
  if (bytes === undefined) {
    throw new DomainError("upload_source_missing", `no file ${path}`, { path });
  }
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new DomainError("upload_source_not_utf8", `${path} is not UTF-8`, { path });
  }
};

export const uploadCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, [...GLOBAL_FLAGS, "from"]);
  const from = requireFlag(flags, "from");
  const cloud = cloudStoreOf(ctx);
  if (cloud === undefined || ctx.mode.kind !== "cloud") {
    throw new DomainError(
      "upload_needs_cloud_folder",
      "the initial upload is run from a cloud folder",
      {},
    );
  }
  const text = await strictText(from);
  const lines = linesOfText(text);
  if (lines.length === 0) {
    throw new UsageError(`${from} no tiene ninguna línea: no hay nada que subir`);
  }
  // The same checks the cloud makes, before calling: it never has to refuse the
  // normal path (V7). A newer schema or an unreadable line stops the decoding.
  const events = decodeLines(lines, ctx.deps.store.schema);
  const refusal = initRefusal(events);
  if (refusal !== undefined) {
    throw new DomainError(refusal.code, refusal.code, { ...refusal.details });
  }
  const remote = await cloud.remote();
  const current = await remote.read();
  const content = textOfLines(lines);
  if (current.text === content) {
    render(
      ctx,
      { status: "already_uploaded", lines: lines.length, etag: current.etag },
      `La nube ya tiene exactamente este libro (${lines.length} líneas): no hay nada que subir.`,
    );
    return EXIT.ok;
  }
  if (current.text !== "") {
    throw new DomainError(
      "upload_cloud_not_empty",
      "the cloud already has a ledger; it is never written over",
      { cloud_lines: linesOfText(current.text).length },
    );
  }
  ctx.io.out(
    `Se subirán ${lines.length} líneas de ${from} a ${ctx.mode.remote.origin}, que está vacía. Después, el libro de la nube es el único: ${from} no se sincroniza con él.`,
  );
  if (!(await confirm(ctx, "¿Subir? [s/N] "))) {
    ctx.io.out("Cancelado.");
    return EXIT.ok;
  }
  try {
    const done = await remote.init(content, initDuplicateIds(events), EMPTY_ETAG);
    render(
      ctx,
      { status: "uploaded", lines: done.lines, etag: done.etag },
      `Subido: ${done.lines} líneas a ${ctx.mode.remote.origin} (etag ${done.etag}).`,
    );
    return EXIT.ok;
  } catch (error) {
    if (error instanceof RemoteError && error.code === "init_rejected") {
      const why = typeof error.details.code === "string" ? error.details.code : "desconocido";
      const line = typeof error.details.line === "number" ? `, línea ${error.details.line}` : "";
      ctx.io.err(
        `Error (init_rejected): la nube no ha aceptado el libro (${why}${line}). No se ha escrito nada.`,
      );
      return EXIT.domain;
    }
    throw error;
  }
};
