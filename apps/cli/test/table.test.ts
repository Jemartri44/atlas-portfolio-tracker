import { describe, expect, it } from "vitest";
import { keyValue, table } from "../src/output/table.js";

describe("table", () => {
  it("aligns columns and trims trailing spaces", () => {
    expect(
      table(
        ["a", "bb"],
        [
          ["1", "2"],
          ["333", ""],
        ],
      ),
    ).toBe("a    bb\n---  --\n1    2\n333");
  });

  it("renders key/value pairs, serialising non-strings", () => {
    expect(keyValue({ type: "buy", active: true, settings: { x: 1 } })).toContain(
      'settings  {"x":1}',
    );
  });
});
