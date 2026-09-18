// atlas account add|update|list · atlas asset add|update|list · atlas settings set|show

import {
  ASSET_TYPES,
  accounts,
  assets,
  coreWeights,
  type LedgerState,
  loadAndProject,
  mergeSettings,
  type Settings,
  settingsAt,
  todayInMadrid,
  type Warning,
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
  "model-720-alert-threshold-eur",
  "model-721-alert-threshold-eur",
  "tax-residence",
  "notification-email",
];
const SETTINGS_INTEGERS = ["stale-price-days", "transfer-max-days"];

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

/** Threshold warnings the settings raise on today's portfolio; empty when they cannot be evaluated. */
const activeWarnings = (
  state: LedgerState,
  date: string,
  settings: Settings,
): { warnings: Warning[]; evaluated: boolean; missing: string[] } => {
  const weights = coreWeights(state, date, settings);
  return {
    warnings: weights.warnings.filter(
      (warning) =>
        warning.code === "deviation_above_threshold" || warning.code === "satellite_below_minimum",
    ),
    evaluated: !weights.partial,
    missing: weights.missing_prices,
  };
};

/**
 * Raising a threshold must never silence a live warning behind the user's back
 * (constitution IV). The same ledger and date are evaluated with the settings
 * in force and with the new ones; whatever stops warning is listed.
 */
const confirmSilencedWarnings = async (
  ctx: Context,
  state: LedgerState,
  current: Settings,
  next: Settings,
): Promise<boolean> => {
  const date = todayInMadrid(ctx.deps.clock);
  const before = activeWarnings(state, date, current);
  const after = activeWarnings(state, date, next);
  if (!before.evaluated) {
    ctx.io.out(
      `No se han podido evaluar los avisos (faltan precios de ${before.missing.join(", ")}); se continúa.`,
    );
    return true;
  }
  const keyOf = (warning: Warning): string => `${warning.code}|${JSON.stringify(warning.details)}`;
  const kept = new Set(after.warnings.map(keyOf));
  const silenced = before.warnings.filter((warning) => !kept.has(keyOf(warning)));
  if (silenced.length === 0) {
    return true;
  }
  ctx.io.out("Este cambio silencia avisos activos:");
  for (const line of describeWarnings(silenced)) {
    ctx.io.out(line);
  }
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
      "target-weights",
      ...SETTINGS_DECIMALS,
      ...SETTINGS_INTEGERS,
      ...GLOBAL_FLAGS,
    ]);
    const { state } = await loadForQuery(ctx);
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
    const settings = mergeSettings(current, patch as Partial<Settings>);
    if (!(await confirmSilencedWarnings(ctx, state, current, settings))) {
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
