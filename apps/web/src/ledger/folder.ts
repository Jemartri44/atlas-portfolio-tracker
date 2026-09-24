// The console's folder, linked **for reading** (feature 012). The web keeps
// its ledger in the browser and never writes here (`source.ts`); from this
// folder it only reads the console's `ledger.jsonl`, to import it with an
// explicit confirmation, and — block 3 of the feature — the ECB history.

import {
  pickFolder,
  queryFolderPermission,
  readFolderText,
  rememberedFolder,
  rememberFolder,
  requestFolderPermission,
} from "@atlas/adapters/browser";

export const LEDGER_FILE = "ledger.jsonl";

/** The console's ledger is not in the folder the user chose. */
export class NoLedgerInFolder extends Error {
  constructor(readonly folder: string) {
    super(`there is no ${LEDGER_FILE} in ${folder}`);
    this.name = "NoLedgerInFolder";
  }
}

/**
 * Asks for the folder (a user gesture), remembers it and reads the console's
 * ledger from it. `undefined` when the user cancels the picker.
 */
export const readLedgerFromFolder = async (): Promise<
  { text: string; folder: string } | undefined
> => {
  const handle = await pickFolder();
  if (handle === undefined) {
    return undefined;
  }
  await rememberFolder(handle);
  const text = await readFolderText(handle, [LEDGER_FILE]);
  if (text === undefined) {
    throw new NoLedgerInFolder(handle.name);
  }
  return { text, folder: handle.name };
};

/**
 * A file of the linked folder, asking again for the permission if it lapsed
 * (which needs a gesture). `undefined` when no folder is linked or the file is
 * not there; a denied permission throws, and says so.
 */
export const readLinkedFolder = async (path: readonly string[]): Promise<string | undefined> => {
  const handle = await rememberedFolder();
  if (handle === undefined) {
    return undefined;
  }
  if (
    (await queryFolderPermission(handle)) !== "granted" &&
    (await requestFolderPermission(handle)) !== "granted"
  ) {
    throw new DOMException("permission to read the folder was denied", "NotAllowedError");
  }
  return readFolderText(handle, path);
};

/** Asks for the folder (a user gesture) and remembers it, to read from it. `false` when cancelled. */
export const linkFolder = async (): Promise<boolean> => {
  const handle = await pickFolder();
  if (handle === undefined) {
    return false;
  }
  await rememberFolder(handle);
  return true;
};
