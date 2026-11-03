// The return after tax, beside the one before: loaded on demand, because it reads the tax engine of
// every closed year (`@atlas/domain/fiscal`), which the Cartera does not need to paint.

import type { LedgerEvent } from "@atlas/domain";
import { createResource, type JSX, Show } from "solid-js";
import { Amount, Figure, StatLine } from "../../components/index.js";
import { afterTaxView } from "../../view-models/core/after-tax.js";

const load = async ([events, to]: readonly [readonly LedgerEvent[], string]) => {
  const { coreXirrAfterTax } = await import("@atlas/domain/fiscal");
  return afterTaxView(coreXirrAfterTax(events, to), to);
};

export const AfterTaxLines = (props: {
  events: readonly LedgerEvent[];
  to: string;
}): JSX.Element => {
  const [view] = createResource(() => [props.events, props.to] as const, load);
  return (
    <Show when={view()}>
      {(after) => (
        <>
          <StatLine label="Rentabilidad anual después de impuestos (estimación)">
            <Show
              when={after().xirrPct}
              fallback={<span class="nodata">{after().gap || "sin cifra"}</span>}
            >
              <Figure value={after().xirrPct} unit="percent" decimals={1} signed coloured />
            </Show>
          </StatLine>
          <Show when={after().tax}>
            {(tax) => (
              <StatLine label="Impuestos estimados de la cartera principal">
                <Amount value={tax()} />
              </StatLine>
            )}
          </Show>
          <p class="card-note">
            Después de impuestos: lo que la cartera añade a tu Renta estimada de cada año cerrado,
            el día que la pagaste o el 30/06 siguiente; lo pagado por la Renta no se resta, porque
            incluye el resto de tus ingresos.
            <Show when={after().openYear}>
              {(year) => <> Sin el impuesto de {year()}, que se calcula al cerrar el año.</>}
            </Show>
          </p>
        </>
      )}
    </Show>
  );
};
