// The return laid out by box, to read beside Renta WEB.
//
// The calm notice of a year with no checked mapping is the point of the whole
// card: the Modelo 100 is renumbered every campaign,
// so a number inherited from another year would be a believable, wrong figure
// typed into a real return. The figures are still shown, by concept, and the
// card says plainly that it has no numbers for that year.

import { For, type JSX, Show } from "solid-js";
import { Amount, Disclosure, Icon, Notice, Section } from "../../components/index.js";
import type { BoxesView, BoxRowView } from "../../view-models/fiscal/index.js";

const Value = (props: { row: BoxRowView }): JSX.Element => (
  <Show when={!props.row.missing} fallback={<span class="box-missing">No está en tus datos</span>}>
    <Show when={props.row.text} fallback={<Amount value={props.row.amount_eur} />}>
      {(text) => <span class="box-text">{text()}</span>}
    </Show>
  </Show>
);

/**
 * The package of the year, to keep, attach or type from: the boxes, the lots
 * behind each sale and where each figure comes from, as a CSV file; and the
 * same card on paper, through the browser's own print, with every block open.
 */
const PackageActions = (props: { onDownload: () => void }): JSX.Element => {
  let row: HTMLDivElement | undefined;
  const print = (): void => {
    const card = row?.closest(".card");
    const blocks = [...(card?.querySelectorAll("details") ?? [])];
    const closed = blocks.filter((block) => !block.open);
    for (const block of closed) {
      block.open = true;
    }
    // The print sheet keeps only the card marked as the one being printed (`styles/layout.css`).
    card?.classList.add("is-printing");
    // On a phone `print()` returns before the sheet is laid out: the page is
    // put back only when the browser says the printing is over.
    window.addEventListener(
      "afterprint",
      () => {
        card?.classList.remove("is-printing");
        for (const block of closed) {
          block.open = false;
        }
      },
      { once: true },
    );
    window.print();
  };
  return (
    <div class="button-row no-print" ref={row}>
      <button type="button" class="secondary" onClick={() => props.onDownload()}>
        <Icon name="export" class="icon-sm" />
        Descargar el paquete (CSV)
      </button>
      <button type="button" class="secondary" onClick={print}>
        Imprimir o guardar en PDF
      </button>
    </div>
  );
};

export const BoxesCard = (props: { view: BoxesView; onDownload?: () => void }): JSX.Element => (
  <Section
    title="Tu declaración por casillas"
    class="span-12"
    aside={<span class="scope">Ejercicio {props.view.year}</span>}
  >
    <Show when={props.onDownload}>
      {(onDownload) => <PackageActions onDownload={onDownload()} />}
    </Show>
    <Show
      when={props.view.checked}
      fallback={
        <Notice severity="info" title="Este ejercicio va por conceptos, sin números de casilla">
          Las casillas del Modelo 100 se renumeran cada campaña y las de {props.view.year} no están
          comprobadas en el formulario oficial. Aquí tienes los mismos importes por concepto: nunca
          se usa la casilla de otro ejercicio.
        </Notice>
      }
    >
      <Show when={props.view.source}>
        {(source) => (
          <p class="card-note">
            Casillas comprobadas en {source().document}. Si quieres verlas en el original, están en
            el anexo que publica el BOE.
          </p>
        )}
      </Show>
    </Show>

    <For each={props.view.blocks}>
      {(block) => (
        <Disclosure label={<span class="group-head">{block.title}</span>}>
          <Show when={block.some_without_box}>
            <p class="card-note">
              Algunas de estas filas no tienen casilla comprobada en el formulario de{" "}
              {props.view.year}: van por concepto, sin número.
            </p>
          </Show>
          <Show when={block.sources.length > 0}>
            <p class="card-note box-sources">
              Estos números y sus rótulos se leyeron en el anexo oficial:{" "}
              <For each={block.sources}>
                {(source, index) => (
                  <>
                    {index() > 0 ? " · " : ""}
                    <span class="box-source">
                      pág. {source.page}, {source.url}
                    </span>
                  </>
                )}
              </For>
            </p>
          </Show>
          <ul class="boxes">
            <For each={block.rows}>
              {(row) => (
                <li class="box-row">
                  <span class="box-main">
                    <span class="box-label">{row.name}</span>
                    <Show when={row.operation}>
                      {(operation) => <span class="box-op">{operation()}</span>}
                    </Show>
                    <Show when={row.label}>
                      {(label) => <span class="box-official">{label()}</span>}
                    </Show>
                    <Show when={row.checked}>
                      {(checked) => <span class="box-official">{checked()}</span>}
                    </Show>
                    <Show when={row.partial}>
                      {(partial) => <span class="box-partial">Ojo: {partial()}</span>}
                    </Show>
                  </span>
                  <span class="box-figs">
                    <Show when={row.box}>{(box) => <span class="box-number">{box()}</span>}</Show>
                    <Value row={row} />
                  </span>
                </li>
              )}
            </For>
          </ul>
        </Disclosure>
      )}
    </For>
  </Section>
);
