// The door of the sync: what it exports exists, and a failure of the remote
// keeps its code and its status apart.

import { describe, expect, it } from "vitest";
import { DomainError } from "../../src/errors.js";
import { RemoteError } from "../../src/sync.js";

describe("the door of the sync", () => {
  it("says a failure of the remote with its own code, status and details", () => {
    const error = new RemoteError("precondition_failed", 412, { etag: "x" });
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe("precondition_failed");
    expect(error.status).toBe(412);
    expect(error.details).toEqual({ etag: "x" });
    expect(new RemoteError("network_failed", undefined).details).toEqual({});
  });
});
