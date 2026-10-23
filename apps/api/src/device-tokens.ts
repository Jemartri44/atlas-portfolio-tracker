// The device tokens of the console (`docs/api.md` §4.3 to §4.5): the exchange of the one-time code
// (issue, renewal, reissue), the token revoking itself, and the list and the revocation from the
// web. The rules (what a record says, when a token is alive) are `@atlas/domain/access`.

import { pkceChallenge, sha256Hex } from "@atlas/adapters/access";
import {
  type Admission,
  entryForSubject,
  expectEmptyObject,
  formatDeviceToken,
  isId22,
  newDevice,
  newTokenRecord,
  parseExchangeBody,
  readConsoleCodePayload,
  refusal,
  reissueRefusal,
  type TokenListItem,
  type TokenRecord,
  tokenListItem,
  tokenStatus,
} from "@atlas/domain/access";
import type { ApiContext } from "./context.js";
import { fail, type Outcome } from "./outcome.js";
import { json } from "./respond.js";

export const deviceTokenRoutes = (ctx: ApiContext) => {
  const { deps, config, secrets, devices, tokens, leftAlive, id, nowSeconds, signerNow, tokenOf } =
    ctx;

  /**
   * `POST /api/auth/console/token` (§4.3): the code (subkey and `typ`, then its expiry), the
   * verifier against its challenge, the list again (the e-mail of the one entry of the `sub`);
   * then, to renew, **the previous token revoked before the new one is created**; to reissue, the
   * device checked again and **every live token of it revoked first**; and the record created
   * **without overwriting**, which is what makes the code single use.
   */
  const exchange = async (admission: Admission, body: unknown): Promise<Outcome> => {
    const parsed = parseExchangeBody(body);
    if ("status" in parsed) {
      return fail(parsed);
    }
    const opened = (await signerNow()).open("console_code", parsed.code);
    if (opened === undefined) {
      return fail(refusal("console_code_invalid", { reason: "signature" }));
    }
    const read = readConsoleCodePayload(opened, nowSeconds());
    if ("failure" in read) {
      return fail(
        read.failure === "expired"
          ? refusal("console_code_expired")
          : refusal("console_code_invalid", { reason: "payload" }),
      );
    }
    const code = read.ok;
    if (pkceChallenge(parsed.code_verifier) !== code.cc) {
      return fail(refusal("pkce_mismatch"));
    }
    const entry = entryForSubject(await secrets.allowList(), code.sub);
    if (entry === "missing" || entry === "ambiguous") {
      return fail(
        refusal("not_allowed", entry === "ambiguous" ? { reason: "ambiguous_subject" } : {}),
      );
    }
    // A code sent again is answered **before anything is revoked**: its record already exists, and
    // a renewal or a reissue sent twice would otherwise revoke the token the first exchange handed
    // out.
    if ((await tokens.read(code.tid)) !== undefined) {
      return { ...fail(refusal("console_code_used")), tokenId: code.tid };
    }
    const nowMs = deps.now().getTime();
    let deviceId: string;
    let deviceName = code.dn;
    let how: "token_issued" | "token_renewed" | "token_reissued";
    if (admission.kind === "token") {
      if (code.rdid !== undefined) {
        return fail(refusal("body_invalid", { reason: "renewal_and_reissue" }));
      }
      const previous = await tokenOf(admission.value, true);
      if ("status" in previous) {
        return fail(previous);
      }
      if (previous.sub !== code.sub) {
        return fail(refusal("not_allowed", { reason: "other_subject" }));
      }
      // The previous one first (ADR-0033, point 2): a cut between the two
      // steps leaves no token, which is safe; the console signs in again. Of
      // two renewals at once with this token only one revokes it; the other
      // creates nothing, so the device never holds two live tokens.
      if ((await tokens.revokeExclusive(previous, nowMs)) === "lost") {
        return fail(refusal("console_renewal_conflict"));
      }
      deviceId = previous.device_id;
      how = "token_renewed";
    } else if (code.rdid !== undefined) {
      const device = await devices.read(code.rdid);
      const refused = reissueRefusal(device);
      if (refused !== undefined || typeof device !== "object") {
        return fail(refusal(refused ?? "reissue_device_missing"));
      }
      // The name the user confirmed on the page is the device's, not the one
      // the console proposed.
      deviceName = device.device_name ?? code.dn;
      for (const listed of await tokens.list()) {
        // Never the record of this very code: an exchange of the same code running at once may have
        // created it after this one read it, and revoking it would leave the device with no live
        // token. The create below answers that one with 409.
        if (
          typeof listed.read === "object" &&
          listed.read.device_id === code.rdid &&
          listed.read.token_id !== code.tid
        ) {
          await tokens.revoke(listed.read, nowMs);
        }
      }
      deviceId = code.rdid;
      how = "token_reissued";
    } else {
      deviceId = id(16);
      how = "token_issued";
    }
    const secret = id(32);
    const record = newTokenRecord({
      tokenId: code.tid,
      secretSha256: sha256Hex(secret),
      sub: entry.sub,
      email: entry.email,
      deviceId,
      deviceName,
      issuedAtMs: nowMs,
      lifetimeDays: config.tokenLifetimeDays,
    });
    if ((await tokens.create(record)) === "exists") {
      return { ...fail(refusal("console_code_used")), tokenId: code.tid };
    }
    if (how !== "token_issued") {
      let settled: "won" | "lost";
      try {
        settled = await settleDevice(record, nowMs);
      } catch (error) {
        // Nothing is handed out, so the new record must not stay alive.
        if (!leftAlive.has(error as object)) {
          await revokeOrMark(record, nowMs, error);
        }
        throw error;
      }
      if (settled === "lost") {
        return { ...fail(refusal("console_renewal_conflict")), tokenId: record.token_id };
      }
    }
    if (how === "token_issued") {
      let created: "created" | "exists";
      try {
        created = await devices.create(
          newDevice({
            deviceId,
            type: "console",
            createdAt: deps.now().toISOString(),
            deviceName,
          }),
        );
      } catch (error) {
        // S3 failed after the record was created: the
        // token is revoked — tried a few times, as much as can be — and
        // nothing is handed out; the failure answers as what it is (503).
        await revokeOrMark(record, nowMs, error);
        throw error;
      }
      if (created === "exists") {
        // 128 random bits already taken: the new token must not name another
        // device's object. It is revoked, and nothing is handed out.
        const collision = new Error("device id collision");
        await revokeOrMark(record, nowMs, collision);
        throw collision;
      }
    }
    return {
      result: json(200, {
        token: formatDeviceToken(record.token_id, secret),
        token_id: record.token_id,
        device_id: record.device_id,
        device_name: record.device_name,
        issued_at: record.issued_at,
        expires_at: record.expires_at,
      }),
      code: how,
      tokenId: record.token_id,
    };
  };

  /**
   * After a token is created for an existing device: of the live tokens the device ends up with
   * when issues for it cross (two reissues, or a reissue and a renewal), the one with the greatest
   * `token_id` stays. Each issue lists after its own create, so the greatest sees and revokes the
   * others, and any other sees the greatest and revokes itself: no order leaves two alive.
   */
  const settleDevice = async (record: TokenRecord, nowMs: number): Promise<"won" | "lost"> => {
    const others = (await tokens.list()).flatMap(({ read }) =>
      typeof read === "object" &&
      read.device_id === record.device_id &&
      read.token_id !== record.token_id &&
      tokenStatus(read, nowMs) === "active"
        ? [read]
        : [],
    );
    if (others.some((other) => other.token_id > record.token_id)) {
      const superseded = new Error("device token superseded");
      await revokeOrMark(record, nowMs, superseded);
      if (leftAlive.has(superseded)) {
        throw superseded;
      }
      return "lost";
    }
    for (const other of others) {
      await tokens.revoke(other, nowMs);
    }
    return "won";
  };

  /**
   * Revokes a record just created, retrying a transient failure. If every try
   * fails, the error the caller throws is marked with the record's id, and
   * the log of its 5xx carries it.
   */
  const revokeOrMark = async (
    record: TokenRecord,
    nowMs: number,
    error: unknown,
  ): Promise<void> => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await tokens.revoke(record, nowMs);
        return;
      } catch {
        // Tried again below; the answer is a 5xx either way.
      }
    }
    // Every try failed: the record stays alive, and the log of this 5xx names
    // it — its public id, the most a log may say of a token (ADR-0033, point 10).
    if (typeof error === "object" && error !== null) {
      leftAlive.set(error, record.token_id);
    }
  };

  /** `POST /api/auth/console/revoke` (§4.4): **this** token, and only this one. */
  const revokeOwn = async (admission: Admission, body: unknown): Promise<Outcome> => {
    const shape = expectEmptyObject(body);
    if (shape !== undefined) {
      return fail(shape);
    }
    if (admission.kind !== "token") {
      throw new Error("route admitted without a token");
    }
    const record = await tokenOf(admission.value);
    if ("status" in record) {
      return fail(record);
    }
    const revoked = await tokens.revoke(record, deps.now().getTime());
    return {
      result: json(200, { token_id: revoked.token_id, revoked_at: revoked.revoked_at }),
      code: "token_revoked",
      tokenId: revoked.token_id,
    };
  };

  /** `GET /api/devices/tokens` (§4.5): every record, the unreadable ones too, never an e-mail. */
  const listTokens = async (): Promise<Outcome> => {
    const nowMs = deps.now().getTime();
    const readable: TokenListItem[] = [];
    const unreadable: { token_id: string; status: "unreadable" }[] = [];
    for (const { tokenId, read } of await tokens.list()) {
      if (read === "unreadable") {
        unreadable.push({ token_id: tokenId, status: "unreadable" });
        continue;
      }
      readable.push(tokenListItem(read, nowMs, config.recentIssueDays));
    }
    readable.sort((a, b) => b.issued_at.localeCompare(a.issued_at));
    return {
      result: json(200, { tokens: [...readable, ...unreadable] }),
      ...(unreadable.length > 0 ? { reason: "token_record_unreadable" } : {}),
    };
  };

  /** `POST /api/devices/tokens/<token_id>/revoke` (§4.5): the id checked before any name is built. */
  const revokeFromWeb = async (tokenId: string, body: unknown): Promise<Outcome> => {
    if (!isId22(tokenId)) {
      return fail(refusal("body_invalid", { reason: "token_id" }));
    }
    const shape = expectEmptyObject(body);
    if (shape !== undefined) {
      return fail(shape);
    }
    const read = await tokens.read(tokenId);
    if (typeof read !== "object") {
      return fail(
        refusal("not_found", { reason: read === undefined ? "token_missing" : "token_unreadable" }),
      );
    }
    const revoked = await tokens.revoke(read, deps.now().getTime());
    return {
      result: json(200, { token_id: revoked.token_id, revoked_at: revoked.revoked_at }),
      code:
        tokenStatus(read, deps.now().getTime()) === "revoked"
          ? "token_already_revoked"
          : "token_revoked",
      tokenId: revoked.token_id,
    };
  };

  return { exchange, revokeOwn, listTokens, revokeFromWeb };
};
