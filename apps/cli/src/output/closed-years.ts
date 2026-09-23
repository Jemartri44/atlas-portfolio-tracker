// "This touches a tax year you have already filed" (ADR-0020, amended;
// prompt 010, block 5).
//
// It **never refuses**: filing late can be legitimate and is sometimes
// compulsory. What is not acceptable is doing it in silence, so the warning
// names the return that would have to be looked at and says how much each
// declared figure moves — before the question, which is the only moment it is
// still useful.
//
// Two separate things, and they are printed as such:
//
//   - a **filed** year the write reaches: a warning, with its figures;
//   - a **past** year with figures and no return recorded: a note, not a
//     warning (S8, question Q8). Saying "careful, you filed this" of a year
//     nobody filed is the warning that gets ignored.

import type { FilingModel } from "@atlas/domain";
import type { ClosedYearImpact, ClosedYearNotCompared } from "@atlas/domain/fiscal";

/**
 * The return after the preposition `a`, where Spanish contracts `a el` into
 * `al`, and the participle that agrees with it: the Renta is feminine, a
 * «Modelo» masculine. Keyed by `FilingModel`, so a model added tomorrow asks
 * the compiler for its name and its gender instead of borrowing another's.
 */
const MODEL: Record<FilingModel, { readonly name: string; readonly filed: string }> = {
  renta: { name: "a la Renta", filed: "presentada" },
  "720": { name: "al Modelo 720", filed: "presentado" },
  "721": { name: "al Modelo 721", filed: "presentado" },
};

/** The figure of a filing as it names it: `savings_base`, `pending:2024:…`, `deferred`. */
const FIGURE: Record<string, string> = {
  savings_base: "la base del ahorro",
  deferred: "lo diferido por recompra a 31/12",
};

const figureName = (figure: string): string => {
  const known = FIGURE[figure];
  if (known !== undefined) {
    return known;
  }
  const [, year, category] = figure.split(":") as [string, string, string];
  return `el saldo pendiente de ${year} (${
    category === "capital_gain"
      ? "ganancias y pérdidas patrimoniales"
      : "rendimientos del capital mobiliario"
  })`;
};

/**
 * Why the comparison was not made, said as what it means for the reader. The
 * three are told apart because they lead to different actions: the first is
 * repaired, the second cannot be, and the third is not broken.
 */
const NOT_COMPARED: Record<ClosedYearNotCompared, string> = {
  invalid_reading:
    "No se ha podido comparar con lo declarado: hay movimientos inválidos en el libro. Repáralos (`atlas check`) y vuelve a mirar",
  chain_unsupported:
    "No se ha podido comparar con lo declarado: una de las dos lecturas tendría que empezar en un ejercicio anterior al primero que este motor calcula",
  by_design:
    "Las cifras de ese modelo son valores a mercado y no se comparan con el motor de la Renta: mira tú si lo que vas a registrar las mueve",
};

/** One line per filed year the write reaches, with what it moves. */
export const closedYearLines = (impacts: readonly ClosedYearImpact[]): string[] =>
  impacts.map((impact) => {
    const { name, filed } = MODEL[impact.model];
    const head = `Aviso: afecta ${name} de ${impact.year}, ${filed} el ${impact.filed_at}.`;
    const where = impact.by_date ? " La fecha de lo que vas a registrar cae en ese ejercicio." : "";
    // **Never "no mueve ninguna cifra declarada" without having compared.**
    // An empty list used to mean both that and "I could not compare", and the
    // second one read as the first is an affirmation nobody checked.
    if (impact.comparison.status === "not_compared") {
      return `${head}${where} ${NOT_COMPARED[impact.comparison.reason]}. Puede que toque una complementaria.`;
    }
    // Compared, and nothing moved. It is only reachable by date: with no date
    // and no movement there is nothing to warn about.
    if (impact.comparison.moves.length === 0) {
      return `${head} La fecha de lo que vas a registrar cae en ese ejercicio; no mueve ninguna cifra declarada.`;
    }
    const moves = impact.comparison.moves
      .map((move) => `${figureName(move.figure)} pasa de ${move.before} a ${move.after}`)
      .join("; ");
    return `${head} ${impact.by_date ? "Cae en ese ejercicio y mueve" : "Mueve"} lo declarado: ${moves}. Puede que toque una complementaria.`;
  });

/** The note for a past year nobody has recorded a return for. */
export const unfiledYearsNote = (years: readonly number[]): string[] =>
  years.length === 0
    ? []
    : [
        `Nota: ${years.length === 1 ? `el ejercicio ${years[0]} tiene cifras y no consta` : `los ejercicios ${years.join(", ")} tienen cifras y no constan`} como declarado${years.length === 1 ? "" : "s"}. Si los presentaste, regístralos con \`atlas filed renta <año>\`: es lo que permite avisarte cuando algo mueve una declaración.`,
      ];
