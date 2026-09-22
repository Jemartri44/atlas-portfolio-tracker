// @vitest-environment happy-dom
//
// No text of the interface names a document of the project or an identifier.
// Twenty-two texts cited "(ADR-00xx)", "constitución", "business-rules.md §…",
// "Lo usará la Fase 4", "append-only" or "El dominio rechaza…"; events were
// linked by their identifier, theses named by their key, platforms written as
// "myinvestor · ibkr", and the repurchase window typed as "2m, 1y o <n>d".

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ledgerEntries, projectLedger, type Warning } from "@atlas/domain";
import { describe, expect, it } from "vitest";
import { eventReferences } from "../src/format/events.js";
import { ERROR_MESSAGES } from "../src/format/messages/errors.js";
import { WARNING_MESSAGES } from "../src/format/messages/warnings.js";
import { nameIndex, namingOf } from "../src/format/names.js";
import { figuresOf } from "../src/format/privacy.js";
import Configuracion from "../src/routes/ajustes/configuracion.jsx";
import Verificacion from "../src/routes/ajustes/verificacion.jsx";
import Detail from "../src/routes/movimientos/detail.jsx";
import { detailView } from "../src/view-models/detail.js";
import { attentionItems, movementRow } from "../src/view-models/index.js";
import { accountOptions, openThesisOptions } from "../src/view-models/options.js";
import { goldenEvents } from "./helpers/golden.js";
import {
  choose,
  optionsOf,
  settle,
  show,
  text,
  ULID,
  withGoldenLedger,
} from "./helpers/render.jsx";

withGoldenLedger();

const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;

const attention = (
  warnings: Warning[],
  extra: Partial<Parameters<typeof attentionItems>[0]> = {},
) =>
  attentionItems({
    invalidCount: 0,
    privacy: false,
    warnings,
    findings: [],
    openOrders: [],
    openTransfers: [],
    ...extra,
  });

const events = goldenEvents();
const state = projectLedger(events, { collectErrors: true });
const entries = ledgerEntries(state, events);
const names = nameIndex(state);
const references = eventReferences(events);

const messageNames = {
  ast_world: "World Index Fund",
  acc_mi: "Fondos indexados",
  "tesis:th_alpha": "sobre Alpha Robotics (abierta el 01/09/2026)",
};
const render = (catalogue: typeof ERROR_MESSAGES, code: string, details: Record<string, unknown>) =>
  (catalogue[code] as (d: unknown, n: unknown, f: unknown) => string)(
    details,
    namingOf(messageNames),
    figuresOf(false),
  );

