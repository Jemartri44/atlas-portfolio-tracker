import { describe, expect, it } from "vitest";
import {
  type Details,
  ERRORS,
  FINDINGS,
  REMOTE_FAILURES,
  render,
  type Surface,
  say,
  type Voice,
  WARNINGS,
} from "../src/messages/index.js";

const plain = (surface: Surface): Voice => {
  const text = (value: unknown): string =>
    typeof value === "string" ? value : value === undefined ? "sin dato" : JSON.stringify(value);
  return {
    surface,
    text,
    one: text,
    many: text,
    thesis: text,
    money: text,
    quantity: text,
    titles: text,
    evidence: text,
    date: text,
    num: text,
    pct: text,
    pp: text,
    field: text,
    fields: text,
    kind: text,
    word: text,
    setting: text,
    days: text,
    count: (value) => (Array.isArray(value) ? value.length : 0),
  };
};

/**
 * Details of every shape a message may meet: every key answering the same thing. A message must
 * say something sensible whatever it is given (a detail that is missing, a list, a number), never
 * throw: a throw in the middle of a failure hides the failure.
 */
const SCENARIOS: readonly (() => Details)[] = [
  () => new Proxy({}, { get: () => "x" }),
  () => new Proxy({}, { get: () => ["a", "b"] }),
  () => new Proxy({}, { get: () => undefined }),
  () => new Proxy({}, { get: () => "2027-01-31" }),
  () => new Proxy({}, { get: () => 3 }),
  () => new Proxy({}, { get: () => "1" }),
  () => new Proxy({}, { get: () => [] }),
  () => new Proxy({}, { get: () => ({ id: "i", type: "buy", error: "e", code: "c" }) }),
  () => new Proxy({}, { get: () => [{ id: "i", type: "buy", error: "e", code: "c" }] }),
];

describe("the catalogue of messages", () => {
  const surfaces: Surface[] = ["cli", "web"];

  it.each([
    ["errors", ERRORS],
    ["warnings", WARNINGS],
    ["remote failures", REMOTE_FAILURES],
  ] as const)("says every entry of %s on both surfaces, whatever the details", (_name, table) => {
    expect(Object.keys(table).length).toBeGreaterThan(20);
    for (const [code, entry] of Object.entries(table)) {
      for (const surface of surfaces) {
        for (const scenario of SCENARIOS) {
          const said = render(entry, scenario(), plain(surface), "domain message");
          expect(said, `${code} on ${surface}`).toEqual(expect.any(String));
          expect(said.trim(), `${code} on ${surface}`).not.toBe("");
          expect(said, `${code} on ${surface}`).not.toContain("undefined");
        }
      }
    }
  });

  it("says every finding on both surfaces", () => {
    for (const [code, entry] of Object.entries(FINDINGS)) {
      for (const surface of surfaces) {
        for (const scenario of SCENARIOS) {
          for (const part of [entry.what, entry.todo]) {
            expect(part(scenario(), plain(surface), "m"), code).toEqual(expect.any(String));
          }
        }
      }
    }
  });

  it("appends the remedy of a surface after the shared sentence, and only on that surface", () => {
    const entry = {
      say: () => "Shared.",
      cli: () => "Console.",
      web: () => "Web.",
    };
    expect(render(entry, {}, plain("cli"), "")).toBe("Shared. Console.");
    expect(render(entry, {}, plain("web"), "")).toBe("Shared. Web.");
    expect(render({ say: () => "Shared.", cli: () => "" }, {}, plain("cli"), "")).toBe("Shared.");
    expect(render(() => "Bare.", {}, plain("web"), "")).toBe("Bare.");
  });

  it("answers undefined for a code it does not know, so the caller falls back to the domain", () => {
    expect(say("error", "no_such_code", {}, plain("cli"), "m")).toBeUndefined();
    expect(say("warning", "no_such_code", {}, plain("web"), "m")).toBeUndefined();
  });

  it("keeps a code of a kind apart from the same word of the other kind", () => {
    const both = Object.keys(ERRORS).filter((code) => code in WARNINGS);
    for (const code of both) {
      expect(say("error", code, {}, plain("cli"), "m")).toBeDefined();
      expect(say("warning", code, {}, plain("cli"), "m")).toBeDefined();
    }
  });
});
