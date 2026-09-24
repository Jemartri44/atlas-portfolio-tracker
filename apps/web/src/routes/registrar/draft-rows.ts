// The drafts as the list shows them (feature 012, block 5): what the domain
// says of each one today, in the shape the screen paints. The rule is the
// domain's (`pendingDraftStatus`); nothing here decides anything.

import type { CivilDate, LedgerEvent, LedgerState } from "@atlas/domain";
import {
  DEFAULT_LOCAL_CONFIG,
  type DraftStatus,
  draftRecordedAs,
  type PendingDraft,
  pendingDraftStatus,
} from "@atlas/domain/ecb";
import type { WebHistory } from "../../ecb/history.js";

export type RowStatus =
  | Exclude<DraftStatus, { kind: "confirmable" }>
  | { kind: "confirmable"; rates: { currency: string; rate: string; date: CivilDate }[] };

export interface DraftRow {
  draft: PendingDraft;
  status: RowStatus;
  /** Recorded already: its confirmation did not remove it. Only removing is left. */
  recorded: string[];
  /** The asset, or the account, the operation is about. */
  subject?: string;
  date: CivilDate;
  currency: string;
}

const statusOf = (status: DraftStatus): RowStatus =>
  status.kind === "confirmable"
    ? {
        kind: "confirmable",
        rates: status.proposed.flatMap(({ point, resolution }) =>
          resolution.kind === "resolved"
            ? [{ currency: point.currency, rate: resolution.rate, date: resolution.date }]
            : [],
        ),
      }
    : status;

export const draftRows = (
  drafts: readonly PendingDraft[],
  state: LedgerState,
  events: readonly LedgerEvent[],
  web: WebHistory | undefined,
): DraftRow[] =>
  drafts.map((draft) => {
    const event = draft.event;
    const subject = [event.asset_id, event.from_asset_id, event.account_id].find(
      (value): value is string => typeof value === "string",
    );
    return {
      draft,
      recorded: draftRecordedAs(events, draft),
      status: statusOf(
        pendingDraftStatus(
          web?.history,
          state,
          draft,
          web?.staleDays ?? DEFAULT_LOCAL_CONFIG.ecb_stale_currency_days,
        ),
      ),
      ...(subject === undefined ? {} : { subject }),
      date: String(event.trade_date ?? event.value_date ?? event.date ?? "") as CivilDate,
      currency: String(event.currency ?? ""),
    };
  });
