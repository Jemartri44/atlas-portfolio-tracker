// The fourth question of a configuration change (feature 012, block 6;
// ADR-0029, point 10; criterion 25): which lines a change of
// `fiscal_date_rule` would leave with a rate that is not the one of their new
// fiscal date — asked **before** the change is written. The rule is the
// domain's (`ruleChangeRates`); the ECB is loaded here lazily, and only when
// the rule actually changes.

import type { LedgerEvent, Settings } from "@atlas/domain";
import type { RuleChangeImpact } from "@atlas/domain/ecb";
import { type Accessor, createSignal } from "solid-js";

export interface RuleChangeQuestion {
  /** Defined while the question is open. */
  impact: Accessor<RuleChangeImpact | undefined>;
  /** True when the question has to be answered before saving. */
  ask: (events: readonly LedgerEvent[], current: Settings, next: Settings) => Promise<boolean>;
  /** The user said yes: the question closes and is not asked again for this save. */
  answer: () => void;
  clear: () => void;
}

export const useRuleChangeQuestion = (): RuleChangeQuestion => {
  const [impact, setImpact] = createSignal<RuleChangeImpact | undefined>(undefined);
  /** The rule the open question is about, and the one the user said yes to. */
  let asked: string | undefined;
  const [answered, setAnswered] = createSignal<string | undefined>(undefined);
  return {
    impact: () => (answered() !== undefined && answered() === asked ? undefined : impact()),
    ask: async (events, current, next) => {
      const rule = JSON.stringify(next.fiscal_date_rule);
      if (rule === JSON.stringify(current.fiscal_date_rule) || rule === answered()) {
        return false;
      }
      const [{ loadWebHistory }, { ruleChangeRates }] = await Promise.all([
        import("../../ecb/history.js"),
        import("@atlas/domain/ecb"),
      ]);
      const web = await loadWebHistory();
      const found = ruleChangeRates(web.history, events, current, next, web.staleDays);
      if (found.lines.length === 0) {
        return false;
      }
      asked = rule;
      setAnswered(undefined);
      setImpact(found);
      return true;
    },
    answer: () => setAnswered(asked),
    clear: () => {
      asked = undefined;
      setImpact(undefined);
      setAnswered(undefined);
    },
  };
};
