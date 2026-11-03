import { describe, expect, it } from "vitest";
import {
  exposureOrNone,
  exposureText,
  MAX_EXPOSURE_ASSETS,
  MAX_EXPOSURE_BYTES,
  parseExposureText,
  validateExposure,
} from "../../src/projections/exposure-file.js";

const assets = (value: unknown) => ({ exposure_format: 1, assets: value });
const good = { ast_world: { currency: { USD: "60", EUR: "40.5" }, region: { europe: "100" } } };
const good2 = { ast_world: { currency: { USD: "59.5", EUR: "40.5" } } };

const reasonOf = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    return (error as { code: string; details: Record<string, unknown> }).details;
  }
  return undefined;
};

describe("validateExposure", () => {
  it("accepts a valid document and returns what it declares", () => {
    expect(validateExposure(assets(good2))).toEqual(good2);
    expect(validateExposure(assets({}))).toEqual({});
    expect(validateExposure(assets({ a: {} }))).toEqual({ a: {} });
    // The ledger puts no shape on an id: spaces, slashes and accents are fine.
    expect(validateExposure(assets({ "Fondo A/B ñ": {} }))).toEqual({ "Fondo A/B ñ": {} });
  });

  it("says how much a split adds up to, in which asset and dimension", () => {
    expect(reasonOf(() => validateExposure(assets(good)))).toEqual({
      reason: "total",
      asset_id: "ast_world",
      dimension: "currency",
      total: "100.5",
    });
    expect(
      reasonOf(() => validateExposure(assets({ a: { region: { europe: "99.9" } } }))),
    ).toMatchObject({ dimension: "region", total: "99.9" });
  });

  it.each([
    ["a format other than 1", { exposure_format: 2, assets: {} }, "format"],
    ["a document that is not an object", [], "format"],
    ["assets that is not an object", { exposure_format: 1, assets: [] }, "format"],
    ["an extra top-level key", { exposure_format: 1, assets: {}, notes: "x" }, "top_level_key"],
    ["an asset id with a control character", assets({ "a\nb": {} }), "asset_id"],
    ["an empty asset id", assets({ "": {} }), "asset_id"],
    ["an asset id too long", assets({ [`a${"b".repeat(128)}`]: {} }), "asset_id"],
    [
      "__proto__ as an asset id",
      JSON.parse('{"exposure_format":1,"assets":{"__proto__":{}}}'),
      "asset_id",
    ],
    ["an asset that is not an object", assets({ a: "x" }), "asset"],
    ["an unknown dimension", assets({ a: { sector: { x: "100" } } }), "dimension"],
    ["an empty dimension", assets({ a: { currency: {} } }), "empty"],
    ["a dimension that is not an object", assets({ a: { currency: "USD" } }), "empty"],
    ["a currency in lower case", assets({ a: { currency: { usd: "100" } } }), "key"],
    ["a currency of four letters", assets({ a: { currency: { USDX: "100" } } }), "key"],
    ["a region in upper case", assets({ a: { region: { Europe: "100" } } }), "key"],
    [
      "a region of 41 characters",
      assets({ a: { region: { [`a${"b".repeat(40)}`]: "100" } } }),
      "key",
    ],
    ["a percent that is a number", assets({ a: { currency: { USD: 100 } } }), "percent"],
    ["a percent that is not decimal", assets({ a: { currency: { USD: "1e2" } } }), "percent"],
    ["a negative percent", assets({ a: { currency: { USD: "120", EUR: "-20" } } }), "negative"],
  ])("refuses %s", (_name, document, reason) => {
    expect(reasonOf(() => validateExposure(document))?.reason).toBe(reason);
  });

  it("accepts 200 assets and refuses 201", () => {
    const many = (n: number) =>
      Object.fromEntries(
        Array.from({ length: n }, (_, i) => [`a${i}`, { currency: { EUR: "100" } }]),
      );
    expect(Object.keys(validateExposure(assets(many(MAX_EXPOSURE_ASSETS))))).toHaveLength(200);
    expect(reasonOf(() => validateExposure(assets(many(MAX_EXPOSURE_ASSETS + 1))))).toEqual({
      reason: "too_many_assets",
      max: 200,
    });
  });
});

describe("parseExposureText, exposureOrNone and exposureText", () => {
  const text = JSON.stringify(assets(good2));

  it("reads a valid text, and writes it back canonically", () => {
    expect(parseExposureText(text)).toEqual(good2);
    expect(exposureText(good2)).toBe(`${text}\n`);
    expect(() => exposureText(good)).toThrow(expect.objectContaining({ code: "invalid_exposure" }));
  });

  it.each([
    ["not JSON", "{", "json"],
    ["a key repeated", '{"exposure_format":1,"assets":{},"assets":{}}', "repeated_key"],
    [
      "a currency repeated inside a split",
      '{"exposure_format":1,"assets":{"a":{"currency":{"USD":"100","USD":"100"}}}}',
      "repeated_key",
    ],
    ["too many bytes", JSON.stringify(assets({})) + " ".repeat(MAX_EXPOSURE_BYTES), "too_large"],
  ])("refuses a text that is %s", (_name, bad, reason) => {
    expect(reasonOf(() => parseExposureText(bad))?.reason).toBe(reason);
  });

  it("counts bytes, not characters", () => {
    expect(
      reasonOf(() =>
        parseExposureText(`${JSON.stringify(assets({}))}${"é".repeat(MAX_EXPOSURE_BYTES / 2)}`),
      )?.reason,
    ).toBe("too_large");
  });

  it("is no data, never a guess, when the object is missing, unreadable or invalid", () => {
    expect(exposureOrNone(text)).toEqual(good2);
    expect(exposureOrNone(undefined)).toBeUndefined();
    expect(exposureOrNone("{")).toBeUndefined();
    expect(exposureOrNone(JSON.stringify(assets(good)))).toBeUndefined();
  });
});
