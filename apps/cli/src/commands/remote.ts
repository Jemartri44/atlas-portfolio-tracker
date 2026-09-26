// atlas remote login | logout | status (feature 015, E2; ADR-0033, points 2 to
// 8; `docs/api.md` §4; contracts `cli-commands.md`). Signing in **writes
// nothing in the folder of the ledger** — only `credentials.json` (§7 P16) —,
// and never configures the sync. The token never goes to an argument, an
// environment variable, a URL, the output or a message: only to its file, 600,
// and to its header, towards the origin it was issued for.

import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { readLocalConfig } from "@atlas/adapters";
import { pkceChallenge } from "@atlas/adapters/access";
import {
  type CredentialEntry,
  type CredentialsFile,
  entryForRemote,
  expiryWarning,
  isCredentialEntry,
  isDeviceName,
  isHttpsOrigin,
  type RemoteJson,
  withEntry,
  withoutEntry,
} from "@atlas/domain/access";
import { assertKnownFlags, booleanFlag, type Flags, stringFlag, UsageError } from "../args.js";
import { type Context, EXIT, GLOBAL_FLAGS } from "../context.js";
import { describeConsoleFailure } from "../output/remote.js";
import {
  assertApart,
  credentialsPath,
  folderOpenToOthers,
  readCredentials,
  readRemoteJson,
  realOf,
  updateCredentials,
} from "../remote/credentials-file.js";
import { type RemoteEnvironment, systemRemote } from "../remote/environment.js";
import { postJson } from "../remote/http.js";
import { openLoopback } from "../remote/loopback.js";

const id43 = (): string => randomBytes(32).toString("base64url");

const USAGE_REMOTE =
  "uso: atlas remote login [--origin <https://…>] [--name <nombre>] [--manual] | atlas remote logout [--device <id>] [--local-only] | atlas remote status";

interface Where {
  readonly folder: string;
  readonly realFolder: string;
  readonly remote: RemoteJson | undefined;
  readonly path: string;
  readonly credentials: CredentialsFile;
}

