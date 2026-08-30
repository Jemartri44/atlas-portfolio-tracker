// atlas positions · lots · cash · gains · income · check

import {
  cashBalances,
  fiscalLots,
  integrity,
  investmentIncome,
  loadAndProject,
  Money,
  physicalPositions,
  realizedGains,
} from "@atlas/domain";
import { assertKnownFlags, booleanFlag, type Flags, stringFlag, UsageError } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { table } from "../output/table.js";
import { render } from "./shared.js";

const yearOf = (positionals: string[], usage: string): number => {
  const year = Number(positionals[1]);
  if (!Number.isInteger(year) || year < 1900) {
    throw new UsageError(usage);
  }
  return year;
};

export const positionsCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["account", "asset", ...GLOBAL_FLAGS]);
  const { state } = await loadAndProject(ctx.deps);
  const account = stringFlag(flags, "account");
  const asset = stringFlag(flags, "asset");
  const rows = physicalPositions(state).filter(
    (p) =>
      (account === undefined || p.account_id === account) &&
      (asset === undefined || p.asset_id === asset),
  );
  render(
    ctx,
    rows.map((p) => ({ ...p, quantity: p.quantity.toString() })),
    table(
      ["cuenta", "activo", "cantidad"],
      rows.map((p) => [p.account_id, p.asset_id, p.quantity.toString()]),
    ),
  );
  return 0;
};

export const lotsCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["closed", ...GLOBAL_FLAGS]);
  const { state } = await loadAndProject(ctx.deps);
  const includeClosed = booleanFlag(flags, "closed");
  const rows = fiscalLots(state, positionals[1]).filter((lot) => includeClosed || !lot.closed);
  render(
    ctx,
    rows.map((lot) => ({
      ...lot,
      original_quantity: lot.original_quantity.toString(),
      quantity: lot.quantity.toString(),
      cost_eur: lot.cost_eur.amount.toString(),
      original_cost_eur: lot.original_cost_eur.amount.toString(),
      consumptions: lot.consumptions.map((c) => ({
        ...c,
        quantity: c.quantity.toString(),
        cost_eur: c.cost_eur.amount.toString(),
      })),
    })),
    table(
      [
        "lote",
        "activo",
        "adquisición",
        "cantidad",
        "original",
        "coste EUR",
        "coste original EUR",
        "origen",
        "estado",
      ],
      rows.map((lot) => [
        lot.id,
        lot.asset_id,
        lot.acquisition_date,
        lot.quantity.toString(),
        lot.original_quantity.toString(),
        lot.cost_eur.amount.toString(),
        lot.original_cost_eur.amount.toString(),
        lot.source_lot_id ?? "",
        lot.closed ? "cerrado" : "abierto",
      ]),
    ),
  );
  return 0;
};

export const cashCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["account", ...GLOBAL_FLAGS]);
  const { state } = await loadAndProject(ctx.deps);
  const account = stringFlag(flags, "account");
  const rows = cashBalances(state).filter((c) => account === undefined || c.account_id === account);
  render(
    ctx,
    rows.map((c) => ({ ...c, balance: c.balance.amount.toString() })),
    table(
      ["cuenta", "divisa", "saldo"],
      rows.map((c) => [c.account_id, c.currency, c.balance.amount.toString()]),
    ),
  );
  return 0;
};

