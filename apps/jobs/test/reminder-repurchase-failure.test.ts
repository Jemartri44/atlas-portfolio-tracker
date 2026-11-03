// The monthly reminder always arrives (constitution V): an engine that throws on the repurchase
// windows costs that one sentence, never the mail.

import { describe, expect, it, vi } from "vitest";
import { setupJobs } from "./harness.js";

vi.mock("@atlas/domain/fiscal", async (original) => ({
  ...(await original<typeof import("@atlas/domain/fiscal")>()),
  repurchaseCalendar: () => {
    throw new Error("the engine refuses this ledger");
  },
}));

describe("the monthly reminder when the windows cannot be read", () => {
  it("still arrives, and says they could not be checked", async () => {
    const jobs = setupJobs();
    await jobs.run(["monthly_reminder"]);
    expect(jobs.ses.sent).toHaveLength(1);
    expect(jobs.ses.sent[0]?.body).toContain(
      "Aviso. No se ha podido comprobar la ventana de recompra.",
    );
  });
});
