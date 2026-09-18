// atlas ca split|reverse-split|merger|spin-off|fund-merger|share-class-change|fund-liquidation|delisting|raw
//
// The wizards map **flags to parameters**; composing the `effects[]` — and, in
// particular, working out the fractional shares of a reverse split — is the
// domain's job since feature 007 (`corporateActionDraft`, Q4). What is left
// here is what an interface is for: reading the flags, showing the event and the
// before/after tables, and recording on confirmation.

import { readFile } from "node:fs/promises";
import {
  type CashSettlement,
  CORPORATE_ACTION_KINDS,
  type CorporateActionDraft,
  type CorporateActionKind,
  type CorporateActionParams,
  corporateActionDraft,
  DomainError,
  type Draft,
  type Effect,
  type EventPreview,
  type LedgerEvent,
  type LedgerState,
  loadAndProject,
  previewEvent,
  recordEvent,
} from "@atlas/domain";
import {
  assertKnownFlags,
  booleanFlag,
  type Flags,
  requireFlag,
  stringFlag,
  UsageError,
} from "../args.js";
import { type Context, describeWarnings, GLOBAL_FLAGS, summarize } from "../context.js";
import { previewData, renderPreview } from "../output/preview.js";
import { keyValue } from "../output/table.js";
import { parseAssignments } from "./catalogue.js";
import { confirm } from "./shared.js";

// `--neutrality-regime` / `--no-neutrality-regime` are common to every kind
// rather than listed per kind: the field is on the event, not on the `kind`,
// and stating it on a split is harmless while forgetting it on a foreign merger
// is not (ADR-0021). Silence stays silence: absent means "not recorded", never
// "does not apply".
const COMMON_FLAGS = [
  "asset",
  "effective-date",
  "source-document",
  "notes",
  "neutrality-regime",
  "no-neutrality-regime",
];
const CASH_FLAGS = [
  "cash-per-share",
  "currency",
  "fx-rate",
  "fx-rate-date",
  "fees",
  "withholdings",
];

interface Wizard {
  kind: CorporateActionKind;
  flags: readonly string[];
  /** Extra parameters this kind reads from its flags. */
  params: (flags: Flags) => Promise<Partial<CorporateActionParams>>;
}

/**
 * Per-account amounts of a forced sale from `--fees acc=x,…` and
 * `--withholdings acc=y,…`; the domain refuses one naming an account that is
 * not selling, so neither can be swallowed in silence.
 */
const perAccountOf = (flags: Flags, flag: string): Record<string, string> | undefined => {
  const raw = stringFlag(flags, flag);
  return raw === undefined ? undefined : parseAssignments(raw, flag);
};

/** Both maps of a settlement, ready to spread into the params. */
const amountsOf = (flags: Flags): Partial<CorporateActionParams> => {
  const fees = perAccountOf(flags, "fees");
  const withholdings = perAccountOf(flags, "withholdings");
  return {
    ...(fees === undefined ? {} : { fees }),
    ...(withholdings === undefined ? {} : { withholdings }),
  };
};

/**
 * Whether the operation takes the neutrality regime. Three states, not two:
 * said yes, said no, and **not said**, which is what every corporate action
 * recorded before ADR-0021 carries. The two flags are exclusive.
 */
const neutralityOf = (flags: Flags): Partial<CorporateActionParams> => {
  const yes = booleanFlag(flags, "neutrality-regime");
  const no = booleanFlag(flags, "no-neutrality-regime");
  if (yes && no) {
    throw new UsageError("--neutrality-regime y --no-neutrality-regime son excluyentes");
  }
  if (!yes && !no) {
    return {};
  }
  return { neutrality_regime: yes };
};

/** The cash settlement of the leftovers, when `--cash-per-share` is given. */
const cashOf = (flags: Flags, priceFlag: string): CashSettlement | undefined =>
  stringFlag(flags, priceFlag) === undefined
    ? undefined
    : {
        unit_price: requireFlag(flags, priceFlag),
        currency: requireFlag(flags, "currency"),
        fx_rate: requireFlag(flags, "fx-rate"),
        fx_rate_date: requireFlag(flags, "fx-rate-date"),
      };

