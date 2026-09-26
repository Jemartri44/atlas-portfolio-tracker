// `~/.config/atlas/credentials.json` on disk (ADR-0033, point 3;
// `data-model.md` §7): **written only by the console**, at sign-in and at
// sign-out, **atomically and created with 600**; with any other permission it
// is not used; and never when its folder and the ledger's are one inside the
// other. What it holds is read strictly by the domain.

import { promises as fs } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import {
  type CredentialsFile,
  EMPTY_CREDENTIALS,
  foldersNested,
  parseCredentials,
  parseRemoteJson,
  type RemoteJson,
  serializeCredentials,
} from "@atlas/domain/access";

export type CredentialsProblem =
  | "credentials_inside_ledger"
  | "credentials_too_open"
  | "credentials_unreadable"
  | "sync_remote_unreadable";

/** A refusal of the files of the console, with its code; never their content. */
export class CredentialsError extends Error {
  constructor(
    readonly code: CredentialsProblem,
    readonly path: string,
  ) {
    super(`${code}: ${path}`);
    this.name = "CredentialsError";
  }
}

/** Where the credentials live, by the rules of XDG, like `secrets.json` (ADR-0031). */
export const credentialsPath = (env: NodeJS.ProcessEnv, home: string): string =>
  join(
    env.XDG_CONFIG_HOME !== undefined && isAbsolute(env.XDG_CONFIG_HOME)
      ? env.XDG_CONFIG_HOME
      : join(home, ".config"),
    "atlas",
    "credentials.json",
  );

/** The real path of `path`, or of its nearest existing parent with the rest appended. */
export const realOf = async (path: string): Promise<string> => {
  try {
    return await fs.realpath(path);
  } catch {
    const parent = dirname(path);
    return parent === path ? path : join(await realOf(parent), relative(parent, path));
  }
};

/** Refuses when the folder of the credentials and the folder of the ledger nest (ADR-0033, point 3). */
export const assertApart = async (path: string, ledgerFolder: string): Promise<void> => {
  const config = await realOf(resolve(dirname(path)));
  const ledger = await realOf(resolve(ledgerFolder));
  if (foldersNested(config, ledger)) {
    throw new CredentialsError("credentials_inside_ledger", path);
  }
};

/**
 * Whether the folder of the credentials is open to others (CLAUDE.md: the
 * folder is `700`; review of PR #95, N4). The file is `600` whatever the
 * folder says, so this is a warning, not a refusal; on Windows there are no
 * such bits, as for `secrets.json`.
 */
export const folderOpenToOthers = async (path: string): Promise<boolean> => {
  try {
    const stat = await fs.stat(dirname(path));
    return process.platform !== "win32" && (stat.mode & 0o077) !== 0;
  } catch {
    return false;
  }
};

/**
 * Changes the file **reading it again just before writing** (review of PR #95,
 * N2): a sign-in waits minutes for the browser, and another console may have
 * written its own entry meanwhile. Only the change of this order is applied.
 */
export const updateCredentials = async (
  path: string,
  change: (file: CredentialsFile) => CredentialsFile | undefined,
): Promise<boolean> => {
  const changed = change(await readCredentials(path));
  if (changed === undefined) {
    return false;
  }
  await writeCredentials(path, changed);
  return true;
};

/** The credentials, or none when there is no file. A file open to others is not used. */
export const readCredentials = async (path: string): Promise<CredentialsFile> => {
  let stat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    stat = await fs.stat(path);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return EMPTY_CREDENTIALS;
    }
    throw new CredentialsError("credentials_unreadable", path);
  }
  if ((stat.mode & 0o777) !== 0o600) {
    throw new CredentialsError("credentials_too_open", path);
  }
  const parsed = parseCredentials(await fs.readFile(path, "utf8"));
  if (parsed === "unreadable") {
    throw new CredentialsError("credentials_unreadable", path);
  }
  return parsed;
};

/**
 * Writes them **atomically**: a temporary created with `600` in the same
 * folder (`wx`, never over another file), flushed, and renamed over the old
 * one. The folder is created `700` when it does not exist.
 */
export const writeCredentials = async (path: string, file: CredentialsFile): Promise<void> => {
  await fs.mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  const handle = await fs.open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(serializeCredentials(file), "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.chmod(temporary, 0o600);
  await fs.rename(temporary, path);
};

/** The folder's `sync/remote.json`: nothing when it does not exist, never «empty» when unreadable. */
export const readRemoteJson = async (ledgerFolder: string): Promise<RemoteJson | undefined> => {
  const path = join(ledgerFolder, "sync", "remote.json");
  let text: string;
  try {
    text = await fs.readFile(path, "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return undefined;
    }
    throw new CredentialsError("sync_remote_unreadable", path);
  }
  const parsed = parseRemoteJson(text);
  if (parsed === "unreadable") {
    throw new CredentialsError("sync_remote_unreadable", path);
  }
  return parsed;
};
