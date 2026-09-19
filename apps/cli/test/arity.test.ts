// Every command says how many words it reads, and a word more is refused
// (verifier of feature 009): a word left loose by a boolean flag used to be
// ignored, and the command recorded the opposite of what was written.

import { describe, expect, it } from "vitest";
import { ARITY, COMMANDS } from "../src/main.js";
import { harness, seed } from "./harness.js";

describe("the words a command reads", () => {
  it("are declared for every command, and only for commands", () => {
    expect(Object.keys(ARITY).sort()).toEqual(Object.keys(COMMANDS).sort());
  });

  it("refuse the first one too many, by name, before anything is recorded", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(["tax", "2027", "2028"])).toBe(64);
    expect(h.err.join("\n")).toContain("sobra el argumento «2028»: «atlas tax 2027» no lo espera");
    h.reset();
    expect(await h.exec(["positions", "ast_world"])).toBe(64);
    expect(h.err.join("\n")).toContain("sobra el argumento «ast_world»");
    h.reset();
    expect(await h.exec(["thesis", "close", "t1", "t2", "--notes", "x", "--yes"])).toBe(64);
    expect(h.err.join("\n")).toContain(
      "sobra el argumento «t2»: «atlas thesis close t1» no lo espera",
    );
  });

  it("leave an unknown subcommand to the command, which says its own usage", async () => {
    const h = harness({ events: seed() });
    expect(await h.exec(["thesis", "rename", "a", "b"])).toBe(64);
    expect(h.err.join("\n")).not.toContain("sobra el argumento");
  });
});