const settled = async (flags: Flags): Promise<Partial<CorporateActionParams>> => {
  const cash = cashOf(flags, "cash-per-share");
  return {
    ratio: requireFlag(flags, "ratio"),
    ...(cash === undefined ? {} : { cash }),
    ...amountsOf(flags),
  };
};

const converted = async (flags: Flags): Promise<Partial<CorporateActionParams>> => ({
  to_asset_id: requireFlag(flags, "to-asset"),
  ratio: requireFlag(flags, "ratio"),
});

const WIZARDS: Record<string, Wizard> = {
  split: {
    kind: "split",
    flags: ["ratio"],
    params: async (flags) => ({ ratio: requireFlag(flags, "ratio") }),
  },
  "reverse-split": { kind: "reverse_split", flags: ["ratio", ...CASH_FLAGS], params: settled },
  merger: {
    kind: "merger",
    flags: ["to-asset", "ratio", ...CASH_FLAGS],
    params: async (flags) => ({
      ...(await settled(flags)),
      to_asset_id: requireFlag(flags, "to-asset"),
    }),
  },
  "spin-off": {
    kind: "spin_off",
    flags: ["to-asset", "ratio", "cost-share", ...CASH_FLAGS],
    params: async (flags) => ({
      ...(await settled(flags)),
      to_asset_id: requireFlag(flags, "to-asset"),
      cost_share: requireFlag(flags, "cost-share"),
    }),
  },
  "fund-merger": { kind: "fund_merger", flags: ["to-asset", "ratio"], params: converted },
  "share-class-change": {
    kind: "share_class_change",
    flags: ["to-asset", "ratio"],
    params: converted,
  },
  "fund-liquidation": {
    kind: "fund_liquidation",
    flags: ["unit-price", "currency", "fx-rate", "fx-rate-date", "fees", "withholdings"],
    params: async (flags) => ({
      cash: cashOf(flags, "unit-price") as CashSettlement,
      ...amountsOf(flags),
    }),
  },
  delisting: { kind: "delisting", flags: [], params: async () => ({}) },
  raw: {
    kind: "issuer_restructuring",
    flags: ["kind", "effects-json"],
    params: async (flags) => ({ effects: await effectsJson(flags) }),
  },
};

