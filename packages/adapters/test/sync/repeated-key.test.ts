// Q12, option (b) (§29 and §33): a pending line with a key twice — only a hand
// edit writes one — is held back by the sync in step 3, with `domain_rejected`
// and the code `duplicate_key`, **before** uploading it: the `400
// body_invalid` of the API never happens, and the sync does not stop.

import { encodeLine } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { initialiseRemote, syncDevice } from "../../src/sync/client.js";
import { Builder, base, textOf } from "./builder.js";
import { clock, webDevice } from "./devices.js";
import { SimulatedBucket } from "./simulated-remote.js";

describe("a pending line with a key twice", () => {
  it("is held back before uploading, with domain_rejected, and nothing reaches the remote", async () => {
    const bucket = SimulatedBucket.inMemory();
    const options = clock();
    const web = webDevice(base());
    await initialiseRemote(web.sync, bucket.as("web"), options);
    const deposit = new Builder(40).deposit("100");
    const line = encodeLine(deposit).replace('"amount":"100"', '"amount":"1","amount":"100"');
    expect(line).not.toBe(encodeLine(deposit));
    const current = web.db.store("ledger").get("current") as { text: string; updatedAt: string };
    web.db.store("ledger").set("current", { ...current, text: `${current.text}${line}\n` });
    const outcome = await syncDevice(web.sync, bucket.as("web"), options);
    expect(outcome).toMatchObject({
      status: "synced",
      uploaded: 0,
      held: { code: "domain_rejected" },
    });
    expect(await bucket.text()).toBe(textOf(base()));
    expect(await web.held()).toContain("duplicate_key");
  });
});
