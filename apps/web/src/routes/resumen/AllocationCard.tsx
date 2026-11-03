// «Reparto frente al objetivo» on the summary (docs/design/system.md §5.21): each asset class of
// the core as a bullet bar, its weight beside its target, so the glance answers "am I off?" without
// opening the Cartera. Percentages only: they stay with the privacy mode on.
//
// The threshold is a rule **per asset** (business rule 4); the grey band around the target of a
// class is that same width, as a reference, and the class says how many of its assets the domain
// warned about. The figures and the decision stay in the Cartera, one tap away.

import { A } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { Icon, Section } from "../../components/index.js";
import { formatDecimalString } from "../../format/number.js";
import type { WeightsView } from "../../view-models/core/index.js";
import { ClassBullets } from "../cartera/ClassBullets.jsx";

export const AllocationCard = (props: {
  view: WeightsView;
  threshold: string | undefined;
}): JSX.Element => {
  const off = (): number => props.view.classes.reduce((sum, row) => sum + row.offTargetCount, 0);
  return (
    <Section
      title="Reparto frente al objetivo"
      class="span-5 summary-allocation"
      aside={
        <A href="/cartera" class="aside-link">
          Cartera <Icon name="arrow" class="icon-sm" />
        </A>
      }
    >
      <ClassBullets view={props.view} threshold={props.threshold} />
      <p class="card-note">
        <Show when={props.threshold !== undefined} fallback="Raya: objetivo.">
          Raya: objetivo; banda: ±{formatDecimalString(props.threshold ?? "0")} pp, el umbral que se
          aplica a cada activo.
        </Show>{" "}
        {props.view.partial
          ? "Sin pesos mientras falte un precio."
          : off() === 0
            ? "Ningún activo fuera del umbral."
            : off() === 1
              ? "1 activo fuera del umbral."
              : `${off()} activos fuera del umbral.`}
      </p>
    </Section>
  );
};
