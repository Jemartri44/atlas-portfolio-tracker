// Whether this browser has the File System Access pickers at all — the one
// thing about folders the boot of the web needs, to decide which choices to
// offer. Everything else about a folder (`folder.ts`) is loaded when a folder
// is actually used: `@atlas/adapters/folder`, lazily (review of PR #75: the
// whole folder module was on the boot path for this one function).

export interface DirectoryPickerOptions {
  mode?: "read";
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
    queryPermission?: (options?: { mode?: "read" }) => Promise<PermissionState>;
    requestPermission?: (options?: { mode?: "read" }) => Promise<PermissionState>;
  }
}

export const supportsDirectoryPicker = (): boolean =>
  typeof window !== "undefined" && typeof window.showDirectoryPicker === "function";
