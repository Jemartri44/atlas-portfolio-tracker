// The ledger on the user's disk, through the File System Access API: the same
// `ledger.jsonl` the CLI writes, with no copy and no synchronisation (ADR-0019).
//
// Why a **directory** and not a file (decision (j) of the prompt): from a file
// handle the browser does not let you reach the parent directory, so there
// would be nowhere to write `archive/` and `replace` — the operation `compact`
// needs — would be impossible. Asking for the folder keeps the port contract
// whole and reproduces the layout the CLI uses: `ledger.jsonl` next to
// `archive/`.
//
// Availability, measured (research.md §4): Chrome and Edge on the desktop only.
// Not Firefox, not Safari and **not any mobile browser**. The caller checks
// `supportsDirectoryPicker()` before offering this path.
//
// Permissions are not permanent: once every tab of the origin is closed the
// site loses access, so the handle is kept in IndexedDB (it is serialisable)
// and the permission is asked again from a user gesture ("Reconectar").

import { BlobArchiveExists, type LedgerBlob } from "../blob.js";
import { HANDLE_STORE, idbDelete, idbGet, idbPut } from "./idb.js";

const LEDGER_FILE = "ledger.jsonl";
const ARCHIVE_DIR = "archive";
const HANDLE_KEY = "directory";

interface DirectoryPickerOptions {
  mode?: "read" | "readwrite";
  id?: string;
  startIn?: FileSystemHandle | string;
}

declare global {
  interface Window {
    /** Not in lib.dom yet; the shape is the one the File System Access spec defines. */
    showDirectoryPicker?: (options?: DirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
  }

  /** Also missing from lib.dom: the permission half of the spec, which is what survives a reload. */
  interface FileSystemHandle {
    queryPermission?: (options?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (options?: { mode?: "read" | "readwrite" }) => Promise<PermissionState>;
  }
}

export const supportsDirectoryPicker = (): boolean =>
  typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";

/** Opens the picker. `undefined` when the user cancels; throws only on a real failure. */
export const pickLedgerDirectory = async (): Promise<FileSystemDirectoryHandle | undefined> => {
  if (!supportsDirectoryPicker()) {
    return undefined;
  }
  try {
    return await (
      window.showDirectoryPicker as (
        options?: DirectoryPickerOptions,
      ) => Promise<FileSystemDirectoryHandle>
    )({ mode: "readwrite", id: "atlas-ledger" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return undefined;
    }
    throw error;
  }
};

export type HandlePermission = "granted" | "prompt" | "denied";

const permissionOf = async (
  handle: FileSystemDirectoryHandle,
  request: boolean,
): Promise<HandlePermission> => {
  const options = { mode: "readwrite" } as const;
  const ask = request ? handle.requestPermission : handle.queryPermission;
  if (ask === undefined) {
    // A browser with the pickers but without the permission half: treat it as
    // granted, because the picker itself already asked (constitution V: say
    // what is known, never invent a denial).
    return "granted";
  }
  return await ask.call(handle, options);
};

/** Permission state without prompting: what the app checks on every start. */
export const queryDirectoryPermission = (
  handle: FileSystemDirectoryHandle,
): Promise<HandlePermission> => permissionOf(handle, false);

/** Prompts for permission. **Must** be called inside a user gesture or it throws SecurityError. */
export const requestDirectoryPermission = (
  handle: FileSystemDirectoryHandle,
): Promise<HandlePermission> => permissionOf(handle, true);

/** Remembers which folder was chosen (not the permission, which cannot be stored). */
export const rememberDirectory = (handle: FileSystemDirectoryHandle): Promise<void> =>
  idbPut(HANDLE_STORE, HANDLE_KEY, handle);

export const rememberedDirectory = (): Promise<FileSystemDirectoryHandle | undefined> =>
  idbGet<FileSystemDirectoryHandle>(HANDLE_STORE, HANDLE_KEY);

export const forgetDirectory = (): Promise<void> => idbDelete(HANDLE_STORE, HANDLE_KEY);

export class DirectoryLedgerBlob implements LedgerBlob {
  constructor(
    private readonly directory: FileSystemDirectoryHandle,
    private readonly fileName: string = LEDGER_FILE,
  ) {}

  get label(): string {
    return `${this.fileName} · ${this.directory.name}`;
  }

  private async fileHandle(create: boolean): Promise<FileSystemFileHandle | undefined> {
    try {
      return await this.directory.getFileHandle(this.fileName, { create });
    } catch (error) {
      if (error instanceof DOMException && error.name === "NotFoundError") {
        return undefined;
      }
      throw error;
    }
  }

  /** Empty when the file is not there yet: a new ledger, exactly like FileLedgerStore. */
  async read(): Promise<Uint8Array> {
    const handle = await this.fileHandle(false);
    if (handle === undefined) {
      return new Uint8Array();
    }
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  /**
   * The browser writes to a temporary file and swaps it in on close, which is
   * the atomicity FileLedgerStore gets from `rename`.
   */
  async write(bytes: Uint8Array): Promise<void> {
    const handle = await this.directory.getFileHandle(this.fileName, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(new Uint8Array(bytes));
    } finally {
      await writable.close();
    }
  }

  async writeArchive(name: string, bytes: Uint8Array): Promise<void> {
    const archive = await this.directory.getDirectoryHandle(ARCHIVE_DIR, { create: true });
    try {
      await archive.getFileHandle(name, { create: false });
      throw new BlobArchiveExists(name);
    } catch (error) {
      if (error instanceof BlobArchiveExists) {
        throw error;
      }
      if (!(error instanceof DOMException) || error.name !== "NotFoundError") {
        throw error;
      }
    }
    const handle = await archive.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    try {
      await writable.write(new Uint8Array(bytes));
    } finally {
      await writable.close();
    }
  }
}
