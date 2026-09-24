// A folder of the user's disk, **read only**, through the File System Access
// API (feature 012). It is the folder where the console keeps its ledger.
//
// **The web never writes here.** Until feature 012 it wrote the ledger in this
// very folder, next to the console, and the two could overwrite each other's
// line: the lock that closes that window has to be taken by creating a file
// exclusively, and the File System Access API has no such primitive — verified
// against the specification and the source of Chromium
// (`specs/012-ecb-reference-rates/questions.md` §1). By decision of the
// direction the web keeps its ledger in its own storage (`indexeddb.ts`) and
// only **reads** from this folder: a ledger to import, with an explicit
// confirmation, and the ECB history the console downloads. So the permission
// asked is `read`, and the architecture test forbids every writing primitive
// of the API in the browser code.
//
// Availability, measured (research.md §4 of feature 006): Chrome and Edge on
// the desktop only. The caller checks `supportsDirectoryPicker()` first
// (`picker.ts`, the only part of folders on the boot path). This module is
// `@atlas/adapters/folder`, loaded lazily.
//
// Permissions are not permanent: once every tab of the origin is closed the
// site loses access, so the handle is kept in IndexedDB (it is serialisable)
// and the permission is asked again from a user gesture.

import { HANDLE_STORE, idbDelete, idbGet, idbPut } from "./idb.js";
import { type DirectoryPickerOptions, supportsDirectoryPicker } from "./picker.js";

const HANDLE_KEY = "directory";

/** Opens the picker, for reading. `undefined` when the user cancels; throws only on a real failure. */
export const pickFolder = async (): Promise<FileSystemDirectoryHandle | undefined> => {
  if (!supportsDirectoryPicker()) {
    return undefined;
  }
  try {
    return await (
      window.showDirectoryPicker as (
        options?: DirectoryPickerOptions,
      ) => Promise<FileSystemDirectoryHandle>
    )({ mode: "read", id: "atlas-ledger" });
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
  const ask = request ? handle.requestPermission : handle.queryPermission;
  if (ask === undefined) {
    // A browser with the pickers but without the permission half: treat it as
    // granted, because the picker itself already asked (constitution V: say
    // what is known, never invent a denial).
    return "granted";
  }
  return await ask.call(handle, { mode: "read" });
};

/** Permission state without prompting. */
export const queryFolderPermission = (
  handle: FileSystemDirectoryHandle,
): Promise<HandlePermission> => permissionOf(handle, false);

/** Prompts for permission. **Must** be called inside a user gesture or it throws SecurityError. */
export const requestFolderPermission = (
  handle: FileSystemDirectoryHandle,
): Promise<HandlePermission> => permissionOf(handle, true);

/** Remembers which folder was chosen (not the permission, which cannot be stored). */
export const rememberFolder = (handle: FileSystemDirectoryHandle): Promise<void> =>
  idbPut(HANDLE_STORE, HANDLE_KEY, handle);

export const rememberedFolder = (): Promise<FileSystemDirectoryHandle | undefined> =>
  idbGet<FileSystemDirectoryHandle>(HANDLE_STORE, HANDLE_KEY);

export const forgetFolder = (): Promise<void> => idbDelete(HANDLE_STORE, HANDLE_KEY);

const isNotFound = (error: unknown): boolean =>
  error instanceof DOMException &&
  (error.name === "NotFoundError" || error.name === "TypeMismatchError");

/**
 * The text of `path` inside the folder (`["ledger.jsonl"]`,
 * `["reference", "ecb", "eurofxref-hist.csv"]`), or `undefined` when it is not
 * there. Reads only: every handle is asked for without creating anything.
 */
export const readFolderText = async (
  folder: FileSystemDirectoryHandle,
  path: readonly string[],
): Promise<string | undefined> => {
  const directories = path.slice(0, -1);
  const name = path[path.length - 1];
  if (name === undefined) {
    return undefined;
  }
  try {
    let directory = folder;
    for (const segment of directories) {
      directory = await directory.getDirectoryHandle(segment);
    }
    const file = await (await directory.getFileHandle(name)).getFile();
    return await file.text();
  } catch (error) {
    if (isNotFound(error)) {
      return undefined;
    }
    throw error;
  }
};