export const gainsCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, ["lots", ...GLOBAL_FLAGS]);
  const year = yearOf(positionals, "uso: atlas gains <año> [--lots]");
  const { state } = await loadAndProject(ctx.deps);
  const gains = realizedGains(state, year);
  const total = gains.reduce((sum, g) => sum.add(g.gain_eur_rounded), Money.zero("EUR"));
  const lines = [
    table(
      [
        "fecha fiscal",
        "activo",
        "cuenta",
        "cantidad",
        "transmisión EUR",
        "coste EUR",
        "ganancia EUR",
        "evento",
      ],
      gains.map((g) => [
        g.fiscal_date,
        g.asset_id,
        g.account_id,
        g.quantity.toString(),
        g.proceeds_eur.amount.toString(),
        g.cost_eur.amount.toString(),
        g.gain_eur_rounded.amount.toString(),
        g.event_id,
      ]),
    ),
    `Total ${year}: ${total.amount.toString()} EUR`,
  ];
  if (booleanFlag(flags, "lots")) {
    lines.push(
      table(
        ["evento", "lote", "cantidad", "transmisión EUR", "coste EUR", "ganancia EUR"],
        gains.flatMap((g) =>
          g.by_lot.map((l) => [
            g.event_id,
            l.lot_id,
            l.quantity.toString(),
            l.proceeds_eur.amount.toString(),
            l.cost_eur.amount.toString(),
            l.gain_eur.amount.toString(),
          ]),
        ),
      ),
    );
  }
  render(
    ctx,
    gains.map((g) => ({
      ...g,
      quantity: g.quantity.toString(),
      proceeds_eur: g.proceeds_eur.amount.toString(),
      cost_eur: g.cost_eur.amount.toString(),
      gain_eur: g.gain_eur.amount.toString(),
      gain_eur_rounded: g.gain_eur_rounded.amount.toString(),
      by_lot: g.by_lot.map((l) => ({
        ...l,
        quantity: l.quantity.toString(),
        proceeds_eur: l.proceeds_eur.amount.toString(),
        cost_eur: l.cost_eur.amount.toString(),
        gain_eur: l.gain_eur.amount.toString(),
      })),
    })),
    lines.join("\n"),
  );
  return 0;
};

export const incomeCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, GLOBAL_FLAGS);
  const year = yearOf(positionals, "uso: atlas income <año>");
  const { state } = await loadAndProject(ctx.deps);
  const rows = investmentIncome(state, year);
  render(
    ctx,
    rows.map((i) => ({
      ...i,
      gross: i.gross.toString(),
      withholding_origin: i.withholding_origin.toString(),
      withholding_spain: i.withholding_spain.toString(),
      net: i.net.toString(),
      gross_eur: i.gross_eur.amount.toString(),
      withholding_origin_eur: i.withholding_origin_eur.amount.toString(),
      withholding_spain_eur: i.withholding_spain_eur.amount.toString(),
      net_eur: i.net_eur.amount.toString(),
    })),
    table(
      [
        "fecha",
        "tipo",
        "cuenta",
        "activo",
        "bruto",
        "ret. origen",
        "ret. España",
        "neto",
        "bruto EUR",
        "neto EUR",
      ],
      rows.map((i) => [
        i.fiscal_date,
        i.kind,
        i.account_id,
        i.asset_id ?? "",
        i.gross.toString(),
        i.withholding_origin.toString(),
        i.withholding_spain.toString(),
        i.net.toString(),
        i.gross_eur.amount.toString(),
        i.net_eur.amount.toString(),
      ]),
    ),
  );
  return 0;
};

export const checkCommand = async (
  ctx: Context,
  _positionals: string[],
  flags: Flags,
): Promise<number> => {
  assertKnownFlags(flags, GLOBAL_FLAGS);
  const { state } = await loadAndProject(ctx.deps, { collectErrors: true });
  const findings = integrity(state);
  const warnings = state.warnings;
  render(
    ctx,
    { findings, warnings },
    findings.length === 0 && warnings.length === 0
      ? "Libro íntegro: sin hallazgos."
      : table(
          ["nivel", "código", "mensaje", "eventos"],
          [
            ...findings.map((f) => [f.severity, f.code, f.message, f.event_ids.join(", ")]),
            ...warnings.map((w) => ["warning", w.code, w.message, w.event_id]),
          ],
        ),
  );
  return findings.some((f) => f.severity === "error") ? 1 : 0;
};