const effectsJson = async (flags: Flags): Promise<Effect[]> => {
  const source = requireFlag(flags, "effects-json");
  const inline = /^[[{]/.test(source.trimStart());
  const text = inline
    ? source
    : await readFile(source, "utf8").catch(() => {
        throw new UsageError(`--effects-json: no se puede leer el fichero ${source}`);
      });
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new UsageError("--effects-json no contiene JSON válido");
  }
  if (!Array.isArray(parsed)) {
    throw new UsageError("--effects-json debe ser un array de efectos");
  }
  return parsed as Effect[];
};

const kindOf = (name: string, flags: Flags): CorporateActionKind => {
  const wizard = WIZARDS[name] as Wizard;
  if (name !== "raw") {
    return wizard.kind;
  }
  const kind = requireFlag(flags, "kind");
  if (!(CORPORATE_ACTION_KINDS as readonly string[]).includes(kind)) {
    throw new UsageError(
      `--kind desconocido: ${kind} (admitidos: ${CORPORATE_ACTION_KINDS.join(", ")})`,
    );
  }
  return kind as CorporateActionKind;
};

const affectedAssets = (asset: string, effects: readonly Effect[]): string[] => [
  ...new Set([
    asset,
    ...effects.flatMap((effect) => [
      effect.asset_id ?? asset,
      ...("to_asset_id" in effect ? [effect.to_asset_id] : []),
    ]),
  ]),
];

const adviseAfter = (ctx: Context, params: CorporateActionParams, preview: EventPreview): void => {
  ctx.io.out(
    `Recuerda copiar el documento fuente (${params.source_document}) a documents/ a mano: la CLI solo guarda la referencia.`,
  );
  if (params.kind === "delisting") {
    ctx.io.out(
      `Marcar el activo como inactivo es aparte: atlas asset update ${params.asset_id} --inactive`,
    );
  }
  const heldBefore = preview.before.positions.some((p) => p.asset_id === params.asset_id);
  const heldAfter = preview.after.positions.some((p) => p.asset_id === params.asset_id);
  if (heldBefore && !heldAfter && params.kind !== "delisting") {
    ctx.io.out(
      `El activo ${params.asset_id} queda sin posición; si ya no existe, márcalo con atlas asset update ${params.asset_id} --inactive`,
    );
  }
};

/** The asset the destination of a conversion points at, to check it exists before composing. */
const requireDestination = (state: LedgerState, params: Partial<CorporateActionParams>): void => {
  const to = params.to_asset_id;
  if (to !== undefined && !state.assets.has(to)) {
    throw new UsageError(
      `el activo destino ${to} no existe: dalo de alta antes con atlas asset add --id ${to} …`,
    );
  }
};

/**
 * Composes through the domain, and turns the one rejection that is really about
 * a **flag** back into a usage error: naming an account in `--fees` or in
 * `--withholdings` that takes no part in the sale is a typo on the command
 * line, not a ledger problem, and it has exited 64 since the wizards were
 * written.
 */
const compose = (
  state: LedgerState,
  events: readonly LedgerEvent[],
  params: CorporateActionParams,
): CorporateActionDraft => {
  try {
    return corporateActionDraft(state, events, params);
  } catch (error) {
    if (error instanceof DomainError && error.code === "fee_account_not_selling") {
      const flag = error.details.field === "withholding" ? "withholdings" : "fees";
      throw new UsageError(
        `--${flag}: la cuenta ${String(error.details.account_id)} no participa en la venta de picos`,
      );
    }
    throw error;
  }
};

export const corporateActionCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const name = positionals[1] ?? "";
  const wizard = WIZARDS[name];
  if (wizard === undefined) {
    throw new UsageError(
      `uso: atlas ca ${Object.keys(WIZARDS).join("|")} --asset … --effective-date … --source-document …`,
    );
  }
  assertKnownFlags(flags, [...COMMON_FLAGS, ...wizard.flags, ...GLOBAL_FLAGS]);
  const notes = stringFlag(flags, "notes");
  const { state, events } = await loadAndProject(ctx.deps);
  const asset = requireFlag(flags, "asset");
  if (!state.assets.has(asset)) {
    throw new UsageError(
      `el activo afectado ${asset} no existe: dalo de alta antes con atlas asset add --id ${asset} …`,
    );
  }
  const extra = await wizard.params(flags);
  requireDestination(state, extra);
  const params: CorporateActionParams = {
    kind: kindOf(name, flags),
    asset_id: asset,
    effective_date: requireFlag(flags, "effective-date"),
    source_document: requireFlag(flags, "source-document"),
    ...neutralityOf(flags),
    ...(notes === undefined ? {} : { notes }),
    ...extra,
  };
  const composed = compose(state, events, params);
  if (composed.no_fractions) {
    ctx.io.out("Aviso: ninguna cuenta queda con picos; no se genera forced_sale.");
  }
  const draft = composed.draft as unknown as Record<string, unknown>;
  const preview = await previewEvent(ctx.deps, draft as unknown as Draft, {
    assets: affectedAssets(asset, composed.draft.effects),
  });
  if (ctx.json) {
    ctx.io.out(JSON.stringify(previewData(preview), null, 2));
  } else {
    ctx.io.out("Evento a registrar:");
    ctx.io.out(keyValue(draft));
    ctx.io.out(renderPreview(preview));
  }
  adviseAfter(ctx, params, preview);
  if (!(await confirm(ctx, "¿Registrar? [s/N] "))) {
    ctx.io.out("Cancelado.");
    return 0;
  }
  const result = await recordEvent(ctx.deps, draft as never, {
    confirmDuplicate: ctx.confirmDuplicate,
  });
  ctx.io.out(`Registrado ${summarize(result.event)}.`);
  for (const line of describeWarnings(result.warnings)) {
    ctx.io.out(line);
  }
  return 0;
};
