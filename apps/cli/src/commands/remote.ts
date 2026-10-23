// atlas remote login | logout | status | upload (ADR-0033, points 2 to 8, `docs/api.md` §4).
// Signing in writes `credentials.json` and, in a folder with no
// ledger and no cloud identity, **makes it a cloud folder** (`sync/remote.json`,
// ADR-0035, §4); in a folder with a ledger it touches nothing. The token never goes to an argument, an
// environment variable, a URL, the output or a message: only to its file, 600,
// and to its header, towards the origin it was issued for.

import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readLocalConfig } from "@atlas/adapters";
import { pkceChallenge } from "@atlas/adapters/access";
import {
  type CredentialEntry,
  entryForRemote,
  expiryWarning,
  isCredentialEntry,
  isDeviceName,
  isHttpsOrigin,
  replacesAnotherOrigin,
  serializeRemoteJson,
  withEntry,
  withoutEntry,
} from "@atlas/domain/access";
import { assertKnownFlags, booleanFlag, type Flags, stringFlag, UsageError } from "../args.js";
import { CommandFailure, type Context, EXIT, GLOBAL_FLAGS } from "../context.js";
import { pathExists } from "../fs.js";
import { describeConsoleFailure } from "../output/remote.js";
import { updateCredentials } from "../remote/credentials-file.js";
import { type RemoteEnvironment, systemRemote } from "../remote/environment.js";
import { postJson } from "../remote/http.js";
import { openLoopback } from "../remote/loopback.js";
import { expiryText, where } from "../remote/where.js";
import { uploadCommand } from "./remote-upload.js";
import { aside, render } from "./shared.js";

const id43 = (): string => randomBytes(32).toString("base64url");

const USAGE_REMOTE =
  "uso: atlas remote login [--origin <https://…>] [--name <nombre>] [--manual] | atlas remote logout [--device <id>] [--local-only] | atlas remote status | atlas remote upload --from <ledger.jsonl>";

const dateOf = (instant: string): string => instant.slice(0, 10);

