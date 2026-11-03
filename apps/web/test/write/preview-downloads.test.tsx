// @vitest-environment happy-dom
//
// A live preview is asked for after every pause while typing: it must work on the ledger the
// screen already holds, not download the whole ledger again each time. Only the write itself
// (and its etag check) reads it fresh.

import { afterEach, describe, expect, it } from "vitest";
import { bootCloud } from "../../src/ledger/cloud.js";
import { store } from "../../src/ledger/state.js";
import { closedYearsOfDraft, previewDraft, recordDraft } from "../../src/ledger/write.js";
import { apiAt, sameOrigin, signedIn } from "../cloud/api-support.js";
import { goldenText } from "../helpers/golden.js";
import { until } from "../helpers/render.jsx";

const draft = {
  type: "cash_deposit",
  account_id: "acc_mi",
  value_date: "2027-08-25",
  amount: "11",
  currency: "EUR",
  fx_rate: "1",
  fx_rate_date: "2027-08-25",
} as never;

afterEach(() => {
  store.setPending(undefined);
  store.setDeps(undefined);
  store.setLoad({ phase: "loading" });
});

describe("the downloads of the ledger", () => {
  it("a preview makes none; the write checks the cloud before it writes", async () => {
    const api = apiAt();
    api.s3.seed("ledger/ledger.jsonl", goldenText());
    const cookie = (await signedIn(api)).cookie as string | undefined;
    const through = sameOrigin(api, () => cookie);
    let downloads = 0;
    const request = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input) === "/api/ledger" && (init?.method ?? "GET") === "GET") {
        downloads++;
      }
      return through(input, init);
    }) as typeof fetch;
    await bootCloud(request);
    await until(() => store.load().phase === "ready", "the ledger");

    downloads = 0;
    await previewDraft(draft);
    await closedYearsOfDraft(draft);
    expect(downloads).toBe(0);

    const written = await recordDraft(draft);
    expect(written.ok).toBe(true);
    // The check of the etag, the load of the use case and the reload after writing.
    expect(downloads).toBeGreaterThan(0);
  });
});
