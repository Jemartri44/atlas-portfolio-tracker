// No fiscal figure moves by syncing (feature 014, §0 and block 5). The same
// ledger — the same bytes — with and without `sync/` next to it gives the
// same output of every fiscal command, byte for byte; and a ledger reordered
// by a real sync between two consoles too. The prediction is written in
// `specs/014-ledger-sync-core/questions.md` §10.6 before running this: nothing
// moves. Feature 015 (E3): and a ledger reordered by a sync **through the API**
// with the double of S3, the prediction in `specs/015-api-access/questions.md`
// §23.6.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  FileLedgerStore,
  FolderSyncStore,
  initialiseRemote,
  replaceFromRemote,
  syncDevice,
} from "@atlas/adapters";
import {
  CURRENT_LEDGER_SCHEMA,
  decodeLine,
  encodeLine,
  type LedgerEvent,
  sha256Hex,
  utf8Encode,
} from "@atlas/domain";
import {
  acceptAppend,
  acceptInit,
  EMPTY_ETAG,
  holdRecords,
  linesOfText,
  markerFor,
  RemoteError,
  type RemoteLedger,
  recordsText,
  serializeMarker,
  textOfLines,
} from "@atlas/domain/sync";
import { describe, expect, it } from "vitest";
import { SELF } from "../../../api/test/harness.js";
import { CLI_SETTINGS, Events } from "../events.js";
import { folder } from "../prices/folder.js";
import { setupConsole } from "../support/console.js";

const fixtures = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../tests/fixtures/ledger",
);

const synthetic = async (): Promise<LedgerEvent[]> =>
  (await readFile(join(fixtures, "synthetic-v1.jsonl"), "utf8"))
    .split("\n")
    .filter((text) => text !== "")
    .map((text) => decodeLine(text).event);

const FISCAL = (year: string) => [
  ["tax", year],
  ["tax", year, "--lots"],
  ["tax", year, "--boxes"],
  ["tax", year, "--json"],
  ["gains", year],
  ["income", year],
  ["m720", year],
  ["m720", year, "--json"],
  ["m721", year],
  ["m721", year, "--json"],
  ["filed", "renta", year],
];

/** `sync/` as a synced device has it: the marker, something held back, something discarded. */
const withSync = async (dir: string, lines: readonly string[]): Promise<void> => {
  await mkdir(join(dir, "sync"), { recursive: true });
  await writeFile(join(dir, "sync", "state.json"), serializeMarker(markerFor(lines, lines.length)));
  const held = holdRecords(
    [lines[0] as string],
    "client",
    { code: "new_duplicate", details: {} },
    "t",
  );
  await writeFile(join(dir, "sync", "held.jsonl"), recordsText(held));
  await writeFile(join(dir, "sync", "discarded.jsonl"), "");
};

const sameFiscalOutput = async (
  events: readonly LedgerEvent[],
  years: string[],
  instant: string,
) => {
  const without = await folder([...events]);
  const synced = await folder([...events]);
  without.instant = instant;
  synced.instant = instant;
  await withSync(synced.dir, events.map(encodeLine));
  expect(await readFile(synced.ledger, "utf8")).toBe(await readFile(without.ledger, "utf8"));
  for (const year of years) {
    for (const argv of FISCAL(year)) {
      const a = await without.atlas(...argv);
      const b = await synced.atlas(...argv);
      expect({ argv, code: b.code, text: b.text }).toEqual({ argv, code: a.code, text: a.text });
    }
  }
};

/** A remote for this test only: the domain's acceptance over a string, no HTTP. */
const remoteOf = (): { remote: RemoteLedger; text: () => string } => {
  let text = "";
  const rules = () => ({
    schema: CURRENT_LEDGER_SCHEMA,
    now: new Date("2028-03-01T10:00:00.000Z"),
    clockToleranceMs: 300_000,
  });
  const etag = () => sha256Hex(utf8Encode(text));
  return {
    text: () => text,
    remote: {
      read: async () => ({ text, etag: etag() }),
      append: async (entries, ifMatch) => {
        if (ifMatch !== etag()) {
          throw new RemoteError("precondition_failed", 412);
        }
        const judged = acceptAppend(linesOfText(text), entries, rules());
        text += textOfLines(judged.lines);
        return {
          etag: etag(),
          lines: linesOfText(text).length,
          accepted: judged.accepted,
          ...(judged.rejected === undefined ? {} : { rejected: judged.rejected }),
        };
      },
      init: async (content, ids, ifMatch) => {
        if (ifMatch !== EMPTY_ETAG || text !== "") {
          throw new RemoteError("precondition_failed", 412);
        }
        text = textOfLines(acceptInit(content, ids, rules()));
        return { etag: etag(), lines: linesOfText(text).length };
      },
      publish: async () => ({ device_id: "d", published_at: "t" }),
    },
  };
};

