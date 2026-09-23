// The form of "lo presentado": one field per figure the return declares,
// preloaded with what the application computes.
//
// The figures, their keys and the event that comes out of them are the
// domain's (`filingProposal`), so the web and the console record the same
// filing. What this adds is the **name** of each figure in Spanish and the
// order they are read in.

import type { FilingFigureProposal, FilingProposal } from "@atlas/domain/fiscal";
import type { NameIndex } from "../../format/names.js";
import { displayName } from "../../format/names.js";

const CATEGORY_NAMES: Record<string, string> = {
  capital_gain: "ganancias y pérdidas patrimoniales",
  movable_capital: "rendimientos del capital mobiliario",
  accounts: "Cuentas en el extranjero",
  securities: "Valores y fondos en el extranjero",
  crypto: "Monedas virtuales en el extranjero",
};

export interface FilingField {
  key: string;
  label: string;
  /** What the application computes, as the amount the field starts with. */
  computed: string;
  /** One line under the field, when the figure needs explaining. */
  hint?: string;
}

const labelOf = (figure: FilingFigureProposal, names: NameIndex): string => {
  switch (figure.kind) {
    case "savings_base":
      return "Base del ahorro";
    case "pending_loss":
      return `Pendiente de ${figure.origin_year}: ${CATEGORY_NAMES[figure.category as string] ?? ""}`;
    case "deferred":
      return "Pérdidas aplazadas por recompra a 31 de diciembre";
    case "category_value":
      return `${CATEGORY_NAMES[figure.category as string] ?? ""}: total a 31 de diciembre`;
    case "category_q4_average":
      return `${CATEGORY_NAMES[figure.category as string] ?? ""}: saldo medio del último trimestre`;
    case "item_q4_average":
      return `${displayName(names, figure.asset_id ?? (figure.account_id as string))}: saldo medio del último trimestre`;
    default:
      return `${displayName(names, figure.asset_id ?? (figure.account_id as string))}: a 31 de diciembre`;
  }
};

export const filingFields = (proposal: FilingProposal, names: NameIndex): FilingField[] =>
  proposal.figures.map((figure) => ({
    key: figure.key,
    label: labelOf(figure, names),
    computed: figure.amount_eur.centsText(),
  }));

/** The title of the screen: what is being recorded. */
export const filingTitle = (model: string, year: number): string =>
  model === "renta" ? `Renta de ${year}` : `Modelo ${model} de ${year}`;
