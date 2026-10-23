// @vitest-environment happy-dom
//
// A split typed upside down books every lot wrong without any error, so the form refuses it where
// the user can read why — the same rule the console applies.

import { describe, expect, it } from "vitest";
import CorporateForm from "../src/routes/registrar/corporate/form.jsx";
import { choose, settle, show, text, type, withGoldenLedger } from "./helpers/render.jsx";

withGoldenLedger();

const fill = async (slug: string, ratio: string): Promise<HTMLElement> => {
  const host = await show(
    `/registrar/evento-corporativo/${slug}`,
    CorporateForm,
    "/registrar/evento-corporativo/:kind",
  );
  choose(host, "ca-asset_id", "ast_alpha");
  type(host, "ca-effective_date", "2028-11-02");
  type(host, "ca-source_document", "https://example.test/nota.pdf");
  type(host, "ca-ratio", ratio);
  await settle(30);
  return host;
};

const preview = (host: HTMLElement): HTMLButtonElement =>
  [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("Ver el efecto"),
  ) as HTMLButtonElement;

describe("the corporate action forms: the direction of the ratio", () => {
  it.each([
    ["split", "1/4", "ha de ser mayor que 1"],
    ["split", "0,5", "ha de ser mayor que 1"],
    ["split", "1", "no cambia el número de títulos"],
    ["contrasplit", "4", "ha de ser menor que 1"],
    ["contrasplit", "1", "no cambia el número de títulos"],
  ])(
    "%s with %s says why it is refused, and cannot be previewed",
    async (slug, ratio, sentence) => {
      const host = await fill(slug, ratio);
      expect(text(host)).toContain(sentence);
      expect(preview(host).disabled).toBe(true);
    },
  );

  it.each([
    ["split", "2"],
    ["split", "3/2"],
    ["contrasplit", "1/3"],
    ["contrasplit", "0,25"],
  ])("%s with %s is accepted", async (slug, ratio) => {
    const host = await fill(slug, ratio);
    expect(text(host)).not.toContain("ha de ser");
    expect(preview(host).disabled).toBe(false);
  });
});
