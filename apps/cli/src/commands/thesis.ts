// atlas thesis open · close <id> · list [--closed] [--at]

import { loadAndProject, theses, todayInMadrid } from "@atlas/domain";
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
import { requireId } from "./catalogue.js";
import { confirmAndRecord, render } from "./shared.js";

const OPEN_FLAGS = [
  "id",
  "account",
  "asset",
  "hypothesis",
  "horizon-days",
  "invalidation",
  "planned-size",
];

export const thesisCommand = async (
  ctx: Context,
  positionals: string[],
  flags: Flags,
): Promise<number> => {
  const [, action] = positionals;
  if (action === "open") {
    assertKnownFlags(flags, [...OPEN_FLAGS, ...GLOBAL_FLAGS]);
    const horizon = Number(requireFlag(flags, "horizon-days"));
    if (!Number.isInteger(horizon) || horizon <= 0) {
      throw new UsageError("--horizon-days debe ser un entero positivo (días)");
    }
    await confirmAndRecord(ctx, {
      type: "thesis_opened",
      thesis_id: requireFlag(flags, "id"),
      account_id: requireFlag(flags, "account"),
      asset_id: requireFlag(flags, "asset"),
      hypothesis: requireFlag(flags, "hypothesis"),
      expected_horizon_days: horizon,
      invalidation: requireFlag(flags, "invalidation"),
      planned_size_eur: requireFlag(flags, "planned-size"),
    });
    return 0;
  }
  if (action === "close") {
    const thesisId = requireId(positionals, 2, "uso: atlas thesis close <thesis_id> --notes …");
    assertKnownFlags(flags, ["notes", ...GLOBAL_FLAGS]);
    await confirmAndRecord(ctx, {
      type: "thesis_closed",
      thesis_id: thesisId,
      closing_notes: requireFlag(flags, "notes"),
    });
    return 0;
  }
  if (action === "list") {
    assertKnownFlags(flags, ["closed", "at", ...GLOBAL_FLAGS]);
    const { state } = await loadAndProject(ctx.deps);
    const at = stringFlag(flags, "at") ?? todayInMadrid(ctx.deps.clock);
    const includeClosed = booleanFlag(flags, "closed");
    const rows = theses(state, at).filter((t) => includeClosed || t.status === "open");
    render(
      ctx,
      rows.map((t) => ({
        ...t,
        planned_size_eur: t.planned_size_eur.amount.toString(),
        quantity_bought: t.quantity_bought.toString(),
        quantity_sold: t.quantity_sold.toString(),
        invested_eur: t.invested_eur.amount.toString(),
        fees_eur: t.fees_eur.amount.toString(),
        result_eur: t.result_eur.amount.toString(),
        result_eur_rounded: t.result_eur_rounded.amount.toString(),
        position: t.position.toString(),
      })),
      table(
        [
          "tesis",
          "cuenta",
          "activo",
          "estado",
          "apertura",
          "cierre",
          "días",
          "plazo",
          "invertido EUR",
          "resultado EUR",
          "comisiones EUR",
          "posición",
          "previsto EUR",
        ],
        rows.map((t) => [
          t.thesis_id,
          t.account_id,
          t.asset_id,
          t.status === "open" ? "abierta" : "cerrada",
          t.opened_at,
          t.closed_at ?? "",
          String(t.days_open),
          String(t.expected_horizon_days),
          t.invested_eur.amount.toString(),
          t.result_eur_rounded.amount.toString(),
          t.fees_eur.roundToCents().amount.toString(),
          t.position.toString(),
          t.planned_size_eur.amount.toString(),
        ]),
      ),
    );
    return 0;
  }
  throw new UsageError("uso: atlas thesis open|close <id>|list [--closed] [--at YYYY-MM-DD]");
};
