// atlas admin prices push: the symbols of the prices job, from this folder to the cloud.

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DomainError } from "@atlas/domain";
import { symbolsPushPlan } from "@atlas/domain/quotes";
import type { AdminClients } from "../../admin/environment.js";
import { type Context, EXIT } from "../../context.js";
import { strictUtf8 } from "../../fs.js";
import { aside, render } from "../shared.js";
import { confirmEnvironment } from "./confirm.js";

const SYMBOLS_KEY = "prices/symbols.json";

const CHANGE_TEXT = { added: "añadido", removed: "quitado", changed: "cambiado" } as const;

/**
 * `atlas admin prices push`: uploads **only** the local `prices/symbols.json` — never
 * `config.json`, which stays the budget of the console — and keeps **no
 * local state**: it reads the remote object, shows the difference, asks for
 * the name of the environment and writes on the ETag of **that same read**
 * (`If-None-Match: *` when there was none). A write in between is a conflict
 * that writes nothing; it is never retried on a newer read nobody saw.
 */
export const pricesPushOrder = async (
  ctx: Context,
  clients: AdminClients,
  environment: string,
): Promise<number> => {
  const bytes = await readFile(join(dirname(ctx.ledgerPath), "prices", "symbols.json")).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return undefined;
      }
      throw error;
    },
  );
  // A local file that is not UTF-8 is unreadable: "" is refused by the reader.
  const local = bytes === undefined ? undefined : (strictUtf8(bytes) ?? "");
  const remote = await clients.objects.get(SYMBOLS_KEY);
  // A remote that is not UTF-8 is unreadable too, and replaced as such.
  const plan = symbolsPushPlan(
    local,
    remote === undefined ? undefined : (strictUtf8(remote.body) ?? ""),
  );
  if (plan.kind === "same") {
    render(
      ctx,
      { environment, changes: [] },
      `La nube de ${environment} ya tiene este prices/symbols.json: no se sube nada.`,
    );
    return EXIT.ok;
  }
  // What it replaces, to recover it from the versions of the bucket: its ETag, and its version when
  // the bucket says it.
  const replaced =
    remote === undefined
      ? []
      : [
          `Sustituye el objeto con ETag ${remote.etag}${
            remote.versionId === undefined ? "" : `, versión ${remote.versionId}`
          }, que queda en el historial de versiones del bucket.`,
        ];
  const said =
    plan.remote === "absent"
      ? "La nube no tiene ningún prices/symbols.json."
      : plan.remote === "unreadable"
        ? "El prices/symbols.json de la nube no se puede leer: se sustituye entero."
        : "Diferencia con el prices/symbols.json de la nube:";
  const lines =
    plan.changes.length === 0
      ? ["  ningún activo cambia: solo la forma del fichero"]
      : plan.changes.map(
          (change) =>
            `  ${CHANGE_TEXT[change.change]} ${change.asset_id}${
              change.fields.length === 0 ? "" : ` (${change.fields.join(", ")})`
            }`,
        );
  aside(ctx, [said, ...lines, ...replaced].join("\n"));
  if (
    !(await confirmEnvironment(
      ctx,
      environment,
      `¿Subir prices/symbols.json a ${environment}? La tarea de precios lo usará tal cual y nunca contrasta: una fuente sin contrastar no se descarga.`,
    ))
  ) {
    render(ctx, { status: "cancelled" }, "Cancelado: no se ha tocado nada.");
    return EXIT.ok;
  }
  const written =
    remote === undefined
      ? (await clients.objects.putIfNoneMatch(SYMBOLS_KEY, bytes as Uint8Array)) === "created"
      : (await clients.objects.putIfMatch(SYMBOLS_KEY, bytes as Uint8Array, remote.etag)) ===
        "written";
  if (!written) {
    throw new DomainError(
      "symbols_push_conflict",
      "prices/symbols.json changed in the cloud while it was compared",
      {},
    );
  }
  render(
    ctx,
    { environment, changes: plan.changes },
    `Subido prices/symbols.json a ${environment}: ${plan.changes.length} activos cambian.`,
  );
  return EXIT.ok;
};
