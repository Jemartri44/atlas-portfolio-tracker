// "Esto toca un ejercicio que ya declaraste" (ADR-0020, amended; FR-018).
//
// It **never refuses**: filing late can be legitimate and is sometimes
// compulsory. What is never acceptable is doing it in silence, so the notice
// names the return that would have to be looked at and says how much each
// declared figure moves — before the question, which is the only moment it is
// still useful.
//
// The same component in the four places a write happens (Registrar, Corregir,
// Anular and Configuración), because the warning that looks different in each
// screen is the warning nobody recognises. The figures go through `Amount`
// like every other figure of the application: a filed base is as private as
// any other.

import type { FilingModel } from "@atlas/domain";
import { Money } from "@atlas/domain";
import type { ClosedYearImpact, ClosedYearNotCompared, MovedFigure } from "@atlas/domain/fiscal";
import { For, type JSX, Show } from "solid-js";
import { formatDate } from "../format/date.js";
import { Amount } from "./Amount.jsx";
import { Notice } from "./Notice.jsx";

/**
 * Keyed by `FilingModel`: with an open key a model added tomorrow would fall
 * through to the `??` and the notice would name it `721` in the middle of a
 * Spanish sentence. Closed, the compiler asks for its name instead.
 */
const MODEL_NAMES: Record<FilingModel, string> = {
  renta: "la Renta",
  "720": "el Modelo 720",
  "721": "el Modelo 721",
};

const FIGURE_NAMES: Record<string, string> = {
  savings_base: "la base del ahorro",
  deferred: "lo aplazado por recompra a 31 de diciembre",
};

/** The figure of a filing as it names it: `savings_base`, `pending:2024:…`, `deferred`. */
const figureName = (figure: string): string => {
  const known = FIGURE_NAMES[figure];
  if (known !== undefined) {
    return known;
  }
  const [, year, category] = figure.split(":") as [string, string, string];
  return category === "capital_gain"
    ? `lo que quedaba pendiente de ${year} en ganancias y pérdidas patrimoniales`
    : `lo que quedaba pendiente de ${year} en rendimientos del capital mobiliario`;
};

const euros = (amount: string): Money => Money.parse(amount, "EUR");

/**
 * Why the comparison was not made, in the words of the person who has to act
 * on it. **Never «no mueve ninguna cifra declarada»**: that is what an empty
 * list used to be read as, and saying it without having compared is an
 * affirmation the application had not checked — on the strength of which one
 * supplementary return fewer gets filed (feature 011, block 5).
 */
const NOT_COMPARED: Record<ClosedYearNotCompared, string> = {
  invalid_reading:
    "No se ha podido comparar con lo que declaraste: hay movimientos inválidos en tus datos. Arréglalos en Ajustes → Verificación y vuelve a mirar.",
  chain_unsupported:
    "No se ha podido comparar con lo que declaraste: una de las dos lecturas tendría que empezar antes del primer ejercicio que la aplicación sabe calcular.",
  by_design:
    "Las cifras de ese modelo son valores a mercado y no se comparan con el motor de la Renta: mira tú si lo que vas a registrar las mueve.",
};

/** What moved, when there was a comparison at all. */
const comparedMoves = (impact: ClosedYearImpact): readonly MovedFigure[] =>
  impact.comparison.status === "compared" ? impact.comparison.moves : [];

/** The reason, when there was not. `compared` never reaches here. */
const notComparedReason = (impact: ClosedYearImpact): ClosedYearNotCompared =>
  impact.comparison.status === "compared" ? "by_design" : impact.comparison.reason;

export const ClosedYearNotice = (props: { impacts: readonly ClosedYearImpact[] }): JSX.Element => (
  <For each={props.impacts}>
    {(impact) => (
      <Notice
        severity="caution"
        title={`Afecta a ${MODEL_NAMES[impact.model]} de ${impact.year}, que presentaste el ${formatDate(impact.filed_at)}`}
      >
        <Show
          when={comparedMoves(impact).length > 0}
          fallback={
            <Show
              when={impact.comparison.status === "compared"}
              fallback={<p>{NOT_COMPARED[notComparedReason(impact)]}</p>}
            >
              <p>
                La fecha de lo que vas a registrar cae en ese ejercicio. No mueve ninguna cifra de
                las que declaraste.
              </p>
            </Show>
          }
        >
          <p>
            {impact.by_date
              ? "Cae en ese ejercicio y mueve lo que declaraste:"
              : "Mueve lo que declaraste:"}
          </p>
          <ul class="moved-figures">
            <For each={comparedMoves(impact)}>
              {(move) => (
                <li>
                  <span>{figureName(move.figure)}</span>
                  <span class="moved-amounts">
                    <Amount value={euros(move.before)} coloured />
                    {" → "}
                    <Amount value={euros(move.after)} coloured />
                  </span>
                </li>
              )}
            </For>
          </ul>
          <p>Puede que toque presentar una complementaria.</p>
        </Show>
      </Notice>
    )}
  </For>
);
