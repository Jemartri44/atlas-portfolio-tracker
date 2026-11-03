// Where each row of the form is anchored: the disposal an index of
// `state.gains` names, and back. Which original loss a deferral belongs to is
// in `../deferred-origins.ts`.

import type { RealizedGain } from "../../projections/state.js";
import type { ChainCore } from "../chain.js";
import { keyedByOrder, saleKey } from "../shared.js";

/** The disposal an index of `state.gains` names, which every row is anchored to. */
export const gainOf = (chain: ChainCore, index: number): RealizedGain =>
  chain.state.gains[index] as RealizedGain;

/**
 * The index in `state.gains` of a disposal, by the key `linesByKey` gives the
 * line that reports it: its event, account, asset and order among the sales
 * the event makes of that asset in that account.
 */
export const gainIndexOf = (chain: ChainCore): Map<string, number> => {
  const keyed = keyedByOrder(
    chain.state.gains.map((gain, position) => ({
      event_id: gain.event_id,
      account_id: gain.account_id,
      asset_id: gain.asset_id,
      position,
    })),
    saleKey,
  );
  return new Map([...keyed].map(([key, gain]) => [key, gain.position]));
};
