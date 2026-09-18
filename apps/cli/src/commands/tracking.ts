// atlas order place|cancel|note|list · atlas transfer request|update|pending|simulate

import {
  daysBetween,
  pendingOrders,
  settingsAt,
  simulateTransfer,
  transferWatch,
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
import { eur, pct, pp } from "../output/format.js";
import { table } from "../output/table.js";
import { requireId } from "./catalogue.js";
import { confirmAndRecord, dateFlag, draftFromFlags, loadForQuery, renderQuery } from "./shared.js";

export const orderCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const [, action] = positionals;
  if (action === "place") {
    await confirmAndRecord(
      ctx,
      draftFromFlags(
        {
          type: "order_placed",
          flags: ["account", "asset", "side", "amount", "quantity", "requested-date", "notes"],
        },
        flags,
      ),
    );
    return 0;
  }
  if (action === "cancel" || action === "note") {
    const orderId = requireId(
      positionals,
      2,
      `uso: atlas order ${action} <order_id> --date YYYY-MM-DD [--notes …]`,
    );
    const draft = draftFromFlags({ type: "order_updated", flags: ["date", "notes"] }, flags);
    await confirmAndRecord(ctx, {
      ...draft,
      order_id: orderId,
      stage: action === "cancel" ? "cancelled" : "note",
    });
    return 0;
  }
  if (action === "list") {
    assertKnownFlags(flags, ["all", "date", ...GLOBAL_FLAGS]);
    /*
     * Like every other dated view (ADR-0016): the ledger is cut at the date and
     * the days are counted to it. Until this feature this command loaded the
     * whole ledger and counted to today, which meant `--date` did not exist and
     * `--all` reported `days_open: 0` for every order — a figure that was not
     * missing, it was **wrong**, and printed in the same column as the real one.
     */
    const date = dateFlag(ctx, flags);
    const { state } = await loadForQuery(ctx, date);
    const rows = booleanFlag(flags, "all")
      ? [...state.orders.values()].map((order) => ({
          ...order,
          days_open: daysBetween(order.requested_date, date),
        }))
      : pendingOrders(state, date);
    renderQuery(
      ctx,
      state,
      rows,
      table(
        ["orden", "cuenta", "activo", "sentido", "importe", "cantidad", "fecha", "estado", "días"],
        rows.map((o) => [
          o.order_id,
          o.account_id,
          o.asset_id,
          o.side,
          o.amount ?? "",
          o.quantity ?? "",
          o.requested_date,
          o.stage,
          o.stage === "open" ? String(o.days_open) : "",
        ]),
      ),
    );
    return 0;
  }
  throw new UsageError("uso: atlas order place|cancel|note|list [--all] [--date YYYY-MM-DD]");
};

