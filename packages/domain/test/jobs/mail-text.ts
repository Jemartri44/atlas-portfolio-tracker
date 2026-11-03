// What a test reads of the text version of a mail: the lines between its title and its link.

import { expect } from "vitest";
import { FOOTER } from "../../src/jobs/mail/layout.js";

/** The lines of the sections and warnings, without the title, the link or the footer. */
export const inner = (body: string): string[] => {
  const lines = body.split("\n").slice(2);
  const end = lines.findIndex((line) => line.startsWith("Abrir Atlas: ") || line === "--");
  const kept = end === -1 ? lines : lines.slice(0, end);
  return kept.at(-1) === "" ? kept.slice(0, -1) : kept;
};

/** The title line of the text version. */
export const titleOf = (body: string): string => body.split("\n")[0] as string;

const literal = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The whole text of a one-section mail, whatever its title: exactly these lines, link and footer. */
export const wholeBody = (lines: readonly string[], origin: string): unknown =>
  expect.stringMatching(
    new RegExp(
      `^[^\\n]+\\n\\n${literal(lines.join("\n"))}\\n\\nAbrir Atlas: ${literal(origin)}\\n\\n--\\n${literal(FOOTER)}\\n$`,
    ),
  );
