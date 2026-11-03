// The return after tax, beside the one before: loaded on demand, because it reads the tax engine of
// every closed year (`@atlas/domain/fiscal`), which the Cartera does not need to paint. A load that
// fails (a chunk gone after a deploy, the network) says so on its line and leaves the page alone;
// while a new date is computed, the figure of the old one is not shown beside it.

import type { LedgerEvent } from "@atlas/domain";
import { createResource, type JSX, Show } from "solid-js";
import { Amount, Figure, StatLine } from "../../components/index.js";
import { type AfterTaxView, afterTaxView } from "../../view-models/core/after-tax.js";

type Loaded = { view: AfterTaxView | undefined } | { failed: true };

const load = async ([events, to]: readonly [readonly LedgerEvent[], string]): Promise<Loaded> => {
  try {
    const { coreXirrAfterTax } = await import("@atlas/domain/fiscal");
    return { view: afterTaxView(coreXirrAfterTax(events, to), to) };
  } catch {
    return { failed: true };
  }
};

const LABEL = "Rentabilidad anual después de impuestos (estimación)";

const Lines = (props: { after: AfterTaxView }): JSX.Element => (
  <>
    <StatLine label={LABEL}>
      <Show
        when={props.after.xirrPct}
        fallback={<span class="nodata">{props.after.gap || "sin cifra"}</span>}
      >
        <Figure value={props.after.xirrPct} unit="percent" decimals={1} signed coloured />
      </Show>
    </StatLine>
    <Show when={props.after.tax}>
      {(tax) => (
        <>
          <StatLine label="Impuestos estimados de la cartera principal">
            <Amount value={tax()} />
          </StatLine>
          <p class="card-note">
            Después de impuestos: lo que la cartera añade a tu Renta estimada de cada año cerrado,
            el día que la pagaste o, si no lo has apuntado, el 30/06 siguiente (si aún no ha
            llegado, cuenta como debido hoy). Lo pagado por la Renta no se resta, porque incluye el
            resto de tus ingresos.
            <Show when={props.after.openYear}>
              {(year) => <> Sin el impuesto de {year()}, que se calcula al cerrar el año.</>}
            </Show>
          </p>
        </>
      )}
    </Show>
  </>
);

export const AfterTaxLines = (props: {
  events: readonly LedgerEvent[];
  to: string;
}): JSX.Element => {
  const [loaded] = createResource(() => [props.events, props.to] as const, load);
  // Only a settled value for the date on screen: while refreshing, the old one would sit beside
  // the rate before of the new date.
  const settled = (): Loaded | undefined => (loaded.state === "ready" ? loaded() : undefined);
  return (
    <Show
      when={settled()}
      keyed
      fallback={
        <StatLine label={LABEL}>
          <span class="nodata">calculando…</span>
        </StatLine>
      }
    >
      {(outcome) =>
        "failed" in outcome ? (
          <StatLine label={LABEL}>
            <span class="nodata">sin cifra: no se ha podido calcular; recarga la página</span>
          </StatLine>
        ) : (
          <Show when={outcome.view}>{(after) => <Lines after={after()} />}</Show>
        )
      }
    </Show>
  );
};