export const transferCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const [, action] = positionals;
  if (action === "request") {
    await confirmAndRecord(
      ctx,
      draftFromFlags(
        {
          type: "transfer_requested",
          flags: [
            "from-account",
            "from-asset",
            "to-account",
            "to-asset",
            "quantity-out",
            "amount-eur",
            "requested-date",
            "notes",
          ],
        },
        flags,
      ),
    );
    return 0;
  }
  if (action === "update") {
    const requestId = requireId(
      positionals,
      2,
      "uso: atlas transfer update <request_id> --stage redeemed|subscribed|cancelled --date YYYY-MM-DD",
    );
    const draft = draftFromFlags(
      {
        type: "transfer_request_updated",
        flags: ["stage", "date", "nav-out", "quantity-out", "notes"],
      },
      flags,
    );
    await confirmAndRecord(ctx, { ...draft, request_id: requestId });
    return 0;
  }
  if (action === "simulate") {
    assertKnownFlags(flags, ["from-asset", "to-asset", "quantity", "all", "date", ...GLOBAL_FLAGS]);
    const quantity = stringFlag(flags, "quantity");
    const all = booleanFlag(flags, "all");
    if ((quantity === undefined) === !all) {
      throw new UsageError("indica exactamente uno de --quantity <n> o --all");
    }
    const date = dateFlag(ctx, flags);
    const { state } = await loadForQuery(ctx, date);
    const simulation = simulateTransfer(state, {
      from_asset_id: requireFlag(flags, "from-asset"),
      to_asset_id: requireFlag(flags, "to-asset"),
      ...(quantity === undefined ? { all: true } : { quantity }),
      date,
      settings: settingsAt(state, date).settings,
    });
    const weightOf = (weights: typeof simulation.before, assetId: string) =>
      weights.rows.find((row) => row.asset_id === assetId);
    const warningBlock = (title: string, warnings: readonly Warning[]): string[] =>
      warnings.length === 0 ? [] : ["", title, ...describeWarnings(warnings)];
    renderQuery(
      ctx,
      state,
      {
        date,
        from_asset_id: simulation.from_asset_id,
        to_asset_id: simulation.to_asset_id,
        quantity: simulation.quantity.toString(),
        moved_eur: simulation.moved_eur.amount.toString(),
        taxable: simulation.taxable,
        partial_before: simulation.before.partial,
        partial_after: simulation.after.partial,
        rows: simulation.before.rows.map((row) => ({
          asset_id: row.asset_id,
          weight_before_pct: row.weight_pct?.toString(),
          weight_after_pct: weightOf(simulation.after, row.asset_id)?.weight_pct?.toString(),
          deviation_before_pp: row.deviation_pp?.toString(),
          deviation_after_pp: weightOf(simulation.after, row.asset_id)?.deviation_pp?.toString(),
        })),
        warnings_before: simulation.before.warnings,
        warnings_after: simulation.after.warnings,
      },
      [
        `Simulación de traspaso a ${date}: ${simulation.quantity.toString()} de ${simulation.from_asset_id} → ${simulation.to_asset_id} (${eur(simulation.moved_eur)} EUR).`,
        "Un traspaso entre fondos no es hecho imponible: conserva fecha de adquisición y coste (business-rules.md §5.2).",
        "",
        table(
          ["activo", "peso antes", "peso después", "desv. antes", "desv. después"],
          simulation.before.rows.map((row) => {
            const after = weightOf(simulation.after, row.asset_id);
            return [
              row.asset_id,
              pct(row.weight_pct),
              pct(after?.weight_pct),
              pp(row.deviation_pp),
              pp(after?.deviation_pp),
            ];
          }),
        ),
        ...warningBlock("Avisos de la cartera actual:", simulation.before.warnings),
        ...warningBlock("Avisos tras el traspaso simulado:", simulation.after.warnings),
        "",
        "Nada se ha registrado.",
      ].join("\n"),
    );
    return 0;
  }
  if (action === "pending") {
    assertKnownFlags(flags, ["date", ...GLOBAL_FLAGS]);
    const date = dateFlag(ctx, flags);
    const { state } = await loadForQuery(ctx, date);
    // The rule of `transfer_max_days`, which nobody consumed until now: the
    // days are counted to the date asked, and the warning is the domain's.
    const watch = transferWatch(state, date, settingsAt(state, date).settings);
    renderQuery(
      ctx,
      state,
      watch.rows,
      [
        table(
          [
            "solicitud",
            "origen",
            "destino",
            "cantidad",
            "importe EUR",
            "fecha",
            "etapa",
            "días",
            "plazo",
          ],
          watch.rows.map((t) => [
            t.request_id,
            `${t.from_account_id}/${t.from_asset_id}`,
            `${t.to_account_id}/${t.to_asset_id}`,
            t.quantity_out ?? "",
            t.amount_eur ?? "",
            t.requested_date,
            t.stage,
            String(t.days_open),
            t.max_days === undefined ? "" : `${t.max_days}${t.overdue === true ? " ⚠" : ""}`,
          ]),
        ),
        ...(watch.warnings.length === 0
          ? []
          : ["", "Avisos:", ...describeWarnings(watch.warnings)]),
      ].join("\n"),
    );
    return 0;
  }
  throw new UsageError("uso: atlas transfer request|update|pending|simulate");
};
