// Where the ledger comes from (ADR-0035): **always the cloud**. The device keeps
// nothing of it, so there is nothing to export, no age and no reminder: only the
// expiry of the session, which the boot read.

/** The ledger of the cloud: the one in S3, read through the API. */
export interface LedgerSource {
  /** When the session ends (`GET /api/session`), an instant. */
  expiresAt: string;
}
