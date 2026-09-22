// atlas account add|update|list · atlas asset add|update|list · atlas settings set|show

import {
  ASSET_TYPES,
  accounts,
  assets,
  type LedgerEvent,
  type LedgerState,
  loadAndProject,
  type Money,
  mergeSettings,
  movedFiscalYears,
  movedTaxYears,
  type Settings,
  settingsAt,
  silencedWarnings,
  todayInMadrid,
  yearOf,
} from "@atlas/domain";
import {
  assertKnownFlags,
  booleanFlag,
  type Flags,
  requireFlag,
  stringFlag,
  UsageError,
} from "../args.js";
import { type Context, describeWarnings, GLOBAL_FLAGS } from "../context.js";
import { table } from "../output/table.js";
import { confirm, confirmAndRecord, fieldOf, loadForQuery, renderQuery } from "./shared.js";

const ACCOUNT_FLAGS = ["id", "name", "platform", "book", "base-currency", "country", "inactive"];
const ASSET_FLAGS = [
  "id",
  "type",
  "book",
  "name",
  "currency",
  "asset-class",
  "isin",
  "ticker",
  "ter",
  "reference-etf",
  "market",
  "issuer-country",
  "transferable",
  "not-transferable",
  "inactive",
];

const catalogueDraft = (
  type: "account_created" | "account_updated" | "asset_created" | "asset_updated",
  flags: Flags,
  current: Record<string, unknown>,
): Record<string, unknown> => {
  const isAccount = type.startsWith("account");
  const allowed = isAccount ? ACCOUNT_FLAGS : ASSET_FLAGS;
  assertKnownFlags(flags, [...allowed, ...GLOBAL_FLAGS]);
  const draft: Record<string, unknown> = { ...current, type };
  for (const flag of allowed) {
    if (flag === "inactive" || flag === "transferable" || flag === "not-transferable") {
      continue;
    }
    const value = stringFlag(flags, flag);
    if (value !== undefined) {
      draft[flag === "id" ? (isAccount ? "account_id" : "asset_id") : fieldOf(flag)] = value;
    }
  }
  if (booleanFlag(flags, "inactive")) {
    draft.active = false;
  } else if (draft.active === undefined) {
    draft.active = true;
  }
  if (!isAccount) {
    if (booleanFlag(flags, "transferable") && booleanFlag(flags, "not-transferable")) {
      throw new UsageError("--transferable y --not-transferable son excluyentes");
    }
    if (booleanFlag(flags, "transferable")) {
      draft.transferable = true;
    } else if (booleanFlag(flags, "not-transferable")) {
      draft.transferable = false;
    }
  }
  return draft;
};

const stripProjection = (record: Record<string, unknown>): Record<string, unknown> => {
  const { history: _history, identifier_history: _identifiers, ...fields } = record;
  return fields;
};

export const accountCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const [, action, id] = positionals;
  if (action === "add") {
    await confirmAndRecord(ctx, catalogueDraft("account_created", flags, {}));
    return 0;
  }
  if (action === "update") {
    if (id === undefined) {
      throw new UsageError("uso: atlas account update <account_id> [--name …]");
    }
    const { state } = await loadAndProject(ctx.deps);
    const current = state.accounts.get(id);
    if (current === undefined) {
      throw new UsageError(`la cuenta ${id} no existe`);
    }
    await confirmAndRecord(
      ctx,
      catalogueDraft(
        "account_updated",
        flags,
        stripProjection(current as unknown as Record<string, unknown>),
      ),
    );
    return 0;
  }
  if (action === "list") {
    assertKnownFlags(flags, GLOBAL_FLAGS);
    const { state } = await loadForQuery(ctx);
    const rows = accounts(state);
    renderQuery(
      ctx,
      state,
      rows,
      table(
        ["cuenta", "nombre", "plataforma", "libro", "divisa", "país", "activa"],
        rows.map((a) => [
          a.account_id,
          a.name,
          a.platform,
          a.book,
          a.base_currency,
          a.country,
          a.active ? "sí" : "no",
        ]),
      ),
    );
    return 0;
  }
  throw new UsageError("uso: atlas account add|update|list");
};

