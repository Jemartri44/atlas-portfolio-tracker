// What `atlas remote …` needs from outside the process, replaced in tests:
// the network (only ever the API), where the credentials live, the name of
// the machine, how to open a browser (best effort) and how to read the manual
// code **without showing it**.

import { spawn } from "node:child_process";
import { homedir, hostname } from "node:os";
import { DomainError } from "@atlas/domain";

export interface RemoteEnvironment {
  readonly fetch: typeof fetch;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly hostname: string;
  /** Tries to open the URL; never required, never waited for. */
  readonly openBrowser: (url: string) => void;
  /** Reads a line without echoing it (the manual code). */
  readonly readHidden: (prompt: string) => Promise<string>;
  /** How long the loopback waits for the return (the attempt lives 10 minutes). */
  readonly loopbackTimeoutMs: number;
}

const openWith = (url: string): void => {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "explorer.exe"
        : "xdg-open";
  try {
    const child = spawn(command, [url], { detached: true, stdio: "ignore" });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // Not required: the URL is always printed.
  }
};

interface HiddenInput extends NodeJS.ReadableStream {
  readonly isTTY?: boolean;
  setRawMode?(raw: boolean): unknown;
}

/** A line from a terminal with the echo off, or from a pipe as it comes. */
export const readHiddenLine = (
  prompt: string,
  input: HiddenInput = process.stdin,
  output: NodeJS.WritableStream = process.stderr,
): Promise<string> =>
  new Promise((resolve, reject) => {
    output.write(prompt);
    const raw = input.isTTY === true;
    let text = "";
    const done = (value: string | Error): void => {
      input.off("data", onData);
      input.off("end", onEnd);
      if (raw) {
        input.setRawMode?.(false);
      }
      input.pause();
      output.write("\n");
      if (value instanceof Error) {
        reject(value);
      } else {
        resolve(value.trim());
      }
    };
    const onData = (chunk: Buffer | string): void => {
      for (const char of chunk.toString()) {
        if (char === "\u0003") {
          done(new DomainError("login_interrupted", "the sign-in was interrupted"));
          return;
        }
        // End of input from the keyboard before anything was typed.
        if (char === "\u0004" && text === "") {
          onEnd();
          return;
        }
        if (char === "\r" || char === "\n") {
          done(text);
          return;
        }
        text = char === "\u007f" || char === "\b" ? text.slice(0, -1) : text + char;
      }
    };
    // The input closed (a pipe, a terminal that went away) before the line came: nothing to wait for.
    const onEnd = (): void => {
      // A code piped in with no line break at the end is a code all the same.
      const typed = text.trim();
      done(
        typed === ""
          ? new DomainError("login_no_code", "the input closed before the code arrived")
          : typed,
      );
    };
    if (raw) {
      input.setRawMode?.(true);
    }
    input.resume();
    input.on("data", onData);
    input.on("end", onEnd);
  });

export const systemRemote = (): RemoteEnvironment => ({
  fetch: globalThis.fetch,
  env: process.env,
  home: homedir(),
  hostname: hostname(),
  openBrowser: openWith,
  readHidden: readHiddenLine,
  loopbackTimeoutMs: 10 * 60 * 1000,
});
