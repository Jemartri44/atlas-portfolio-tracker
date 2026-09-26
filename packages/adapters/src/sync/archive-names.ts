// An archive is never overwritten (ADR-0026, Part B, step 6): a write cut
// after archiving and repeated **within the same second** takes the next name
// of the archive, `-2` to `-9` (`syncArchiveName`). Every order that moves
// lines does so (feature 015, E3, block 5, point 6), not only the sync.

import { ArchiveExistsError } from "@atlas/domain";

/** How many names an archive of the same second may take before giving up. */
export const MAX_ARCHIVE_NAMES = 9;

/** Runs a write that archives, again with the next name while the one it took exists. */
export const withArchiveNames = async <T>(write: (attempt: number) => Promise<T>): Promise<T> => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await write(attempt);
    } catch (error) {
      if (!(error instanceof ArchiveExistsError) || attempt >= MAX_ARCHIVE_NAMES) {
        throw error;
      }
    }
  }
};