export const assetCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const [, action, id] = positionals;
  if (action === "add") {
    await confirmAndRecord(ctx, catalogueDraft("asset_created", flags, {}));
    return 0;
  }
  if (action === "update") {
    if (id === undefined) {
      throw new UsageError("uso: atlas asset update <asset_id> [--name …]");
    }
    const { state } = await loadAndProject(ctx.deps);
    const current = state.assets.get(id);
    if (current === undefined) {
      throw new UsageError(`el activo ${id} no existe`);
    }
    await confirmAndRecord(
      ctx,
      catalogueDraft(
        "asset_updated",
        flags,
        stripProjection(current as unknown as Record<string, unknown>),
      ),
    );
    return 0;
  }
  if (action === "list") {
    assertKnownFlags(flags, ["history", ...GLOBAL_FLAGS]);
    const { state } = await loadForQuery(ctx);
    const rows = assets(state);
    const withHistory = booleanFlag(flags, "history");
    renderQuery(
      ctx,
      state,
      rows,
      table(
        [
          "activo",
          "tipo",
          "libro",
          "clase",
          "isin",
          "ticker",
          "divisa",
          "traspasable",
          "activo?",
          ...(withHistory ? ["identificadores anteriores"] : []),
        ],
        rows.map((a) => [
          a.asset_id,
          a.asset_type,
          a.book,
          a.asset_class ?? "",
          a.isin ?? "",
          a.ticker ?? "",
          a.currency,
          a.transferable ? "sí" : "no",
          a.active ? "sí" : "no",
          ...(withHistory
            ? [
                a.identifier_history
                  .map((h) => `${h.isin ?? "-"}/${h.ticker ?? "-"} hasta ${h.until_event_id}`)
                  .join("; "),
              ]
            : []),
        ]),
      ),
    );
    return 0;
  }
  throw new UsageError("uso: atlas asset add|update|list [--history]");
};

const SETTINGS_DECIMALS = [
  "deviation-threshold-pp",
  "satellite-min-weight-pct",
  "monthly-contribution-eur",
  "bucket-pct-of-contribution",
  "bucket-max-cumulative-contribution",
  "bucket-stop-loss-pct",
  "bucket-max-weight-pct",
  "model-720-threshold-eur",
  "model-720-increase-eur",
  "model-720-alert-threshold-eur",
  "model-721-threshold-eur",
  "model-721-increase-eur",
  "model-721-alert-threshold-eur",
  "savings-offset-limit-pct",
  // Copied verbatim, like the two below: the domain validates the form.
  "renta-season-start",
  "renta-season-end",
  "tax-residence",
  "notification-email",
];
const SETTINGS_INTEGERS = ["stale-price-days", "transfer-max-days", "loss-carryforward-years"];
/** Free-text settings: the benchmark is an `asset_id`, checked against the catalogue when queried. */
const SETTINGS_STRINGS = ["bucket-benchmark-asset"];
/**
 * Criterion #2b, in the three states the setting has: said yes, said no, and
 * **not said**, which is what every ledger written before ADR-0014 carries and
 * which reads as the prudent side (a transfer in acquires homogeneous
 * securities, so it defers the loss).
 */
const SETTINGS_BOOLEANS = ["wash-sale-transfer-counts", "no-wash-sale-transfer-counts"];

export const parseAssignments = (raw: string, flag: string): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const [key, value] = pair.split("=");
    if (key === undefined || value === undefined || key.length === 0 || value.length === 0) {
      throw new UsageError(`--${flag} espera pares tipo=valor separados por comas`);
    }
    result[key.trim()] = value.trim();
  }
  return result;
};

/**
 * Assignments keyed by asset type. The ledger tolerates a map that does not
 * mention a type (ADR-0018), which is exactly why a typo here would go
 * unnoticed: `--fiscal-date-rule stcok=trade_date` would silently leave every
 * stock on its default. The ledger stays tolerant; what the user types does not.
 */