describe("the fiscal output with sync/ next to the ledger", () => {
  it("is identical for the synthetic ledger of the golden files, every year", async () => {
    await sameFiscalOutput(await synthetic(), ["2026", "2027", "2028"], "2029-03-01T10:00:00.000Z");
  }, 180_000);

  it("is identical for a ledger reordered by a real sync between two consoles", async () => {
    const b = new Events();
    b.settings(CLI_SETTINGS);
    b.account("acc_ib", "IE");
    b.asset("etf_a", "etf");
    b.deposit("acc_ib", "2027-01-04", "70000");
    b.buy("acc_ib", "etf_a", "2027-01-05", "100", "500");
    const shared = b.build();
    const { remote, text } = remoteOf();
    const laptop = await folder([...shared]);
    const phone = await folder([...shared]);
    const options = {
      schema: CURRENT_LEDGER_SCHEMA,
      now: () => new Date("2028-03-01T10:00:00.000Z"),
    };
    const laptopSync = new FolderSyncStore(new FileLedgerStore(laptop.ledger));
    const phoneSync = new FolderSyncStore(new FileLedgerStore(phone.ledger));
    await initialiseRemote(laptopSync, remote, options);
    await replaceFromRemote(phoneSync, remote, options, "join");
    // Two sales of the same day, recorded on each device without a connection.
    const sale = (id: string, quantity: string, price: string): LedgerEvent =>
      ({
        ...new Events().sell("acc_ib", "etf_a", "2027-03-05", quantity, price),
        id,
        fingerprint: `sha256:${id}`,
      }) as LedgerEvent;
    const one = { build: () => [sale("01ARYZ6S41TSV4RRFFQ690M001", "10", "520")] };
    const two = { build: () => [sale("01ARYZ6S41TSV4RRFFQ690P001", "20", "510")] };
    const append = async (path: string, events: LedgerEvent[]) => {
      const store = new FileLedgerStore(path);
      await store.append(events, (await store.load()).etag);
    };
    await append(phone.ledger, two.build());
    await append(laptop.ledger, one.build());
    await syncDevice(phoneSync, remote, options);
    // The laptop's sale moves behind the phone's: the ledger is reordered.
    expect(await syncDevice(laptopSync, remote, options)).toMatchObject({
      status: "synced",
      uploaded: 1,
    });
    const reordered = linesOfText(await readFile(laptop.ledger, "utf8"));
    expect(reordered).toEqual(linesOfText(text()));
    expect(reordered.slice(-2)).toEqual([...two.build(), ...one.build()].map(encodeLine));
    await sameFiscalOutput(
      reordered.map((line) => decodeLine(line).event),
      ["2027"],
      "2028-03-01T10:00:00.000Z",
    );
  }, 60_000);
  it("is identical for a ledger reordered by a sync through the API (feature 015)", async () => {
    const b = new Events();
    b.settings(CLI_SETTINGS);
    b.account("acc_ib", "IE");
    b.asset("etf_a", "etf");
    b.deposit("acc_ib", "2027-01-04", "70000");
    b.buy("acc_ib", "etf_a", "2027-01-05", "100", "500");
    const shared = b.build().map(encodeLine);
    const sale = (id: string, quantity: string, price: string): string =>
      encodeLine({
        ...new Events().sell("acc_ib", "etf_a", "2027-03-05", quantity, price),
        id,
        fingerprint: `sha256:${id}`,
      } as LedgerEvent);
    const laptop = await setupConsole();
    const phone = await setupConsole({}, laptop.api);
    for (const c of [laptop, phone]) {
      await writeFile(join(c.ledger, "ledger.jsonl"), textOfLines(shared));
      expect(await c.exec(["remote", "login", "--origin", SELF])).toBe(0);
    }
    expect(await laptop.exec(["sync", "init", "--origin", SELF])).toBe(0);
    expect(await phone.exec(["sync", "join", "--from-remote", "--origin", SELF])).toBe(0);
    const add = async (dir: string, line: string) => {
      const path = join(dir, "ledger.jsonl");
      await writeFile(path, (await readFile(path, "utf8")) + textOfLines([line]));
    };
    await add(phone.ledger, sale("01ARYZ6S41TSV4RRFFQ690P002", "20", "510"));
    await add(laptop.ledger, sale("01ARYZ6S41TSV4RRFFQ690M002", "10", "520"));
    expect(await phone.exec(["sync"])).toBe(0);
    expect(await laptop.exec(["sync"])).toBe(0);
    // Reordered by the API: the laptop's sale behind the phone's, byte for byte the remote.
    const reordered = linesOfText(await readFile(join(laptop.ledger, "ledger.jsonl"), "utf8"));
    expect(reordered).toEqual(linesOfText(laptop.api.s3.text("ledger/ledger.jsonl") as string));
    expect(reordered.slice(-2)).toEqual([
      sale("01ARYZ6S41TSV4RRFFQ690P002", "20", "510"),
      sale("01ARYZ6S41TSV4RRFFQ690M002", "10", "520"),
    ]);
    await sameFiscalOutput(
      reordered.map((line) => decodeLine(line).event),
      ["2027"],
      "2028-03-01T10:00:00.000Z",
    );
  }, 120_000);
});
