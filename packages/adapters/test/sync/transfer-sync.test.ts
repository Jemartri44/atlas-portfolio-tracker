// Importing and exporting in a synced browser (§6.2 P2 and P3): the import is
// refused **in the same transaction** that would replace the ledger, and the
// export carries what the sync holds back, apart.

import { holdRecords, markerFor, recordsText, serializeMarker } from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import { LEDGER_STORE } from "../../src/ledger-store/browser/idb.js";
import { SYNC_HELD_KEY, SYNC_STATE_KEY } from "../../src/ledger-store/browser/sync-store.js";
import {
  etagOfText,
  exportLedgerAndHeld,
  replaceLedgerText,
} from "../../src/ledger-store/browser/transfer.js";
import { base, textOf } from "./builder.js";
import { webDevice } from "./devices.js";

describe("importing into a synced browser (P2)", () => {
  const imported = textOf(base().slice(0, 2));

  it.each([
    ["a marker", SYNC_STATE_KEY, () => serializeMarker(markerFor([], 0))],
    ["only something held back", SYNC_HELD_KEY, () => ""],
    ["an unreadable marker", SYNC_STATE_KEY, () => "{"],
  ])("is refused with %s, in one transaction that writes nothing", async (_what, key, value) => {
    const web = webDevice(base());
    const values = web.db.store(LEDGER_STORE);
    values.set(key, value());
    const before = new Map(values);
    const created = web.db.created.length;
    const error = await replaceLedgerText(imported, etagOfText(await web.text()), web.open).catch(
      (e: unknown) => e,
    );
    expect(error).toMatchObject({ code: "import_refused_synced" });
    expect(new Map(values)).toEqual(before);
    expect(web.db.created.slice(created)).toEqual(["readwrite"]);
  });

  it("is admitted once the sync is deactivated", async () => {
    const web = webDevice(base());
    web.db
      .store(LEDGER_STORE)
      .set(SYNC_STATE_KEY, serializeMarker({ ...markerFor([], 0), status: "disabled" }));
    await replaceLedgerText(imported, etagOfText(await web.text()), web.open);
    expect(await web.text()).toBe(imported);
  });
});

describe("exporting a synced browser (P3)", () => {
  it("gives what is held back apart, only when something is unresolved, and the ledger byte for byte", async () => {
    const web = webDevice(base());
    expect(await exportLedgerAndHeld(new Date("2027-01-01T00:00:00Z"), web.open)).toEqual({
      text: textOf(base()),
    });
    const held = recordsText(
      holdRecords(["x"], "client", { code: "new_duplicate", details: {} }, "t"),
    );
    web.db.store(LEDGER_STORE).set(SYNC_HELD_KEY, held);
    expect(await exportLedgerAndHeld(new Date("2027-01-01T00:00:00Z"), web.open)).toEqual({
      text: textOf(base()),
      held,
    });
  });
});
