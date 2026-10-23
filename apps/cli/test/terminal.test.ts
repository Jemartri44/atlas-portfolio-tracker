// The questions of the terminal: Ctrl-C ends a question instead of crashing with the stack of the
// prompt, and means «no» to a confirmation but the end of the order to a question that asks for a word.

import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { terminalIo } from "../src/main.js";

const terminal = (isTTY = true) => {
  const input = Object.assign(new PassThrough(), { isTTY });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const shown: string[] = [];
  stdout.on("data", (chunk) => shown.push(`out:${chunk}`));
  stderr.on("data", (chunk) => shown.push(`err:${chunk}`));
  return { io: terminalIo({ input, stdout, stderr }), input, shown };
};

describe("terminalIo: Ctrl-C at a question", () => {
  it("is a «no» to a confirmation", async () => {
    const { io, input } = terminal();
    const answer = io.confirm("¿? ");
    input.write("\u0003");
    expect(await answer).toBe(false);
  });

  it("ends the order when the question asks for a word", async () => {
    const { io, input } = terminal();
    const answer = io.ask?.("escribe: ");
    input.write("\u0003");
    await expect(answer).rejects.toMatchObject({ code: "prompt_interrupted" });
  });

  it("is written where the question was: stderr for an aside", async () => {
    const { io, input, shown } = terminal();
    const answer = io.confirm("¿? ", { aside: true });
    input.write("\u0003");
    await answer;
    expect(shown.join("")).toContain("err:");
    expect(shown.join("")).not.toContain("out:");
  });

  it("is still a yes only for s, sí, si or y", async () => {
    for (const [typed, expected] of [
      ["s", true],
      ["Sí", true],
      ["y", true],
      ["n", false],
      ["", false],
    ] as const) {
      const { io, input } = terminal();
      const answer = io.confirm("¿? ");
      input.write(`${typed}\n`);
      expect(await answer).toBe(expected);
    }
  });

  it("asks nothing without a terminal", async () => {
    const { io } = terminal(false);
    expect(await io.confirm("¿? ")).toBeUndefined();
    expect(await io.ask?.("x")).toBeUndefined();
  });
});
