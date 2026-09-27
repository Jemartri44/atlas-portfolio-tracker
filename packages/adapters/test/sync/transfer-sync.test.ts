// Importing and exporting in a synced browser (§6.2 P2 and P3): the import is
// refused **in the same transaction** that would replace the ledger, and the
// export carries what the sync holds back, apart.

import {
  holdRecords,
  lineSha256,
  markerFor,
  recordsText,
  serializeMarker,
} from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import { LEDGER_STORE } from "../../src/ledger-store/browser/idb.js";
import { BrowserLedgerBlob } from "../../src/ledger-store/browser/indexeddb.js";
import {
  SYNC_DEVICE_KEY,
  SYNC_HELD_KEY,
  SYNC_STATE_KEY,
} from "../../src/ledger-store/browser/sync-store.js";
import {
  etagOfText,
  exportLedgerAndHeld,
  heldDownloaded,
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
    // E4: the device it joined with, alone, is a start cut before its end.
    ["only the device it joined with", SYNC_DEVICE_KEY, () => "dev_web"],
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
  const held = recordsText(
    holdRecords(["x"], "client", { code: "new_duplicate", details: {} }, "t"),
  );

  it("gives what is held back apart, only when something is unresolved, and the ledger byte for byte", async () => {
    const web = webDevice(base());
    expect(await exportLedgerAndHeld(new Date("2027-01-01T00:00:00Z"), web.open)).toEqual({
      text: textOf(base()),
    });
    web.db.store(LEDGER_STORE).set(SYNC_HELD_KEY, held);
    expect(await exportLedgerAndHeld(new Date("2027-01-01T00:00:00Z"), web.open)).toEqual({
      text: textOf(base()),
      held,
      heldOperations: 1,
    });
  });

  // Review of PR #97, correctness N1: a held file with everything resolved
  // is not exported — whoever retyped it by hand would record twice what was
  // already confirmed or redone.
  it("gives nothing apart when everything held back is resolved", async () => {
    const web = webDevice(base());
    const resolved = `${held}${JSON.stringify({
      held_format: 1,
      kind: "resolved",
      at: "t2",
      line_sha256: lineSha256("x"),
      resolution: "discarded",
    })}\n`;
    web.db.store(LEDGER_STORE).set(SYNC_HELD_KEY, resolved);
    expect(await exportLedgerAndHeld(new Date("2027-01-01T00:00:00Z"), web.open)).toEqual({
      text: textOf(base()),
    });
  });

  // Review of PR #97, security N3: an unreadable held file never keeps the
  // ledger from being exported, and the export says what it could not give.
  it("exports the ledger, with its date, when what is held cannot be read, and says so", async () => {
    const web = webDevice(base());
    web.db.store(LEDGER_STORE).set(SYNC_HELD_KEY, "{");
    const when = new Date("2027-01-01T00:00:00Z");
    expect(await exportLedgerAndHeld(when, web.open)).toEqual({
      text: textOf(base()),
      heldUnreadable: true,
    });
    expect(web.db.store(LEDGER_STORE).get("current:meta")).toEqual({
      lastExportAt: when.toISOString(),
    });
  });

  // Round 2 of the review of PR #97, N2: the export owes what is held back
  // until its file is downloaded; the date stays.
  it("owes what is held back until it is downloaded apart, and keeps the date", async () => {
    const web = webDevice(base());
    const blob = new BrowserLedgerBlob(web.open);
    const when = new Date("2027-01-01T00:00:00Z");
    await exportLedgerAndHeld(when, web.open);
    expect(await blob.exportState()).toEqual({ lastExportAt: when.toISOString() });
    web.db.store(LEDGER_STORE).set(SYNC_HELD_KEY, held);
    await exportLedgerAndHeld(when, web.open);
    expect(await blob.exportState()).toEqual({ lastExportAt: when.toISOString(), heldOwed: 1 });
    await heldDownloaded(web.open);
    expect(await blob.exportState()).toEqual({ lastExportAt: when.toISOString() });
  });
});
