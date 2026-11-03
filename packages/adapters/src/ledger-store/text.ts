// What the file and the blob stores share about the text of a ledger. No Node
// module: the browser's store bundles it too.

import { encodeLine, type LedgerEvent, ValidationError } from "@atlas/domain";
import { linesOfText } from "@atlas/domain/sync";

const decoder = new TextDecoder();

const NEWLINE = 0x0a;

/** The lines of the ledger bytes: `TextDecoder` drops a leading byte-order mark by default. */
export const ledgerLinesOf = (bytes: Uint8Array): string[] => linesOfText(decoder.decode(bytes));

/** The events as lines of a file, each followed by its newline. */
export const serialise = (events: readonly LedgerEvent[]): string =>
  events.map((event) => `${encodeLine(event)}\n`).join("");

/** What goes before an addition so that it starts on a line of its own. */
export const separatorFor = (bytes: Uint8Array): string =>
  bytes.length > 0 && bytes[bytes.length - 1] !== NEWLINE ? "\n" : "";

export const checkArchiveName = (archiveName: string): void => {
  if (archiveName.length === 0 || /[/\\]/.test(archiveName)) {
    throw new ValidationError("invalid_archive_name", "archive name must be a plain file name", {
      archive_name: archiveName,
    });
  }
};
