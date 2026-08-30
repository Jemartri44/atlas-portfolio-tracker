// atlas account add|update|list · atlas asset add|update|list · atlas settings set|show

import {
  accounts,
  assets,
  loadAndProject,
  mergeSettings,
  type Settings,
  settingsAt,
  todayInMadrid,
} from "@atlas/domain";
import {
  assertKnownFlags,
  booleanFlag,
  type Flags,
  requireFlag,
  stringFlag,
  UsageError,
} from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { table } from "../output/table.js";
import { confirmAndRecord, fieldOf, render } from "./shared.js";

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
    const { state } = await loadAndProject(ctx.deps);
    const rows = accounts(state);
    render(
      ctx,
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
    const { state } = await loadAndProject(ctx.deps);
    const rows = assets(state);
    const withHistory = booleanFlag(flags, "history");
    render(
      ctx,
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

const parseAssignments = (raw: string, flag: string): Record<string, string> => {
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

export const settingsCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const [, action] = positionals;
  if (action === "show") {
    assertKnownFlags(flags, ["at", ...GLOBAL_FLAGS]);
    const { state } = await loadAndProject(ctx.deps);
    const at = stringFlag(flags, "at") ?? todayInMadrid(ctx.deps.clock);
    const resolution = settingsAt(state, at);
    render(
      ctx,
      resolution,
      `Configuración vigente el ${at} (origen: ${resolution.origin}):\n${JSON.stringify(resolution.settings, null, 2)}`,
    );
    return 0;
  }
  if (action === "set") {
    assertKnownFlags(flags, [
      "fiscal-date-rule",
      "wash-sale-window-days",
      ...SETTINGS_DECIMALS,
      ...SETTINGS_INTEGERS,
      ...GLOBAL_FLAGS,
    ]);
    const { state } = await loadAndProject(ctx.deps);
    const current = settingsAt(state, todayInMadrid(ctx.deps.clock)).settings;
    const patch: Record<string, unknown> = {};
    const rules = stringFlag(flags, "fiscal-date-rule");
    if (rules !== undefined) {
      patch.fiscal_date_rule = {
        ...current.fiscal_date_rule,
        ...parseAssignments(rules, "fiscal-date-rule"),
      };
    }
    const windows = stringFlag(flags, "wash-sale-window-days");
    if (windows !== undefined) {
      const parsed = Object.fromEntries(
        Object.entries(parseAssignments(windows, "wash-sale-window-days")).map(([key, value]) => [
          key,
          Number(value),
        ]),
      );
      patch.wash_sale_window_days = { ...current.wash_sale_window_days, ...parsed };
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