/** The folder, its `sync/remote.json` and the credentials, once the two folders are known to be apart. */
const where = async (ctx: Context, env: RemoteEnvironment): Promise<Where> => {
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

const dateOf = (instant: string): string => instant.slice(0, 10);

const login = async (ctx: Context, flags: Flags, env: RemoteEnvironment): Promise<number> => {
  const at = await where(ctx, env);
  const asked = stringFlag(flags, "origin");
  if (asked !== undefined && at.remote !== undefined && asked !== at.remote.origin) {
    throw new UsageError(
      `esta carpeta se sincroniza con ${at.remote.origin} (sync/remote.json), no con ${asked}`,
    );
  }
  const origin = asked ?? at.remote?.origin;
  if (origin === undefined) {
    throw new UsageError("falta --origin: esta carpeta no tiene sync/remote.json que lo diga");
  }
  if (!isHttpsOrigin(origin)) {
    throw new UsageError(`--origin tiene que ser https:// y un nombre, sin ruta («${origin}»)`);
  }
  const name = stringFlag(flags, "name") ?? env.hostname;
  if (!isDeviceName(name)) {
    throw new UsageError(
      `el nombre del dispositivo «${name}» no vale: de 1 a 40 letras latinas, cifras, espacios sueltos, «.», «_» o «-». Pon --name`,
    );
  }
  const manual = booleanFlag(flags, "manual");
  // Renewing only with the entry sync/remote.json names; with no entry for
  // that device, reissuing for it (N5); with no sync/remote.json, a new one (B2).
  const previous = at.remote === undefined ? undefined : entryForRemote(at.credentials, at.remote);
  const reissue =
    at.remote !== undefined && previous === undefined ? at.remote.device_id : undefined;
  const state = id43();
  const verifier = id43();
  const loopback = manual ? undefined : await openLoopback(state, env.loopbackTimeoutMs);
  try {
    const query = new URLSearchParams({
      ...(loopback === undefined ? { mode: "manual" } : { port: String(loopback.port) }),
      state,
      code_challenge: pkceChallenge(verifier),
      code_challenge_method: "S256",
      device_name: name,
      ...(reissue === undefined ? {} : { reissue_device_id: reissue }),
    });
    const url = `${origin}/api/auth/console/start?${query.toString()}`;
    ctx.io.out(
      `Abre esta dirección en el navegador para iniciar sesión con Google${previous === undefined ? "" : " (renueva el token de este dispositivo)"}${reissue === undefined ? "" : " (vuelve a dar un token al dispositivo de esta carpeta; la página te lo pedirá confirmar)"}:`,
    );
    ctx.io.out(url);
    env.openBrowser(url);
    const code =
      loopback === undefined
        ? await env.readHidden("Pega el código que enseña la página (no se verá al escribirlo): ")
        : await loopback.code;
    const answer = await postJson(
      env.fetch,
      origin,
      "/api/auth/console/token",
      { code, code_verifier: verifier },
      previous?.token,
    );
    if (!answer.ok) {
      if (answer.code === "device_token_revoked" && previous !== undefined) {
        // The previous token is dead on the server: keeping it would only send
        // it again. Without it, the next sign-in reissues for this device.
        await updateCredentials(at.path, (file) => withoutEntry(file, previous.device_id));
      }
      ctx.io.err(`Error (${answer.code}): ${describeConsoleFailure(answer.code)}`);
      return EXIT.domain;
    }
    const body = answer.body;
    const entry = {
      origin,
      device_id: body.device_id,
      token: body.token,
      token_id: body.token_id,
      device_name: body.device_name,
      issued_at: body.issued_at,
      expires_at: body.expires_at,
      folder_hint: at.realFolder,
    };
    // The answer checked with the rules of the file before it is kept, and a
    // renewal or a reissue has to answer for **its** device (review of PR
    // #95, N5): nothing is written otherwise.
    const expected = previous?.device_id ?? reissue;
    if (!isCredentialEntry(entry) || (expected !== undefined && entry.device_id !== expected)) {
      ctx.io.err(
        "Error (console_response_invalid): la respuesta del servidor no es un token válido para este dispositivo. No se ha guardado nada; si el servidor llegó a emitir un token, revócalo desde la web.",
      );
      return EXIT.domain;
    }
    const kept: CredentialEntry = entry;
    await updateCredentials(at.path, (file) => withEntry(file, kept));
    ctx.io.out(
      `Sesión iniciada: dispositivo «${entry.device_name}» (${entry.device_id}), token ${entry.token_id}, caduca el ${dateOf(entry.expires_at)}. No se ha tocado la carpeta del libro.`,
    );
    return 0;
  } finally {
    loopback?.close();
  }
};

const logout = async (ctx: Context, flags: Flags, env: RemoteEnvironment): Promise<number> => {
  const at = await where(ctx, env);
  const device = stringFlag(flags, "device");
  const entry =
    device !== undefined
      ? at.credentials.entries[device]
      : at.remote === undefined
        ? undefined
        : entryForRemote(at.credentials, at.remote);
  if (entry === undefined) {
    throw new UsageError(
      device !== undefined
        ? `no hay ninguna sesión guardada del dispositivo ${device}`
        : "esta carpeta no nombra ninguna sesión guardada (sync/remote.json): di cuál con --device <id>",
    );
  }
  if (booleanFlag(flags, "local-only")) {
    await updateCredentials(at.path, (file) => withoutEntry(file, entry.device_id));
    ctx.io.out(
      `Borrada la sesión local del dispositivo «${entry.device_name}» (${entry.device_id}). El token ${entry.token_id} sigue vivo en el servidor hasta que caduque o lo revoques desde la web.`,
    );
    return 0;
  }
  const answer = await postJson(
    env.fetch,
    entry.origin,
    "/api/auth/console/revoke",
    {},
    entry.token,
  );
  if (!answer.ok) {
    // Only the 200 lets the entry go (ADR-0033, point 8).
    ctx.io.err(
      `Error (${answer.code}): ${describeConsoleFailure(answer.code)} El token ${entry.token_id} puede seguir vivo en el servidor; la sesión local se conserva. Para borrarla igualmente: atlas remote logout --local-only.`,
    );
    return EXIT.domain;
  }
  await updateCredentials(at.path, (file) => withoutEntry(file, entry.device_id));
  ctx.io.out(
    `Sesión cerrada: token ${entry.token_id} revocado en el servidor y borrado de este equipo.`,
  );
  return 0;
};

/** The warning of the expiry, precise: less than a day is not expired (review of PR #95, N1). */
const expiryText = (left: number | "expired" | undefined): string => {
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

const status = async (ctx: Context, env: RemoteEnvironment): Promise<number> => {
  const at = await where(ctx, env);
  const { token_expiry_warning_days: warnDays } = await readLocalConfig(at.folder);
  const own = at.remote === undefined ? undefined : entryForRemote(at.credentials, at.remote);
  const here = Object.values(at.credentials.entries).filter(
    (entry) =>
      entry === own ||
      (entry.folder_hint === at.realFolder && entry.origin === (at.remote?.origin ?? entry.origin)),
  );
  if (at.remote !== undefined) {
    ctx.io.out(
      `Esta carpeta se sincroniza con ${at.remote.origin} como el dispositivo ${at.remote.device_id}.`,
    );
    if (own === undefined) {
      ctx.io.out(
        "No hay sesión guardada para ese dispositivo: «atlas remote login» le vuelve a dar un token.",
      );
    }
  }
  if (here.length === 0) {
    ctx.io.out("No hay ninguna sesión guardada para esta carpeta.");
    return 0;
  }
  const now = ctx.deps.clock.now().getTime();
  for (const entry of here) {
    const left = expiryWarning(entry, now, warnDays);
    ctx.io.out(
      `Dispositivo «${entry.device_name}» (${entry.device_id}) en ${entry.origin}: token ${entry.token_id}, caduca el ${dateOf(entry.expires_at)}${expiryText(left)}`,
    );
  }
  return 0;
};

export const remoteCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const sub = positionals[1];
  const env = ctx.remote ?? systemRemote();
  switch (sub) {
    case "login":
      assertKnownFlags(flags, [...GLOBAL_FLAGS, "origin", "name", "manual"]);
      return login(ctx, flags, env);
    case "logout":
      assertKnownFlags(flags, [...GLOBAL_FLAGS, "device", "local-only"]);
      return logout(ctx, flags, env);
    case "status":
      assertKnownFlags(flags, [...GLOBAL_FLAGS]);
      return status(ctx, env);
    default:
      throw new UsageError(USAGE_REMOTE);
  }
};
