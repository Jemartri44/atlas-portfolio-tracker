// With --json a write answers with one JSON object on stdout; everything meant
// for the person (previews, notes, the question) goes to stderr.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUY_WORLD, harness, idAt, seed } from "../harness.js";

const CA = ["--effective-date", "2027-03-01", "--source-document", "https://issuer.example/n.pdf"];

const only = (out: string[]): Record<string, unknown> => {
  expect(out).toHaveLength(1);
  return JSON.parse(out[0] as string) as Record<string, unknown>;
};

describe("writes with --json", () => {
  it("add: stdout is the recorded event, the preview and the confirmation line are on stderr", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec([...BUY_WORLD, "--json"])).toBe(0);
    expect(only(h.out)).toMatchObject({ status: "recorded", event: { type: "buy" } });
    expect(h.err.join("\n")).toContain("Evento a registrar:");
    expect(h.err.join("\n")).toContain("Registrado buy");
  });

  it("add: a declined confirmation answers {status: cancelled}", async () => {
    const h = harness({ events: seed(), confirm: false });
    expect(await h.exec(BUY_WORLD.filter((word) => word !== "--yes").concat("--json"))).toBe(0);
    expect(only(h.out)).toEqual({ status: "cancelled" });
  });

  it("edit and delete: stdout is a single object", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(BUY_WORLD)).toBe(0);
    const buyId = await idAt(h.store, 5);
    h.reset();
    expect(
      await h.exec(["edit", buyId, "--reason", "x", "--amount", "1100", "--yes", "--json"]),
    ).toBe(0);
    expect(only(h.out)).toMatchObject({ status: "recorded", reversal: { type: "reversal" } });
    expect(h.err.join("\n")).toContain("Evento original");
    h.reset();
    const correctedId = await idAt(h.store, 7);
    expect(await h.exec(["delete", correctedId, "--reason", "x", "--yes", "--json"])).toBe(0);
    expect(only(h.out)).toMatchObject({ status: "recorded", reversal: { type: "reversal" } });
    h.reset();
    const declined = harness({ events: seed(), confirm: false });
    expect(await declined.exec(BUY_WORLD)).toBe(0);
    declined.reset();
    expect(
      await declined.exec(["delete", await idAt(declined.store, 5), "--reason", "x", "--json"]),
    ).toBe(0);
    expect(only(declined.out)).toEqual({ status: "cancelled" });
  });

  it("ca: the preview figures and the outcome come in one object", async () => {
    const h = harness({ events: seed(), confirm: true });
    expect(await h.exec(BUY_WORLD)).toBe(0);
    h.reset();
    expect(
      await h.exec(["ca", "split", "--asset", "ast_world", "--ratio", "4", ...CA, "--json"]),
    ).toBe(0);
    expect(only(h.out)).toMatchObject({ status: "recorded", after: expect.anything() });
    expect(h.err.join("\n")).toContain("Posiciones");
  });
});

const prompt = vi.hoisted(() => ({ outputs: [] as unknown[] }));

vi.mock("node:readline/promises", () => ({
  createInterface: (options: { output: unknown }) => {
    prompt.outputs.push(options.output);
    return { question: async () => "s", close: () => undefined };
  },
}));

describe("the questions of the terminal with --json", () => {
  beforeEach(() => {
    prompt.outputs.length = 0;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });
  });

  it.each(["confirm", "ask"] as const)("%s is written on stderr, not on stdout", async (kind) => {
    const { terminalIo } = await import("../../src/main.js");
    await terminalIo()[kind]?.("¿?", { aside: true });
    await terminalIo()[kind]?.("¿?");
    expect(prompt.outputs).toEqual([process.stderr, process.stdout]);
  });
});
