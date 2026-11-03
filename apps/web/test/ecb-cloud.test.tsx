// @vitest-environment happy-dom
//
// The web reads the ECB history from its own cloud — the manifest, then the file in force, its
// SHA-256 checked against the manifest before anything reads it — and holds it in memory: nothing
// is kept on the device. Over a `fetch` that answers as the API does; never the network.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { forgetWebHistory, loadWebHistory, reloadWebHistory } from "../src/ecb/history.js";
import Ajustes from "../src/routes/ajustes/index.jsx";
import { referenceAnswer, serveReference } from "./helpers/cloud-reference.js";
import { press, settle, show, text, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const root = dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(join(root, "../../../tests/fixtures/ecb/eurofxref-hist.csv"), "utf8");

let restore: (() => void) | undefined;
const cloud = (...args: Parameters<typeof serveReference>): void => {
  restore?.();
  forgetWebHistory();
  restore = serveReference(...args);
};
beforeEach(() => cloud({}));
afterEach(() => {
  restore?.();
  restore = undefined;
  forgetWebHistory();
});

describe("the ECB history of the cloud in the web", () => {
  it("reads the file in force, checks its SHA-256 and holds it in memory", async () => {
    cloud({ ecb: { csv } });
    const web = await loadWebHistory();
    expect(web).toMatchObject({ source: "zip", latest: "2026-03-31" });
    expect(web.problem).toBeUndefined();
  });

  it("asks the cloud once per page, and again after forgetting", async () => {
    let asked = 0;
    const holder = globalThis as { fetch: typeof fetch };
    holder.fetch = (async (input: RequestInfo | URL) => {
      asked += 1;
      return referenceAnswer(String(input), { ecb: { csv } }) as Response;
    }) as typeof fetch;
    await loadWebHistory();
    const first = asked;
    await loadWebHistory();
    expect(asked).toBe(first);
    await reloadWebHistory();
    expect(asked).toBe(first * 2);
  });

  it("never uses a file that is not the one its manifest records", async () => {
    cloud({ ecb: { csv, hash: "0".repeat(64) } });
    const web = await loadWebHistory();
    expect(web.history).toBeUndefined();
    expect(web.problem).toBe("unreadable");
  });

  it("never uses a file that does not read", async () => {
    cloud({ ecb: { csv: "this is not a history" } });
    const web = await loadWebHistory();
    expect(web.history).toBeUndefined();
    expect(web.problem).toBe("unreadable");
  });

  it("has no history, and no problem, when the cloud has none yet", async () => {
    expect(await loadWebHistory()).toEqual({ staleDays: 30 });
  });

  it("says the cloud's failure by its code, and asks again next time", async () => {
    cloud({ status: 403 });
    expect(await loadWebHistory()).toMatchObject({ problem: "unavailable", code: "not_allowed" });
    cloud({ ecb: { csv } });
    // `cloud` forgets; the point is that the failure itself was not held either.
    const holder = globalThis as { fetch: typeof fetch };
    let down = true;
    holder.fetch = (async (input: RequestInfo | URL) =>
      referenceAnswer(
        String(input),
        down ? { status: 503 } : { ecb: { csv } },
      ) as Response) as typeof fetch;
    forgetWebHistory();
    expect((await loadWebHistory()).problem).toBe("unavailable");
    down = false;
    expect((await loadWebHistory()).latest).toBe("2026-03-31");
  });
});

describe("the card of the ECB", () => {
  it("says it was read from the cloud, with no way to import or erase a copy", async () => {
    cloud({ ecb: { csv } });
    const host = await show("/ajustes", Ajustes);
    await settle(100);
    const said = text(host);
    expect(said).toContain("Leído de tu nube");
    expect(said).toContain("publica hasta el 31/03/2026");
    expect(said).not.toContain("Importar el histórico");
    expect(said).not.toContain("Borrar la copia");
  });

  it("says an unreadable history as what it is", async () => {
    cloud({ ecb: { csv: "this is not a history" } });
    const host = await show("/ajustes", Ajustes);
    await settle(100);
    expect(text(host)).toContain("no se entiende: no se usa");
  });

  it("gives the reason in words when the cloud did not answer, never only the code", async () => {
    cloud({ status: 403 });
    const host = await show("/ajustes", Ajustes);
    await settle(100);
    expect(text(host)).toContain("No se ha podido leer el histórico del BCE de la nube");
    expect(text(host)).not.toContain("not_allowed");
  });

  it("reads it again from its button", async () => {
    cloud({ ecb: { csv } });
    const host = await show("/ajustes", Ajustes);
    await settle(100);
    await press(host, "Volver a leer");
    await settle(100);
    expect(text(host)).toContain("Histórico leído de la nube: publica hasta el 31/03/2026.");
  });
});
