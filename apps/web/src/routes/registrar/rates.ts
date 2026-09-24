// The ECB rate of the form being filled in (feature 012, block 3), as a hook:
// the history is fetched **lazily** when the form opens — nothing of the ECB
// is on the boot path —, its proposal fills the rate fields the user has not
// touched, and a typed rate that is not the official one asks for a yes
// before the write. The rules are the domain's; the sentences, `RateNotes`.

import type { LedgerState } from "@atlas/domain";
import { type Accessor, createEffect, createSignal, onMount, untrack } from "solid-js";
import type { WebHistory } from "../../ecb/history.js";
import type { EventFormSpec, FormValues } from "../../view-models/forms/index.js";
import {
  proposedValues,
  type RateHint,
  type RateToConfirm,
  ratesToConfirm,
} from "../../view-models/forms/rates.js";

export interface FormRates {
  web: Accessor<WebHistory | undefined>;
  hint: Accessor<RateHint>;
  toConfirm: Accessor<readonly RateToConfirm[]>;
  acknowledged: Accessor<boolean>;
  acknowledge: (value: boolean) => void;
  /** Computes, before "Ver el efecto", which typed rates need a yes. */
  check: (values: FormValues) => void;
  /** Whether the write may go ahead: nothing to confirm, or confirmed. */
  cleared: Accessor<boolean>;
}

export const useFormRates = (options: {
  spec: EventFormSpec;
  state: LedgerState;
  values: Accessor<FormValues>;
  setValues: (values: FormValues) => void;
  typed: Accessor<ReadonlySet<string>>;
  correcting: boolean;
}): FormRates => {
  const [web, setWeb] = createSignal<WebHistory | undefined>(undefined);
  const [hint, setHint] = createSignal<RateHint>({ kind: "none" });
  const [toConfirm, setToConfirm] = createSignal<readonly RateToConfirm[]>([]);
  const [acknowledged, acknowledge] = createSignal(false);

  onMount(() => {
    void import("../../ecb/history.js")
      .then((module) => module.loadWebHistory())
      // The module itself did not load (the network of an old PWA): the form
      // works as always, typed by hand, and says there is no history.
      .catch((): WebHistory => ({ staleDays: 30, problem: "unreadable" }))
      .then(setWeb);
  });

  /**
   * Runs after the change that triggered it has finished: the form sets the
   * value **and then** marks the field as typed, so deciding in the same turn
   * would take a rate the user is typing for one still to propose, and put
   * the proposal back over it.
   */
  const propose = (): void => {
    const loaded = untrack(web);
    const current = untrack(options.values);
    if (loaded === undefined || options.correcting) {
      return;
    }
    const typed = untrack(options.typed);
    if (typed.has("fx_rate") || typed.has("fx_rate_date")) {
      setHint({ kind: "none" });
      return;
    }
    const next = proposedValues(
      options.spec,
      current,
      options.state,
      loaded.history,
      loaded.staleDays,
    );
    setHint(next.hint);
    if (
      next.values.fx_rate !== current.fx_rate ||
      next.values.fx_rate_date !== current.fx_rate_date
    ) {
      options.setValues(next.values);
    }
  };

  createEffect(() => {
    web();
    options.values();
    options.typed();
    queueMicrotask(propose);
  });

  return {
    web,
    hint,
    toConfirm,
    acknowledged,
    acknowledge,
    check: (values) => {
      const loaded = web();
      acknowledge(false);
      setToConfirm(
        loaded === undefined
          ? []
          : ratesToConfirm(options.spec, values, options.state, loaded.history, loaded.staleDays),
      );
    },
    cleared: () => toConfirm().length === 0 || acknowledged(),
  };
};
