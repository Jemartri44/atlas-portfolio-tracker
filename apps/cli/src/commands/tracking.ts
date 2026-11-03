// atlas order place|cancel|note|list · atlas transfer request|update|pending

import { daysBetween, pendingOrders, settingsAt, transferWatch } from "@atlas/domain";
import { assertKnownFlags, booleanFlag, type Flags, UsageError } from "../args.js";
import { type Context, describeWarnings, GLOBAL_FLAGS } from "../context.js";
import { table } from "../output/table.js";
import {
  confirmAndRecord,
  dateFlag,
  draftFromFlags,
  loadForQuery,
  renderQuery,
  requireId,
} from "./shared.js";

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
  throw new UsageError("uso: atlas transfer request|update|pending");
};
