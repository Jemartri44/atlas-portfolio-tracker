// A line typed with no echo (feature 017, E4; ADR-0034, row 21): what the user
// types for `atlas admin secrets` never reaches the screen, the history of the
// shell nor a log. The prompt goes to the real output; what is typed is read
// through a readline whose own output is swallowed, so nothing of it is echoed.

import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

export interface PromptStreams {
  readonly input: NodeJS.ReadableStream & { readonly isTTY?: boolean };
  readonly output: NodeJS.WritableStream;
}

/** The line typed (trimmed of the newline only), or `undefined` when there is no terminal to ask. */
export const askWithoutEcho = async (
  question: string,
  streams: PromptStreams,
): Promise<string | undefined> => {
  if (streams.input.isTTY !== true) {
    return undefined;
  }
  streams.output.write(question);
  const swallowed = new Writable({
    write: (_chunk, _encoding, done) => {
      done();
    },
  });
  const reader = createInterface({ input: streams.input, output: swallowed, terminal: true });
  try {
    return await reader.question("");
  } finally {
    reader.close();
    streams.output.write("\n");
  }
};