const assetTypeAssignments = (raw: string, flag: string): Record<string, string> => {
  const parsed = parseAssignments(raw, flag);
  for (const key of Object.keys(parsed)) {
    if (!(ASSET_TYPES as readonly string[]).includes(key)) {
      throw new UsageError(`--${flag}: ${key} no es un tipo de activo (${ASSET_TYPES.join(", ")})`);
    }
  }
  return parsed;
};

/**
 * Raising a threshold must never silence a live warning behind the user's back
 * (constitution IV). The comparison lives in the domain (`silencedWarnings`),
 * so the CLI and the web cannot disagree about what gets muted.
 */
const confirmSilencedWarnings = async (
  ctx: Context,
  state: LedgerState,
  current: Settings,
  next: Settings,
): Promise<boolean> => {
  const date = todayInMadrid(ctx.deps.clock);
  const { silenced, evaluated, missing_prices } = silencedWarnings(state, date, current, next);
  if (!evaluated) {
    ctx.io.out(
      `No se han podido evaluar los avisos (faltan precios de ${missing_prices.join(", ")}); se continúa.`,
    );
    return true;
  }
  if (silenced.length === 0) {
    return true;
  }
  ctx.io.out("Este cambio silencia avisos activos:");
  for (const line of describeWarnings(silenced)) {
    ctx.io.out(line);
  }
  return confirm(ctx, "¿Continuar? [s/N] ");
};

/**
 * The expensive warning of a settings change (prompt 005 §3.5 bis): reading the
 * same ledger with the new rules can move realized gains from one tax year to
 * another, and a return already filed may stop matching. It informs and asks;
 * it never blocks.
 */
const confirmMovedYears = async (
  ctx: Context,
  events: readonly LedgerEvent[],
  current: Settings,
  next: Settings,
): Promise<boolean> => {
  const year = yearOf(todayInMadrid(ctx.deps.clock));
  const moved = movedFiscalYears(events, current, next, year);
  // The base too (feature 009, Q12): the window, the transfer criterion and the
  // income category move it without moving a single realized gain.
  const bases = movedTaxYears(events, current, next, year);
  if (moved.length === 0 && bases.length === 0) {
    return true;
  }
  const rows = (impacts: readonly { year: number; before: Money; after: Money }[]) =>
    table(
      ["ejercicio", "antes EUR", "después EUR"],
      impacts.map((impact) => [
        String(impact.year),
        impact.before.amount.toString(),
        impact.after.amount.toString(),
      ]),
    );
  if (moved.length > 0) {
    ctx.io.out("Este cambio mueve las ganancias realizadas de ejercicios anteriores:");
    ctx.io.out(rows(moved));
  }
  if (bases.length > 0) {
    ctx.io.out(
      "Este cambio mueve la base del ahorro de ejercicios anteriores (`atlas tax <año>`):",
    );
    ctx.io.out(
      table(
        ["ejercicio", "base antes EUR", "base después EUR", "pendiente antes", "pendiente después"],
        bases.map((impact) => [
          String(impact.year),
          impact.before.amount.toString(),
          impact.after.amount.toString(),
          impact.pending_before.amount.toString(),
          impact.pending_after.amount.toString(),
        ]),
      ),
    );
    // A year can keep its base and leave a different balance pending, which is
    // what moves the years after it.
    if (bases.every((impact) => impact.before.eq(impact.after))) {
      ctx.io.out(
        "La base no cambia en ninguno, pero sí lo que dejan pendiente de compensar: eso mueve los ejercicios siguientes.",
      );
    }
  }
  ctx.io.out("Puede afectar a una declaración ya presentada.");
  return confirm(ctx, "¿Continuar? [s/N] ");
};

