// The fine of the communication is the law's figure, not the user's: the
// privacy mask does not hide it.

import { describe, expect, it } from "vitest";
import { sayWarning } from "./helpers/messages.js";

const details = { from_asset_id: "ast_world", to_asset_id: "ast_world" };

describe("the fine of the partner communication", () => {
  it.each([false, true])("reads 10.000 € with the mask %s", (privacy) => {
    expect(sayWarning("exchange_partner_communication", details, undefined, privacy)).toContain(
      "multa fija de 10.000 € por operación",
    );
  });
});
