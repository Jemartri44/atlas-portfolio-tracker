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

import type { ClosedYearImpact } from "@atlas/domain/fiscal";

const MODEL: Record<string, string> = {
  renta: "la Renta",
  "720": "el Modelo 720",
  "721": "el Modelo 721",
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

/** One line per filed year the write reaches, with what it moves. */
export const closedYearLines = (impacts: readonly ClosedYearImpact[]): string[] =>
  impacts.map((impact) => {
    const what = MODEL[impact.model] ?? impact.model;
    const head = `Aviso: afecta a ${what} de ${impact.year}, presentada el ${impact.filed_at}.`;
    if (impact.moves.length === 0) {
      return `${head} La fecha de lo que vas a registrar cae en ese ejercicio; no mueve ninguna cifra declarada.`;
    }
    const moves = impact.moves
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
