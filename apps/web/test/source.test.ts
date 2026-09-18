// Where the ledger lives and, above all, **the export reminder**.
//
// On a phone the ledger always lives inside the browser and this warning is the
// only safety net there is (decision (l), ADR-0019): if it never fires, the
// user finds out the day they clear the site data. Nothing was importing this
// module, so two mutations passed the whole suite — `exportIsOverdue` returning
// always `false`, and a factor of ten in the milliseconds of a day.
//
// They are pure functions over strings, so they need neither a DOM nor a clock.

import { describe, expect, it } from "vitest";
import {
  type BrowserSource,
  daysSinceExport,
  EXPORT_REMINDER_DAYS,
  exportIsOverdue,
  type LedgerSource,
  rememberedKind,
  sourceLabel,
} from "../src/ledger/source.js";

const browser = (lastExportAt?: string): BrowserSource => ({
  kind: "browser",
  persisted: true,
  ...(lastExportAt === undefined ? {} : { lastExportAt }),
});

const directory: LedgerSource = {
  kind: "directory",
  directoryName: "atlas",
  fileName: "ledger.jsonl",
  permission: "granted",
};

describe("daysSinceExport", () => {
  it("counts whole days, and a day is 86.400.000 ms", () => {
    expect(daysSinceExport(browser("2026-09-18T20:15:00.000Z"), "2026-09-18")).toBe(0);
    expect(daysSinceExport(browser("2026-09-17T00:00:00.000Z"), "2026-09-18")).toBe(1);
    expect(daysSinceExport(browser("2026-09-11T08:00:00.000Z"), "2026-09-18")).toBe(7);
    // A whole year: with the factor of ten wrong this said 3.650.
    expect(daysSinceExport(browser("2025-09-18T00:00:00.000Z"), "2026-09-18")).toBe(365);
  });

  it("is undefined when it has never been exported, which is not a zero", () => {
    expect(daysSinceExport(browser(), "2026-09-18")).toBeUndefined();
  });

  it("never goes negative when the device clock runs behind", () => {
    expect(daysSinceExport(browser("2026-09-20T00:00:00.000Z"), "2026-09-18")).toBe(0);
  });
});

describe("exportIsOverdue", () => {
  it("fires when it has never been exported: the worst case of ADR-0019", () => {
    expect(exportIsOverdue(browser(), "2026-09-18")).toBe(true);
  });

  it("fires past the week and not before, on the day of the boundary", () => {
    expect(EXPORT_REMINDER_DAYS).toBe(7);
    expect(exportIsOverdue(browser("2026-09-18T00:00:00.000Z"), "2026-09-18")).toBe(false);
    expect(exportIsOverdue(browser("2026-09-11T00:00:00.000Z"), "2026-09-18")).toBe(false);
    expect(exportIsOverdue(browser("2026-09-10T00:00:00.000Z"), "2026-09-18")).toBe(true);
    expect(exportIsOverdue(browser("2026-06-18T00:00:00.000Z"), "2026-09-18")).toBe(true);
  });

  it("says nothing about a ledger that is a file on the disk", () => {
    // There the CLI and the backup already exist: nothing to nag about.
    expect(exportIsOverdue(directory, "2026-09-18")).toBe(false);
  });
});

describe("sourceLabel", () => {
  it("names the file and its folder, or the browser storage", () => {
    expect(sourceLabel(directory)).toBe("ledger.jsonl · atlas");
    expect(sourceLabel(browser())).toBe("Almacenamiento del navegador");
  });
});

describe("the remembered choice", () => {
  it("remembers nothing where there is no storage, instead of throwing", () => {
    // No DOM here, so `window` does not even exist: the same path as a private
    // window with the site data blocked.
    expect(rememberedKind()).toBeUndefined();
  });
});
