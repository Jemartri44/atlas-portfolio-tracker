// atlas ca split|reverse-split|merger|spin-off|fund-merger|share-class-change|fund-liquidation|delisting|raw
// Wizards build effects[] from simple flags, show the event and the before/after
// tables (projecting the real ledger with the candidate), and record on confirmation.

import { readFile } from "node:fs/promises";
import {
  CORPORATE_ACTION_KINDS,
  type CorporateActionKind,
  Decimal,
  type Effect,
  type ForcedSaleEntry,
  type LedgerState,
  loadAndProject,
  type PhysicalPosition,
  physicalPositions,
  Quantity,
  recordEvent,
} from "@atlas/domain";
import { assertKnownFlags, type Flags, requireFlag, stringFlag, UsageError } from "../args.js";
import { type Context, describeWarnings, GLOBAL_FLAGS, summarize } from "../context.js";
import { previewData, renderPreview } from "../output/preview.js";
import { keyValue } from "../output/table.js";
import { parseAssignments } from "./catalogue.js";
import { type CandidatePreview, confirm, previewCandidate } from "./shared.js";

const COMMON_FLAGS = ["asset", "effective-date", "source-document", "notes"];
const CASH_FLAGS = ["cash-per-share", "currency", "fx-rate", "fx-rate-date", "fees"];

interface Base {
  asset: string;
  effective_date: string;
  source_document: string;
  notes?: string;
}

interface Wizard {
  kind: CorporateActionKind;
  flags: readonly string[];
  /** Builds the effects; may project the ledger to compute fractional shares. */
  build: (ctx: Context, flags: Flags, base: Base, state: LedgerState) => Promise<Effect[]>;
}

const requireAssetInCatalogue = (state: LedgerState, id: string, role: string): void => {
  if (!state.assets.has(id)) {
    throw new UsageError(
      `el activo ${role} ${id} no existe: dalo de alta antes con atlas asset add --id ${id} …`,
    );
  }
};

const ratioOf = (flags: Flags): string => requireFlag(flags, "ratio");

const draftOf = (
  kind: CorporateActionKind,
  base: Base,
  effects: Effect[],
): Record<string, unknown> => ({
  type: "corporate_action",
  kind,
  asset_id: base.asset,
  effective_date: base.effective_date,
  source_document: base.source_document,
  effects,
  ...(base.notes === undefined ? {} : { notes: base.notes }),
});

const floorOf = (quantity: Quantity): Decimal =>
  Decimal.parse(quantity.toString().split(".")[0] as string);

/** Fees per account from `--fees acc=x,…`; every account must take part in the sale. */
const feesOf = (flags: Flags, accounts: readonly string[]): Record<string, string> => {
  const raw = stringFlag(flags, "fees");
  if (raw === undefined) {
    return {};
  }
  const fees = parseAssignments(raw, "fees");
  for (const account of Object.keys(fees)) {
    if (!accounts.includes(account)) {
      throw new UsageError(`--fees: la cuenta ${account} no participa en la venta de picos`);
    }
  }
  return fees;
};

const priceFlags = (
  flags: Flags,
): Omit<Extract<Effect, { op: "forced_sale" }>, "op" | "per_account" | "asset_id"> => ({
  unit_price: requireFlag(flags, "cash-per-share"),
  currency: requireFlag(flags, "currency"),
  fx_rate: requireFlag(flags, "fx-rate"),
  fx_rate_date: requireFlag(flags, "fx-rate-date"),
});

/**
 * Fractional shares per account of `asset` after `main` is applied: projects the
 * ledger with the main effects only and takes `position − ⌊position⌋`.
 */
const fractionalSale = async (
  ctx: Context,
  flags: Flags,
  base: Base,
  kind: CorporateActionKind,
  main: Effect[],
  asset: string,
): Promise<Effect[]> => {
  if (stringFlag(flags, "cash-per-share") === undefined) {
    return main;
  }
  const preview = await previewCandidate(ctx, draftOf(kind, base, main), [asset]);
  const entries: ForcedSaleEntry[] = preview.after.positions
    .filter((p) => p.asset_id === asset)
    .map((p) => ({
      account_id: p.account_id,
      fraction: p.quantity.sub(Quantity.of(floorOf(p.quantity))),
    }))
    .filter((p) => p.fraction.isPositive())
    .map((p) => ({ account_id: p.account_id, quantity: p.fraction.toString() }));
  const fees = feesOf(
    flags,
    entries.map((entry) => entry.account_id),
  );
  if (entries.length === 0) {
    ctx.io.out("Aviso: ninguna cuenta queda con picos; no se genera forced_sale.");
    return main;
  }
  return [
    ...main,
    {
      op: "forced_sale",
      ...(asset === base.asset ? {} : { asset_id: asset }),
      per_account: entries.map((entry) =>
        fees[entry.account_id] === undefined
          ? entry
          : { ...entry, fee: fees[entry.account_id] as string },
      ),
      ...priceFlags(flags),
    },
  ];
};

const holdersOf = (state: LedgerState, asset: string): PhysicalPosition[] =>
  physicalPositions(state).filter((p) => p.asset_id === asset);

