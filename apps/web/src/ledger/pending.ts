// A write whose answer was lost (ADR-0035, §2): it was sent, and nobody knows
// whether it is in the ledger. The ids were fixed **before** sending, so once
// there is a connection the reloaded ledger is searched for them
// (`ApiLedgerStore.findOutcome`):
//   - they are there: it was recorded, and it must not be recorded again;
//   - they are not: nothing was written, and the same data can be sent again,
//     **with the same ids**, by the person's own click — never by a timer;
//   - after a `412` that follows an unknown outcome, the ledger is searched
//     **again** before asking to confirm: the first send may have landed after
//     the first look (`specs/021-api-ledger-store`, reminder for E2b).
//
// The state is kept in memory (`store.pending()`), never on the device.

import { reloadLedger } from "./cloud.js";
import { signedOutReason } from "./session-errors.js";
import { type PendingState, store } from "./state.js";

interface Finder {
  findOutcome(ids: readonly string[]): Promise<{ outcome: "written" | "not_written" | "partial" }>;
}

/** The store of the cloud, if the open one is: it is the only one that can look for ids. */
const finderOf = (): Finder | undefined => {
  const open = store.deps()?.store as Partial<Finder> | undefined;
  return typeof open?.findOutcome === "function" ? (open as Finder) : undefined;
};

const update = (state: PendingState, said?: string): void => {
  const current = store.pending();
  if (current !== undefined) {
    const { said: _before, ...rest } = current;
    store.setPending({ ...rest, state, ...(said === undefined ? {} : { said }) });
  }
};

/** Looks for the ids of the pending write in the ledger; a lost connection leaves it unknown. */
export const settlePending = async (): Promise<void> => {
  const current = store.pending();
  const finder = finderOf();
  if (current === undefined || finder === undefined || current.state === "checking") {
    return;
  }
  update("checking");
  try {
    const found = await finder.findOutcome(current.ids);
    update(found.outcome);
    await reloadLedger({ quiet: true });
  } catch (error) {
    const reason = signedOutReason(error);
    if (reason !== undefined) {
      store.setLoad({ phase: "signed_out", reason });
    }
    update("unknown");
  }
};

/** Sends the pending write again, with the same ids, because the person said so. */
export const retryPending = async (): Promise<void> => {
  const current = store.pending();
  if (current === undefined || current.state === "checking") {
    return;
  }
  update("checking");
  const result = await current.retry();
  switch (result.kind) {
    case "done":
      update("written");
      return;
    case "unknown":
      update("unknown");
      return;
    case "refused":
      update("not_written", result.message);
      return;
    case "conflict":
      // The ledger changed: before asking to confirm again, look once more for the ids.
      update("unknown");
      await settlePending();
      if (store.pending()?.state === "not_written") {
        update("changed");
      }
      return;
  }
};

/** The person gives the pending write up (or has read that it was recorded). */
export const discardPending = (): void => {
  store.setPending(undefined);
};
