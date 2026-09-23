// The return laid out by box, to read beside Renta WEB.
//
// The calm notice of a year with no checked mapping is the point of the whole
// card (prompt 010, decision (e)): the Modelo 100 is renumbered every campaign,
// so a number inherited from another year would be a believable, wrong figure
// typed into a real return. The figures are still shown, by concept, and the
// card says plainly that it has no numbers for that year.

import { For, type JSX, Show } from "solid-js";
import { Amount, Disclosure, Notice, Section } from "../../components/index.js";
import type { BoxesView, BoxRowView } from "../../view-models/fiscal/index.js";

const Value = (props: { row: BoxRowView }): JSX.Element => (
  <Show when={!props.row.missing} fallback={<span class="box-missing">No está en tus datos</span>}>
    <Show when={props.row.text} fallback={<Amount value={props.row.amount_eur} />}>
      {(text) => <span class="box-text">{text()}</span>}
    </Show>
  </Show>
);

export const BoxesCard = (props: { view: BoxesView }): JSX.Element => (
  <Section
    title="Tu declaración por casillas"
    class="span-12"
    aside={<span class="scope">Ejercicio {props.view.year}</span>}
  >
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
          <ul class="boxes">
            <For each={block.rows}>
              {(row) => (
                <li class="box-row">
                  <span class="box-main">
                    <span class="box-label">{row.label ?? "Sin correspondencia comprobada"}</span>
                    <Show when={row.operation}>
                      {(operation) => <span class="box-op">{operation()}</span>}
                    </Show>
                    <Show when={row.partial}>
                      {(partial) => <span class="box-partial">Ojo: {partial()}</span>}
                    </Show>
                    <Show when={row.form_eur}>
                      {(form) => (
                        <span class="box-partial">
                          El formulario sumará <Amount value={form()} /> a partir de lo que teclees.
                        </span>
                      )}
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
