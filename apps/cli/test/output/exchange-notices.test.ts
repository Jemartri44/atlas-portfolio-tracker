import { render, WARNINGS } from "@atlas/domain/messages";
import { expect, it } from "vitest";
import { CLI_VOICE } from "../../src/output/voice.js";

it("the console reads the fine of the partner communication as the web does", () => {
  const entry = WARNINGS.exchange_partner_communication;
  const details = { from_asset_id: "ast_a", to_asset_id: "ast_b" };
  expect(entry && render(entry, details, CLI_VOICE, "")).toContain(
    "multa fija de 10.000 € por operación",
  );
});
