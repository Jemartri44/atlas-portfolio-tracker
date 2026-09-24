// @vitest-environment happy-dom
//
// The ECB rate in the form (feature 012, block 3): proposed from the history
// imported into this browser for the fiscal date, never invented, and a typed
// rate that is not the official one asks for its yes before the write. The
// browser storage is the IndexedDB double of the adapters.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { saveImportedHistory } from "@atlas/adapters/reference";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FakeIdbFactory } from "../../../packages/adapters/test/fake-idb.js";
import { reloadWebHistory } from "../src/ecb/history.js";
import RegistrarForm from "../src/routes/registrar/form.jsx";
import { choose, press, settle, show, text, type, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const holder = globalThis as { indexedDB?: unknown };
const before = holder.indexedDB;
const synthetic = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/ecb/eurofxref-hist.csv"),
  "utf8",
);

beforeAll(async () => {
  holder.indexedDB = new FakeIdbFactory();
  await saveImportedHistory({
    text: synthetic,
    source: "zip",
    file_name: "eurofxref-hist.csv",
    imported_at: "2026-04-01T10:00:00.000Z",
  });
  await reloadWebHistory();
});

afterAll(() => {
  holder.indexedDB = before;
});

const until = async (condition: () => boolean, ms = 3000): Promise<void> => {
  const deadline = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > deadline) {
      throw new Error("no llegó a pasar");
    }
    await settle(5);
  }
};

const value = (host: HTMLElement, id: string): string =>
  (host.querySelector(`#${id}`) as HTMLInputElement | null)?.value ?? "";

const goldBuy = async (trade: string): Promise<HTMLElement> => {
  const host = await show("/registrar/buy", RegistrarForm, "/registrar/:tipo");
  choose(host, "f-account_id", "acc_ibkr");
  choose(host, "f-asset_id", "ast_gold");
  await settle();
  type(host, "f-trade_date", trade);
  type(host, "f-value_date", trade);
  type(host, "f-quantity", "1");
  type(host, "f-unit_price", "100");
  await settle(20);
  return host;
};

describe("the ECB rate in the form", () => {
  it("proposes the official rate of the fiscal date, as the history writes it", async () => {
    const host = await goldBuy("2026-01-02");
    await until(() => value(host, "f-fx_rate") === "1,1169");
    expect(value(host, "f-fx_rate_date")).toBe("2026-01-02");
    expect(text(host)).toContain("Tipo propuesto por el histórico del BCE");
  });

  it("proposes nothing for a day the ECB has not published, and takes the euro's 1 away", async () => {
    const host = await goldBuy("2026-04-01");
    await until(() => text(host).includes("El BCE todavía no ha publicado este tipo"));
    expect(value(host, "f-fx_rate")).toBe("");
  });

  it("asks for the yes when the typed rate is not the official one, and only writes after it", async () => {
    const host = await goldBuy("2026-01-02");
    await until(() => value(host, "f-fx_rate") === "1,1169");
    type(host, "f-fx_rate", "1,2");
    await settle(20);
    await press(host, "Ver el efecto");
    await until(() => text(host).includes("El tipo no es el oficial"));
    expect(text(host)).toContain("el BCE publicó 1,1169");
    const confirm = [...host.querySelectorAll("section.effect button")].find(
      (button) => button.textContent?.trim() === "Registrar",
    ) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    (host.querySelector("#confirm-fx-rate") as HTMLInputElement).click();
    await settle(10);
    expect(confirm.disabled).toBe(false);
  });

  it("does not ask when the typed rate is the same number written otherwise", async () => {
    const host = await goldBuy("2026-01-02");
    await until(() => value(host, "f-fx_rate") === "1,1169");
    type(host, "f-fx_rate", "1,11690");
    await settle(20);
    await press(host, "Ver el efecto");
    await until(() => host.querySelector("section.effect") !== null);
    expect(text(host)).not.toContain("El tipo no es el oficial");
  });
});