describe("the messages", () => {
  /**
   * Every template, fed with details shaped like the domain's: none may print
   * a document of the project, an identifier of an event, of the catalogue or
   * of the schema, a date in ISO or a figure with a decimal point.
   */
  it("never names a document, an identifier or an ISO date, in any template", () => {
    const detail = (key: string): unknown => {
      if (/date|window_end|window_start|filed_at/.test(key)) return "2027-01-31";
      if (key === "model") return "720";
      if (key === "category") return "capital_gain";
      if (key === "thesis_id") return "th_alpha";
      if (key === "theses") return ["th_alpha"];
      if (/^(asset_id|from_asset_id|to_asset_id|existing_asset_id)$/.test(key)) return "ast_world";
      // A public code the user typed and knows, not an identifier of the application.
      if (key === "isin") return "IE00BK5BQT80";
      if (key === "account_id") return "acc_mi";
      if (/_ids?$|^(existing|ids|id)$/.test(key)) return ["01ARYZ6S41TSV4RRFFQ6900001"];
      if (/^(assets|missing|extra|partial|accounts|affected)$/.test(key)) return ["ast_world"];
      if (key === "field") return "unit_price";
      if (key === "fields") return ["quantity_out", "amount_eur"];
      if (key === "type" || key === "offending_type") return "buy";
      if (key === "kind") return "reverse_split";
      if (key === "stage") return "cancelled";
      if (key === "asset_class") return "gold";
      if (key === "asset_type") return "fund";
      if (key === "window") return "2m";
      if (key === "key") return "acc_mi|ast_world";
      if (key === "reason") return "missing_prices";
      if (key === "offending_error") return "buy: amount is not a valid positive_decimal";
      if (/currency|left|right/.test(key)) return "USD";
      if (key === "parameter") return "ratio";
      if (/days|_count|theses$|operations|sample|found|supported|line|year/.test(key)) return "3";
      if (key === "archive_name") return "ledger-2027.jsonl";
      if (key === "from" || key === "to") return "fund";
      return "12.5";
    };
    const details = new Proxy({}, { get: (_target, key) => detail(String(key)) }) as Record<
      string,
      unknown
    >;
    // These exist to echo back what the file or the user wrote, so the raw
    // value is the point: a type the application does not know, a value it
    // could not read, an identifier the user typed, the evidence of an error.
    const echoes = new Set([
      "invalid_decimal",
      "invalid_currency",
      "invalid_fx_rate",
      "unsupported_event",
      "unknown_event_type",
      "duplicate_thesis",
      "ledger_has_invalid_events",
    ]);
    const offenders: string[] = [];
    for (const [catalogue, codes] of [
      [ERROR_MESSAGES, Object.keys(ERROR_MESSAGES)],
      [WARNING_MESSAGES, Object.keys(WARNING_MESSAGES)],
    ] as const) {
      for (const code of codes) {
        // A weekend is a date, not a number: its one detail says so.
        const text = render(
          catalogue,
          code,
          code === "fx_rate_date_weekend"
            ? { field: "fx_rate_date", value: "2027-01-30" }
            : details,
        );
        const forbidden = [
          /ADR-|constituci|business-rules|§|append-only|dominio|<n>d/,
          ULID,
          ISO_DATE,
          /\bast_|\bacc_|\bth_|unit_price|quantity_out|\bbuy\b/,
          // Spanish decimals: "12,5", never "12.5".
          /\d\.\d(?!\d{2})/,
        ].filter((pattern) => pattern.test(text));
        if (forbidden.length > 0 && !echoes.has(code)) {
          offenders.push(`${code}: ${text}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("explains an integrity finding in Spanish, without its code or its events", () => {
    const [item] = attention([], {
      findings: [
        {
          severity: "error",
          code: "negative_position",
          message: "acc|ast is -1",
          event_ids: ["01ARYZ6S41TSV4RRFFQ6900002"],
        },
      ],
      invalidCount: 1,
    });
    expect(item?.message).not.toMatch(/ADR|negative_position/);
  });
});

describe("the sources", () => {
  const source = `${join(dirname(fileURLToPath(import.meta.url)), "../src")}/`;
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const path = join(dir, entry);
      return statSync(path).isDirectory() ? files(path) : /\.tsx?$/.test(path) ? [path] : [];
    });

  /**
   * What reaches the screen is what is left once the comments go: the
   * comments of this project cite its documents on purpose, the interface must
   * not. Twenty-two texts did — "(ADR-0015)", "constitución III",
   * "business-rules.md §5.2", "Lo usará la Fase 4", "append-only", "El dominio
   * rechaza…", "2m, 1y o <n>d".
   */
  it("keeps the project's own vocabulary in the comments", () => {
    const offenders: string[] = [];
    for (const file of files(source)) {
      const code = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const pattern of [
        /ADR-\d/,
        /constituci[oó]n/i,
        /business-rules|data-schema|specification\.md|§/,
        /append-only/,
        /\bdominio\b/i,
        /<n>d|2m, 1y/,
        /P&L/,
        /Fase \d/,
      ]) {
        if (pattern.test(code)) {
          offenders.push(`${file.slice(source.length)}: ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("the lists and the detail", () => {
  it("names platforms and theses, never their keys", () => {
    const hints = accountOptions(state).map((option) => option.hint ?? "");
    expect(hints.join(" ")).toContain("Interactive Brokers");
    expect(hints.join(" ")).not.toMatch(/\bibkr\b|\bmyinvestor\b/);
    const theses = openThesisOptions(state, "2026-09-18");
    expect(theses.length).toBeGreaterThan(0);
    for (const option of theses) {
      expect(`${option.label} ${option.hint}`).not.toMatch(/th_/);
    }
  });

  it("links other events by what they are, never by their identifier", () => {
    const reversal = entries.find((entry) => entry.event.type === "reversal");
    const view = detailView(reversal as never, names, references);
    for (const link of view.links) {
      expect(link.text).not.toMatch(ULID);
      expect(link.text).toMatch(/ del \d{2}\/\d{2}\/\d{4}$/);
    }
    const row = movementRow(reversal as never, names, references);
    expect(row.subtitle).toMatch(/^anula .+ del \d{2}\/\d{2}\/\d{4}$/);
  });

  it("names a corporate action and a thesis in the list, not by their keys", () => {
    const corporate = entries.find((entry) => entry.event.type === "corporate_action");
    expect(movementRow(corporate as never, names).subtitle).not.toMatch(/_/);
    const linked = entries.find((entry) => entry.thesis_id !== undefined);
    expect(movementRow(linked as never, names).subtitle).not.toContain("th_");
    expect(movementRow(linked as never, names).subtitle).toContain("abierta el");
  });
});

describe("the screens", () => {
  it("names the origin of the configuration and chooses the window instead of typing a syntax", async () => {
    const host = await show("/ajustes/configuracion", Configuracion);
    const shown = text(host);
    expect(shown).not.toMatch(ULID);
    expect(shown).not.toMatch(/ADR-|constituci|<n>d|2m, 1y|ast_world/);
    expect(shown).toContain("la del cambio de configuración del 01/09/2026");
    expect(optionsOf(host, "wsw-fund")).toEqual([
      "Por defecto (1 año)",
      "2 meses",
      "1 año",
      "Un número de días",
    ]);
    choose(host, "wsw-fund", "days");
    await settle();
    expect(host.querySelector("#wsd-fund")).not.toBeNull();
  });

  it("links the events of the verification by their type and date", async () => {
    const host = await show("/ajustes/verificacion", Verificacion);
    const links = [...host.querySelectorAll("a")].map((link) => link.textContent ?? "");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link).not.toMatch(ULID);
    }
    expect(links).toContain("Venta del 04/01/2027");
  });

  it("keeps the identifiers of a movement in its technical block only", async () => {
    const host = await show(`/movimientos/01N94FZV80TNBBFGNVWT1XZ01Y`, Detail, "/movimientos/:id");
    const cards = [...host.querySelectorAll("section.card")];
    const links = cards.find((card) => card.textContent?.includes("Movimientos enlazados"));
    expect(text(links)).toContain("Dividendo del 15/04/2027");
    expect(text(links)).not.toMatch(ULID);
  });
});