export const settingsCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const [, action] = positionals;
  if (action === "show") {
    assertKnownFlags(flags, ["at", ...GLOBAL_FLAGS]);
    const { state } = await loadForQuery(ctx);
    const at = stringFlag(flags, "at") ?? todayInMadrid(ctx.deps.clock);
    const resolution = settingsAt(state, at);
    renderQuery(
      ctx,
      state,
      resolution,
      `Configuración vigente el ${at} (origen: ${resolution.origin}):\n${JSON.stringify(resolution.settings, null, 2)}`,
    );
    return 0;
  }
  if (action === "set") {
    if (flags.has("wash-sale-window-days")) {
      throw new UsageError(
        "la ventana de recompra se cuenta de fecha a fecha: usa --wash-sale-window fund=1y,stock=2m (ADR-0014)",
      );
    }
    assertKnownFlags(flags, [
      "fiscal-date-rule",
      "wash-sale-window",
      "income-category",
      "treaty-withholding-pct",
      "target-weights",
      ...SETTINGS_DECIMALS,
      ...SETTINGS_INTEGERS,
      ...SETTINGS_STRINGS,
      ...SETTINGS_BOOLEANS,
      ...GLOBAL_FLAGS,
    ]);
    const { state, events } = await loadForQuery(ctx);
    const current = settingsAt(state, todayInMadrid(ctx.deps.clock)).settings;
    const patch: Record<string, unknown> = {};
    const rules = stringFlag(flags, "fiscal-date-rule");
    if (rules !== undefined) {
      patch.fiscal_date_rule = {
        ...current.fiscal_date_rule,
        ...assetTypeAssignments(rules, "fiscal-date-rule"),
      };
    }
    const windows = stringFlag(flags, "wash-sale-window");
    if (windows !== undefined) {
      patch.wash_sale_window = {
        ...current.wash_sale_window,
        ...assetTypeAssignments(windows, "wash-sale-window"),
      };
    }
    // Merged onto what is in force, like the other two per-asset-type maps: a
    // category is set for one type at a time and the rest keep theirs.
    const categories = stringFlag(flags, "income-category");
    if (categories !== undefined) {
      patch.income_category = {
        ...current.income_category,
        ...assetTypeAssignments(categories, "income-category"),
      };
    }
    // Merged too: a treaty rate is set one country at a time (feature 009, Q4).
    const treaties = stringFlag(flags, "treaty-withholding-pct");
    if (treaties !== undefined) {
      patch.treaty_withholding_pct = {
        ...current.treaty_withholding_pct,
        ...parseAssignments(treaties, "treaty-withholding-pct"),
      };
    }
    const weights = stringFlag(flags, "target-weights");
    if (weights !== undefined) {
      // Replaced whole, never merged: the weights must add up to 100 as a set.
      patch.target_weights = parseAssignments(weights, "target-weights");
    }
    for (const flag of SETTINGS_DECIMALS) {
      const value = stringFlag(flags, flag);
      if (value !== undefined) {
        patch[fieldOf(flag)] = value;
      }
    }
    for (const flag of SETTINGS_INTEGERS) {
      const value = stringFlag(flags, flag);
      if (value !== undefined) {
        patch[fieldOf(flag)] = Number(value);
      }
    }
    const benchmark = stringFlag(flags, "bucket-benchmark-asset");
    if (benchmark !== undefined) {
      patch.bucket_benchmark_asset_id = benchmark;
    }
    const counts = booleanFlag(flags, "wash-sale-transfer-counts");
    const doesNot = booleanFlag(flags, "no-wash-sale-transfer-counts");
    if (counts && doesNot) {
      throw new UsageError(
        "--wash-sale-transfer-counts y --no-wash-sale-transfer-counts son excluyentes",
      );
    }
    if (counts || doesNot) {
      patch.wash_sale_transfer_counts = counts;
    }
    const settings = mergeSettings(current, patch as Partial<Settings>);
    if (!(await confirmSilencedWarnings(ctx, state, current, settings))) {
      ctx.io.out("Cancelado.");
      return 0;
    }
    if (!(await confirmMovedYears(ctx, events, current, settings))) {
      ctx.io.out("Cancelado.");
      return 0;
    }
    await confirmAndRecord(ctx, { type: "settings_changed", settings });
    return 0;
  }
  throw new UsageError("uso: atlas settings set|show [--at YYYY-MM-DD]");
};

export const requireId = (positionals: string[], index: number, usage: string): string => {
  const id = positionals[index];
  if (id === undefined) {
    throw new UsageError(usage);
  }
  return id;
};

export { requireFlag };
