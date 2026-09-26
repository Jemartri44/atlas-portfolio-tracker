// The records of the console tokens in SSM (ADR-0033, point 9;
// `data-model.md` §2): one `SecureString` per token under
// `/atlas/<env>/device-tokens/<token_id>`, **written only to create it and to
// revoke it**, never deleted. The name is built only from a valid `token_id`
// and never with a selector (B1); the record is read strictly and only as the
// token asked for; nothing is cached (B2). The rules are the domain's.

import {
  parseTokenRecord,
  revokedRecord,
  serializeTokenRecord,
  type TokenRecord,
  tokenIdOfParameterName,
  tokenParameterName,
  tokenParameterPath,
} from "@atlas/domain/access";
import type { ParameterStore } from "./parameter-store.js";

export class TokenRegistry {
  constructor(
    private readonly parameters: ParameterStore,
    private readonly ssmPrefix: string,
    /** The tags every record is created with (ADR-0034, rows 3 and 9). */
    private readonly tags: Readonly<Record<string, string>>,
  ) {}

  /** The record of a token, `unreadable`, or nothing if it does not exist. Never cached. */
  async read(tokenId: string): Promise<TokenRecord | "unreadable" | undefined> {
    const text = await this.parameters.get(tokenParameterName(this.ssmPrefix, tokenId));
    return text === undefined ? undefined : parseTokenRecord(text, tokenId);
  }

  /** Creates it **without overwriting**: `exists` is a code already exchanged (`console_code_used`). */
  create(record: TokenRecord): Promise<"created" | "exists"> {
    return this.parameters.putNew(
      tokenParameterName(this.ssmPrefix, record.token_id),
      serializeTokenRecord(record),
      this.tags,
    );
  }

  /** Revokes it; one already revoked is **not written again** and keeps its instant. */
  async revoke(record: TokenRecord, atMs: number): Promise<TokenRecord> {
    const revoked = revokedRecord(record, atMs);
    if (revoked !== record) {
      await this.parameters.overwrite(
        tokenParameterName(this.ssmPrefix, record.token_id),
        serializeTokenRecord(revoked),
      );
    }
    return revoked;
  }

  /** Every record of the folder, as the token id its name says; the unreadable ones too. */
  async list(): Promise<
    readonly { readonly tokenId: string; readonly read: TokenRecord | "unreadable" }[]
  > {
    const entries = await this.parameters.listByPath(tokenParameterPath(this.ssmPrefix));
    return entries.map((entry) => {
      const tokenId = tokenIdOfParameterName(this.ssmPrefix, entry.name) ?? entry.name;
      return { tokenId, read: parseTokenRecord(entry.value, tokenId) };
    });
  }
}