const WIZARDS: Record<string, Wizard> = {
  split: {
    kind: "split",
    flags: ["ratio"],
    build: async (_ctx, flags) => [{ op: "scale", ratio: ratioOf(flags) }],
  },
  "reverse-split": {
    kind: "reverse_split",
    flags: ["ratio", ...CASH_FLAGS],
    build: (ctx, flags, base) =>
      fractionalSale(
        ctx,
        flags,
        base,
        "reverse_split",
        [{ op: "scale", ratio: ratioOf(flags) }],
        base.asset,
      ),
  },
  merger: {
    kind: "merger",
    flags: ["to-asset", "ratio", ...CASH_FLAGS],
    build: (ctx, flags, base, state) => {
      const to = requireFlag(flags, "to-asset");
      requireAssetInCatalogue(state, to, "destino");
      return fractionalSale(
        ctx,
        flags,
        base,
        "merger",
        [{ op: "convert", to_asset_id: to, ratio: ratioOf(flags) }],
        to,
      );
    },
  },
  "spin-off": {
    kind: "spin_off",
    flags: ["to-asset", "ratio", "cost-share", ...CASH_FLAGS],
    build: (ctx, flags, base, state) => {
      const to = requireFlag(flags, "to-asset");
      requireAssetInCatalogue(state, to, "destino");
      return fractionalSale(
        ctx,
        flags,
        base,
        "spin_off",
        [
          {
            op: "carve_out",
            to_asset_id: to,
            ratio: ratioOf(flags),
            cost_share: requireFlag(flags, "cost-share"),
          },
        ],
        to,
      );
    },
  },
  "fund-merger": {
    kind: "fund_merger",
    flags: ["to-asset", "ratio"],
    build: async (_ctx, flags, _base, state) => {
      const to = requireFlag(flags, "to-asset");
      requireAssetInCatalogue(state, to, "destino");
      return [{ op: "convert", to_asset_id: to, ratio: ratioOf(flags) }];
    },
  },
  "share-class-change": {
    kind: "share_class_change",
    flags: ["to-asset", "ratio"],
    build: async (_ctx, flags, _base, state) => {
      const to = requireFlag(flags, "to-asset");
      requireAssetInCatalogue(state, to, "destino");
      return [{ op: "convert", to_asset_id: to, ratio: ratioOf(flags) }];
    },
  },
  "fund-liquidation": {
    kind: "fund_liquidation",
    flags: ["unit-price", "currency", "fx-rate", "fx-rate-date", "fees"],
    build: async (_ctx, flags, base, state) => {
      const holders = holdersOf(state, base.asset).map((p) => p.account_id);
      const fees = feesOf(flags, holders);
      return [
        {
          op: "forced_sale",
          per_account: holders.map((account_id) =>
            fees[account_id] === undefined
              ? { account_id, quantity: "all" }
              : { account_id, quantity: "all", fee: fees[account_id] as string },
          ),
          unit_price: requireFlag(flags, "unit-price"),
          currency: requireFlag(flags, "currency"),
          fx_rate: requireFlag(flags, "fx-rate"),
          fx_rate_date: requireFlag(flags, "fx-rate-date"),
        },
      ];
    },
  },
  delisting: { kind: "delisting", flags: [], build: async () => [] },
  raw: {
    kind: "issuer_restructuring",
    flags: ["kind", "effects-json"],
    build: async (_ctx, flags) => {
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
    },
  },
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

const affectedAssets = (base: Base, effects: Effect[]): string[] => [
  ...new Set([
    base.asset,
    ...effects.flatMap((effect) => [
      effect.asset_id ?? base.asset,
      ...("to_asset_id" in effect ? [effect.to_asset_id] : []),
    ]),
  ]),
];

const adviseAfter = (
  ctx: Context,
  base: Base,
  kind: CorporateActionKind,
  preview: CandidatePreview,
): void => {
  ctx.io.out(
    `Recuerda copiar el documento fuente (${base.source_document}) a documents/ a mano: la CLI solo guarda la referencia.`,
  );
  if (kind === "delisting") {
    ctx.io.out(
      `Marcar el activo como inactivo es aparte: atlas asset update ${base.asset} --inactive`,
    );
  }
  const heldBefore = preview.before.positions.some((p) => p.asset_id === base.asset);
  const heldAfter = preview.after.positions.some((p) => p.asset_id === base.asset);
  if (heldBefore && !heldAfter && kind !== "delisting") {
    ctx.io.out(
      `El activo ${base.asset} queda sin posición; si ya no existe, márcalo con atlas asset update ${base.asset} --inactive`,
    );
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
  const base: Base = {
    asset: requireFlag(flags, "asset"),
    effective_date: requireFlag(flags, "effective-date"),
    source_document: requireFlag(flags, "source-document"),
    ...(notes === undefined ? {} : { notes }),
  };
  const kind = kindOf(name, flags);
  const { state } = await loadAndProject(ctx.deps);
  requireAssetInCatalogue(state, base.asset, "afectado");
  const effects = await wizard.build(ctx, flags, base, state);
  const draft = draftOf(kind, base, effects);
  const preview = await previewCandidate(ctx, draft, affectedAssets(base, effects));
  if (ctx.json) {
    ctx.io.out(JSON.stringify(previewData(preview), null, 2));
  } else {
    ctx.io.out("Evento a registrar:");
    ctx.io.out(keyValue(draft));
    ctx.io.out(renderPreview(preview));
  }
  adviseAfter(ctx, base, kind, preview);
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
