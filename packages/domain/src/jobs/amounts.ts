// The switch of the amounts of the mail (ADR-0028, row 18; feature 016, §8.2
// M2): a `String` of SSM that Terraform writes, `off` by default. **Only
// `on` turns it on**: absent, empty, `ON`, `true`, `1`, with spaces or
// anything else leaves it off — a value that is not understood never
// enables anything. Read by one module only, the composition of the mail
// task, which hands the redaction the value already understood.

export type AmountsSwitch = "on" | "off";

export const amountsSwitch = (value: string | undefined): AmountsSwitch =>
  value === "on" ? "on" : "off";
