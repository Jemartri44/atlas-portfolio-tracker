// Reads `atlas.config.json` from the ledger folder (Node side). The parsing and
// the defaults are the domain's (`@atlas/domain/ecb`); this only reads bytes.
// The application never writes this file: the user does.

import { promises as fs } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_LOCAL_CONFIG,
  LOCAL_CONFIG_FILE,
  type LocalConfig,
  parseLocalConfig,
} from "@atlas/domain/ecb";

export const readLocalConfig = async (folder: string): Promise<LocalConfig> => {
  let text: string;
  try {
    text = await fs.readFile(join(folder, LOCAL_CONFIG_FILE), "utf8");
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return DEFAULT_LOCAL_CONFIG;
    }
    throw error;
  }
  return parseLocalConfig(text);
};
