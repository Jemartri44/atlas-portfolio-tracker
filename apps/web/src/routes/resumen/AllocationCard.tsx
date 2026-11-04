// «Reparto frente al objetivo» on the summary (docs/design/system.md §5.21): each asset class of
// the core as a bullet bar, its weight beside its target, so the glance answers "am I off?" without
// opening the Cartera. Percentages only: they stay with the privacy mode on. On a phone it folds
// with what it warns of in sight.
//
// The threshold is a rule **per asset** (business rule 4); the grey band around the target of a
// class is that same width, as a reference, and the class says how many of its assets the domain
// warned about. The figures and the decision stay in the Cartera, one tap away.

import { A } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { FoldSection, Icon } from "../../components/index.js";
import { formatDecimalString } from "../../format/number.js";
import type { WeightsView } from "../../view-models/core/index.js";
import { ClassBullets } from "../cartera/ClassBullets.jsx";

const offText = (off: number, inside: string): string =>
  off === 0 ? inside : off === 1 ? "1 activo fuera de umbral" : `${off} activos fuera de umbral`;

export const AllocationCard = (props: {
  view: WeightsView;
  threshold: string | undefined;
}): JSX.Element => {
  const off = (): number => props.view.classes.reduce((sum, row) => sum + row.offTargetCount, 0);
  const below = (): number => props.view.classes.filter((row) => row.belowMinimum).length;
  const folded = (): string =>
    props.view.partial
      ? "Sin pesos: falta un precio"
      : offText(
          off(),
          below() === 0
            ? "Ningún activo fuera de umbral"
            : below() === 1
              ? "1 tipo bajo el mínimo"
              : `${below()} tipos bajo el mínimo`,
        );
  return (
    <FoldSection
      title="Reparto frente al objetivo"
      summary={folded()}
      class="summary-allocation"
      aside={
        <A href="/cartera" class="aside-link">
          Cartera <Icon name="arrow" class="icon-sm" />
        </A>
      }
    >
      <ClassBullets view={props.view} threshold={props.threshold} />
      <p class="card-note">
        <Show when={props.threshold !== undefined} fallback="Raya: objetivo.">
          Raya: objetivo; banda: ±{formatDecimalString(props.threshold ?? "0")} pp.
        </Show>{" "}
        {props.view.partial
          ? "Sin pesos mientras falte un precio."
          : `${offText(off(), "Ningún activo fuera de umbral")}.`}
      </p>
    </FoldSection>
  );
};
