// atlas order place|cancel|note|list · atlas transfer request|update|pending

import { loadAndProject, pendingOrders, pendingTransfers, todayInMadrid } from "@atlas/domain";
import { assertKnownFlags, booleanFlag, type Flags, UsageError } from "../args.js";
import { type Context, GLOBAL_FLAGS } from "../context.js";
import { table } from "../output/table.js";
import { requireId } from "./catalogue.js";
import { confirmAndRecord, draftFromFlags, render } from "./shared.js";

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
    assertKnownFlags(flags, ["all", ...GLOBAL_FLAGS]);
    const { state } = await loadAndProject(ctx.deps);
    const today = todayInMadrid(ctx.deps.clock);
    const rows = booleanFlag(flags, "all")
      ? [...state.orders.values()].map((order) => ({ ...order, days_open: 0 }))
      : pendingOrders(state, today);
    render(
      ctx,
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
  throw new UsageError("uso: atlas order place|cancel|note|list [--all]");
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
    assertKnownFlags(flags, GLOBAL_FLAGS);
    const { state } = await loadAndProject(ctx.deps);
    const rows = pendingTransfers(state, todayInMadrid(ctx.deps.clock));
    render(
      ctx,
      rows,
      table(
        ["solicitud", "origen", "destino", "cantidad", "importe EUR", "fecha", "etapa", "días"],
        rows.map((t) => [
          t.request_id,
          `${t.from_account_id}/${t.from_asset_id}`,
          `${t.to_account_id}/${t.to_asset_id}`,
          t.quantity_out ?? "",
          t.amount_eur ?? "",
          t.requested_date,
          t.stage,
          String(t.days_open),
        ]),
      ),
    );
    return 0;
  }
  throw new UsageError("uso: atlas transfer request|update|pending");
};
