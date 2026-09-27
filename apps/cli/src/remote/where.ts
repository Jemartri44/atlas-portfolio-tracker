// Where the console stands before an order of `atlas remote` or `atlas sync`
// (feature 015): the folder of the ledger, its `sync/remote.json` and the
// credentials — once the two folders are known to be apart (ADR-0033, point 3).

import { dirname } from "node:path";
import type { CredentialsFile, RemoteJson } from "@atlas/domain/access";
import type { Context } from "../context.js";
import {
  assertApart,
  credentialsPath,
  folderOpenToOthers,
  readCredentials,
  readRemoteJson,
  realOf,
} from "./credentials-file.js";
import type { RemoteEnvironment } from "./environment.js";

export interface Where {
  readonly folder: string;
  readonly realFolder: string;
  readonly remote: RemoteJson | undefined;
  readonly path: string;
  readonly credentials: CredentialsFile;
}

/** The folder, its `sync/remote.json` and the credentials, once the two folders are known to be apart. */
export const where = async (ctx: Context, env: RemoteEnvironment): Promise<Where> => {
  const folder = dirname(ctx.ledgerPath);
  const path = credentialsPath(env.env, env.home);
  await assertApart(path, folder);
  if (await folderOpenToOthers(path)) {
    ctx.io.err(
      `Aviso: la carpeta de credentials.json (${dirname(path)}) está abierta a otros usuarios. El fichero sigue siendo solo tuyo, pero ciérrala con chmod 700.`,
    );
  }
  return {
    folder,
    realFolder: await realOf(folder),
    remote: await readRemoteJson(folder),
    path,
    credentials: await readCredentials(path),
  };
};

/** The warning of the expiry, precise: less than a day is not expired (review of PR #95, N1). */
export const expiryText = (left: number | "expired" | undefined): string => {
  if (left === undefined) {
    return ".";
  }
  if (left === "expired") {
    return ". Ha caducado: sincronizar pedirá volver a iniciar sesión.";
  }
  return left === 0
    ? ". Caduca en menos de un día: renueva con «atlas remote login»."
    : `. Caduca en ${left} días: renueva con «atlas remote login».`;
};
