// Q12, option (b) (§29 and §33): a pending line with a key twice — only a hand
// edit writes one — is held back by the sync in step 3, with `domain_rejected`
// and the code `duplicate_key`, **before** uploading it: the `400
// body_invalid` of the API never happens, and the sync does not stop.

import { encodeLine } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { initialiseRemote, syncDevice } from "../../src/sync/client.js";
import { discardHeldUnit, heldUnits } from "../../src/sync/held-actions.js";
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

  // Review of PR #98, B1 (§35): what the sync does with such a line already
  // annulled before syncing. The sync judges one unit at a time, and a plain
  // reversal is a unit of its own: the line is held with `duplicate_key` and
  // its reversal waits behind it; discarded, the line leaves the replica, the
  // reversal points at nothing and is held too, and discarding it leaves the
  // remote and the replica without either. The remote never gets the line.
  it("holds the line even annulled; discarded, its reversal is held as an orphan", async () => {
    const bucket = SimulatedBucket.inMemory();
    const options = clock();
    const web = webDevice(base());
    await initialiseRemote(web.sync, bucket.as("web"), options);
    const builder = new Builder(40);
    const deposit = builder.deposit("100");
    const line = encodeLine(deposit).replace('"amount":"100"', '"amount":"1","amount":"100"');
    const reversal = encodeLine(builder.reversal(deposit));
    const current = web.db.store("ledger").get("current") as { text: string; updatedAt: string };
    web.db
      .store("ledger")
      .set("current", { ...current, text: `${current.text}${line}\n${reversal}\n` });
    const first = await syncDevice(web.sync, bucket.as("web"), options);
    expect(first).toMatchObject({
      status: "synced",
      uploaded: 0,
      pending: 1,
      held: { lines: [line], code: "domain_rejected" },
    });
    expect(await web.held()).toContain("duplicate_key");
    // The reversal waits behind the unit it annuls: nothing new is held.
    const second = await syncDevice(web.sync, bucket.as("web"), options);
    expect(second).toMatchObject({ status: "synced", uploaded: 0, pending: 1 });
    expect((second as { held?: unknown }).held).toBeUndefined();
    for (const view of await heldUnits(web.sync, options)) {
      await discardHeldUnit(web.sync, view.unit.unit, options);
    }
    const third = await syncDevice(web.sync, bucket.as("web"), options);
    // Discarded, the line is gone; its reversal points at nothing, and is held
    // with `reversal_target_missing`. Discarding it too leaves nothing.
    expect(third).toMatchObject({
      uploaded: 0,
      pending: 0,
      held: { lines: [reversal], code: "domain_rejected" },
    });
    const [orphan] = await heldUnits(web.sync, options);
    expect(orphan?.unit.reason).toMatchObject({
      details: { domain_code: "reversal_target_missing" },
    });
    await discardHeldUnit(web.sync, orphan?.unit.unit as string, options);
    expect(await heldUnits(web.sync, options)).toEqual([]);
    expect(await syncDevice(web.sync, bucket.as("web"), options)).toMatchObject({
      status: "synced",
      uploaded: 0,
      pending: 0,
    });
    expect(await bucket.text()).toBe(textOf(base()));
  });
});
