import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repoRoot } from "./terraform.js";

export const costFile = join(repoRoot, "specs", "017-infrastructure-as-code", "cost.md");

/** The closed list of `cost.md`: the first column of its table. */
export const costTypes = (): Map<string, string> => {
  const found = new Map<string, string>();
  for (const line of readFileSync(costFile, "utf8").split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    const type = /^`(aws_[a-z0-9_]+)`$/.exec(cells[1] ?? "")?.[1];
    if (type !== undefined) {
      found.set(type, cells[3] ?? "");
    }
  }
  return found;
};
