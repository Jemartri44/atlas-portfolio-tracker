// The barrier of the log (`apps/api/src/log.ts`), on its refusing side: a
// value that is not one of ours never gets into a line, whatever field it
// is put in (review of PR #95, round 2, R2-3).

import { describe, expect, it } from "vitest";
import { logLine } from "../src/log.js";

const base = {
  level: "INFO",
  request_id: "req-1",
  method: "POST",
  route: "/api/devices/tokens/{token_id}/revoke",
  status: 200,
} as const;

describe("logLine", () => {
  it("keeps our own values: a route template, a code, a token id, a number", () => {
    expect(
      JSON.parse(logLine({ ...base, code: "token_revoked", token_id: "A".repeat(22) })),
    ).toEqual({ ...base, code: "token_revoked", token_id: "A".repeat(22) });
  });

  it("drops an e-mail, a token, a value too long, and anything with spaces or quotes", () => {
    const token = `atlasdt1.${"A".repeat(22)}.${"s".repeat(43)}`;
    for (const value of [
      "someone@example.com",
      token,
      "x".repeat(65),
      "Unexpected token 'S'",
      'a"b',
      "",
    ]) {
      const line = logLine({ ...base, code: value, reason: value, token_id: value });
      expect(line).not.toContain(value === "" ? '""' : value);
      expect(JSON.parse(line)).toEqual(base);
    }
  });

  it("keeps a value of exactly 64 characters, and not one of 65", () => {
    expect(JSON.parse(logLine({ ...base, reason: "r".repeat(64) })).reason).toBe("r".repeat(64));
    expect(JSON.parse(logLine({ ...base, reason: "r".repeat(65) }))).not.toHaveProperty("reason");
  });
});
