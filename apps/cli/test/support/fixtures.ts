// The synthetic fixtures of the repository (`tests/fixtures/`), by folder.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../tests/fixtures");

export const LEDGER_FIXTURES = resolve(root, "ledger");
export const ECB_FIXTURES = resolve(root, "ecb");
