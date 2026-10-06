// Where the ledger comes from (ADR-0035): **always the cloud**. The device keeps
// nothing of it, so there is nothing to export, no age and no reminder: only the
// expiry of the session, which the boot read.

/** The ledger of the cloud: the one in S3, read through the API. */
export interface CloudSource {
  kind: "cloud";
  /** When the session ends (`GET /api/session`), an instant. */
  expiresAt: string;
}

export type LedgerSource = CloudSource;

/** Where the ledger is, written in full: the settings screen has the room. */
export const sourceLabel = (_source: LedgerSource): string => "Nube de Atlas";

/**
 * The same thing in as few words as possible, for the chip of the status bar:
 * the full sentence stays one tap away, in the chip's `title` and in Ajustes.
 */
export const sourceShortLabel = (_source: LedgerSource): string => "Nube";