const login = async (ctx: Context, flags: Flags, env: RemoteEnvironment): Promise<number> => {
  const at = await where(ctx, env);
  const asked = stringFlag(flags, "origin");
  if (asked !== undefined && at.remote !== undefined && asked !== at.remote.origin) {
    throw new UsageError(
      `esta carpeta es de la nube ${at.remote.origin} (sync/remote.json), no de ${asked}`,
    );
  }
  const origin = asked ?? at.remote?.origin;
  if (origin === undefined) {
    throw new UsageError(
      "falta --origin: esta carpeta no es de nube (no tiene sync/remote.json que lo diga)",
    );
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
  // that device, reissuing for it; with no sync/remote.json, a new one.
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
    aside(
      ctx,
      `Abre esta dirección en el navegador para iniciar sesión con Google${previous === undefined ? "" : " (renueva el token de este dispositivo)"}${reissue === undefined ? "" : " (vuelve a dar un token al dispositivo de esta carpeta; la página te lo pedirá confirmar)"}:`,
    );
    aside(ctx, url);
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
      throw new CommandFailure(EXIT.domain, answer.code, [
        `Error (${answer.code}): ${describeConsoleFailure(answer.code)}`,
      ]);
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
    // renewal or a reissue has to answer for **its** device: nothing is written otherwise.
    const expected = previous?.device_id ?? reissue;
    if (!isCredentialEntry(entry) || (expected !== undefined && entry.device_id !== expected)) {
      throw new CommandFailure(EXIT.domain, "console_response_invalid", [
        "Error (console_response_invalid): la respuesta del servidor no es un token válido para este dispositivo. No se ha guardado nada; si el servidor llegó a emitir un token, revócalo desde la web.",
      ]);
    }
    const kept: CredentialEntry = entry;
    // Read again just before writing: an entry of this device from another
    // origin is never replaced.
    const written = await updateCredentials(at.path, (file) =>
      replacesAnotherOrigin(file, kept) ? undefined : withEntry(file, kept),
    );
    if (!written) {
      throw new CommandFailure(EXIT.domain, "credentials_other_origin", [
        `Error (credentials_other_origin): el servidor ha respondido con el dispositivo ${kept.device_id}, que en credentials.json es de otro origen. No se ha guardado nada; revoca desde la web de ${origin} el token que se acaba de emitir.`,
      ]);
    }
    // A folder with no ledger and no identity becomes a cloud folder (ADR-0035,
    // §4); one with a ledger stays local and untouched. Never both.
    const links = at.remote === undefined && !(await pathExists(ctx.ledgerPath));
    if (links) {
      await mkdir(join(at.folder, "sync"), { recursive: true });
      await writeFile(
        join(at.folder, "sync", "remote.json"),
        serializeRemoteJson({ format: 1, origin, device_id: entry.device_id }),
        { flag: "wx" },
      );
    }
    // The token itself is in no answer: only its public identifiers.
    render(
      ctx,
      {
        status: "logged_in",
        origin,
        device_id: entry.device_id,
        device_name: entry.device_name,
        token_id: entry.token_id,
        expires_at: entry.expires_at,
        cloud_folder: links || at.remote !== undefined,
      },
      `Sesión iniciada: dispositivo «${entry.device_name}» (${entry.device_id}), token ${entry.token_id}, caduca el ${dateOf(entry.expires_at)}. ${
        links
          ? "Esta carpeta es ahora de nube (sync/remote.json): su libro es el de la nube y no se guarda aquí."
          : at.remote === undefined
            ? "La carpeta tiene un libro local (ledger.jsonl): sigue siendo local y no se ha tocado; para usar la nube, inicia sesión en una carpeta sin libro."
            : "No se ha tocado la carpeta del libro."
      }`,
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
    render(
      ctx,
      { status: "forgotten_locally", device_id: entry.device_id, token_id: entry.token_id },
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
    throw new CommandFailure(EXIT.domain, answer.code, [
      `Error (${answer.code}): ${describeConsoleFailure(answer.code)} El token ${entry.token_id} puede seguir vivo en el servidor; la sesión local se conserva. Para borrarla igualmente: atlas remote logout --local-only.`,
    ]);
  }
  await updateCredentials(at.path, (file) => withoutEntry(file, entry.device_id));
  render(
    ctx,
    { status: "logged_out", device_id: entry.device_id, token_id: entry.token_id },
    `Sesión cerrada: token ${entry.token_id} revocado en el servidor y borrado de este equipo.`,
  );
  return 0;
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
  const now = ctx.deps.clock.now().getTime();
  const sessions = here.map((entry) => ({ entry, left: expiryWarning(entry, now, warnDays) }));
  const lines = [
    ...(at.remote === undefined
      ? []
      : [
          `Esta carpeta es de nube: ${at.remote.origin}, como el dispositivo ${at.remote.device_id}.`,
          ...(own === undefined
            ? [
                "No hay sesión guardada para ese dispositivo: «atlas remote login» le vuelve a dar un token.",
              ]
            : []),
        ]),
    ...(sessions.length === 0
      ? ["No hay ninguna sesión guardada para esta carpeta."]
      : sessions.map(
          ({ entry, left }) =>
            `Dispositivo «${entry.device_name}» (${entry.device_id}) en ${entry.origin}: token ${entry.token_id}, caduca el ${dateOf(entry.expires_at)}${expiryText(left)}`,
        )),
  ];
  render(
    ctx,
    {
      cloud_folder: at.remote === undefined ? null : { ...at.remote },
      sessions: sessions.map(({ entry, left }) => ({
        origin: entry.origin,
        device_id: entry.device_id,
        device_name: entry.device_name,
        token_id: entry.token_id,
        expires_at: entry.expires_at,
        expiry: left ?? null,
      })),
    },
    lines.join("\n"),
  );
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
    case "upload":
      return uploadCommand(ctx, positionals, flags);
    default:
      throw new UsageError(USAGE_REMOTE);
  }
};
