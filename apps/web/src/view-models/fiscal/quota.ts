// The estimated quota of the savings base (criterion #27), turned into what the
// card paints. The figures are `savingsQuota`'s; this layer only names the
// brackets, says the notes in Spanish and keeps every amount a `Money` for
// `Amount`, which masks it. The limits and rates of the scale are law, not the
// user's data, so they are written as plain text and stay visible.

import type { Money } from "@atlas/domain";
import type { QuotaNote, SavingsQuota } from "@atlas/domain/fiscal";
import { formatDate } from "../../format/date.js";
import { formatDecimalString } from "../../format/number.js";

export interface QuotaBracketView {
  key: string;
  /** "Hasta 6.000 €", "De 6.000 a 50.000 €", "Más de 300.000 €". */
  label: string;
  rate_pct: string;
  base_eur: Money;
  quota_eur: Money;
}

export interface QuotaNoteView {
  key: QuotaNote;
  severity: "caution" | "info";
  text: string;
}

export interface QuotaView {
  year: number;
  /** False when the year has no checked scale: the card says so and shows no figure. */
  computed: boolean;
  fromSettings: boolean;
  /** "Ley 7/2024, …, leída en el BOE el 03/11/2026". */
  source?: string;
  brackets: QuotaBracketView[];
  state_eur?: Money;
  regional_eur?: Money;
  quota_eur?: Money;
  average_rate_pct?: string;
  marginal_rate_pct?: string;
  room_to_next_eur?: Money;
  deduction_eur?: Money;
  withholdings_eur: Money;
  result_eur?: Money;
  /** The income from outside the portfolio inside the base, when there is some. */
  external_eur?: Money;
  notes: QuotaNoteView[];
}

const euros = (money: Money): string =>
  `${formatDecimalString(money.amount.toString(), { decimals: 0 })} €`;

const NOTES: Record<QuotaNote, (year: number, checked: string) => QuotaNoteView> = {
  settings_differ_from_law: (year) => ({
    key: "settings_differ_from_law",
    severity: "caution",
    text: `Tus ajustes tienen tramos propios que no coinciden con la escala de la ley de ${year}: esta cuota sale de ellos. Revísalos en Configuración.`,
  }),
  settings_brackets_invalid: () => ({
    key: "settings_brackets_invalid",
    severity: "caution",
    text: "Los tramos de tus ajustes no forman una escala (faltan, están desordenados o el último tiene límite): se usa la escala de la ley.",
  }),
  scale_after_check: (year, checked) => ({
    key: "scale_after_check",
    severity: "info",
    text: `Es la escala en vigor el ${checked}: una ley podría cambiarla para ${year}.`,
  }),
  deduction_incomplete: () => ({
    key: "deduction_incomplete",
    severity: "info",
    text: "Algún dividendo extranjero no dice de qué país viene o su país no tiene tipo de convenio en tus ajustes: su deducción no se calcula.",
  }),
};

export const quotaView = (quota: SavingsQuota): QuotaView => {
  const checked = quota.scale === undefined ? "" : formatDate(quota.scale.checked_at);
  return {
    year: quota.year,
    computed: quota.quota_eur !== undefined,
    fromSettings: quota.scale_origin === "settings",
    ...(quota.scale === undefined || quota.scale_origin === "settings"
      ? {}
      : { source: `${quota.scale.law}, leída en el BOE el ${checked}` }),
    brackets: quota.brackets.map((bracket) => ({
      key: bracket.from_eur.amount.toString(),
      label:
        bracket.up_to_eur === undefined
          ? `Más de ${euros(bracket.from_eur)}`
          : bracket.from_eur.isZero()
            ? `Hasta ${euros(bracket.up_to_eur)}`
            : `De ${euros(bracket.from_eur)} a ${euros(bracket.up_to_eur)}`,
      rate_pct: bracket.rate_pct,
      base_eur: bracket.base_eur,
      quota_eur: bracket.quota_eur,
    })),
    ...(quota.state_eur === undefined ? {} : { state_eur: quota.state_eur }),
    ...(quota.regional_eur === undefined ? {} : { regional_eur: quota.regional_eur }),
    ...(quota.quota_eur === undefined ? {} : { quota_eur: quota.quota_eur }),
    ...(quota.average_rate_pct === undefined ? {} : { average_rate_pct: quota.average_rate_pct }),
    ...(quota.marginal_rate_pct === undefined
      ? {}
      : { marginal_rate_pct: quota.marginal_rate_pct }),
    ...(quota.room_to_next_eur === undefined ? {} : { room_to_next_eur: quota.room_to_next_eur }),
    ...(quota.double_taxation === undefined
      ? {}
      : { deduction_eur: quota.double_taxation.deduction_eur }),
    withholdings_eur: quota.savings_withholdings_eur,
    ...(quota.result_eur === undefined ? {} : { result_eur: quota.result_eur }),
    ...(quota.external_eur === undefined ? {} : { external_eur: quota.external_eur }),
    notes: quota.notes.map((note) => NOTES[note](quota.year, checked)),
  };
};
