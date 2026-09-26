// What `atlas remote …` needs from outside the process, replaced in tests:
// the network (only ever the API), where the credentials live, the name of
// the machine, how to open a browser (best effort) and how to read the manual
// code **without showing it**.

import { spawn } from "node:child_process";
import { homedir, hostname } from "node:os";

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

/** A line from a terminal with the echo off, or from a pipe as it comes. */
const readHiddenLine = (prompt: string): Promise<string> =>
  new Promise((resolve, reject) => {
    process.stderr.write(prompt);
    const input = process.stdin;
    const raw = input.isTTY === true;
    let text = "";
    const done = (value: string | Error): void => {
      input.off("data", onData);
      if (raw) {
        input.setRawMode(false);
      }
      input.pause();
      process.stderr.write("\n");
      if (value instanceof Error) {
        reject(value);
      } else {
        resolve(value.trim());
      }
    };
    const onData = (chunk: Buffer): void => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          done(new Error("interrupted"));
          return;
        }
        if (char === "\r" || char === "\n") {
          done(text);
          return;
        }
        text = char === "\u007f" || char === "\b" ? text.slice(0, -1) : text + char;
      }
    };
    if (raw) {
      input.setRawMode(true);
    }
    input.resume();
    input.on("data", onData);
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
