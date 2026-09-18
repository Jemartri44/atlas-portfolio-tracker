// "¿Qué puedo registrar?" — everything the user records by hand, each with one
// line about when it is used.
//
// Since feature 007 there is nothing left that only the CLI can write:
// corporate actions, transfers and theses have their own forms here.

import { A } from "@solidjs/router";
import { For, type JSX } from "solid-js";
import { Section } from "../../components/index.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { CORPORATE_FORMS } from "../../view-models/forms/corporate.js";
import { type EventFormSpec, FORM_SPECS } from "../../view-models/forms/index.js";
import { RequireLedger } from "../guard.jsx";

const OPERATIONS = ["buy", "sell", "cash-in", "cash-out", "dividend", "valuation", "order"];
const TRANSFERS = ["traspaso-solicitud", "traspaso-etapa", "traspaso"];
const BUCKET = ["tesis", "tesis-cierre"];
const CATALOGUE = ["cuenta", "activo"];

interface Entry {
  href: string;
  title: string;
  when: string;
}

const Group = (props: { title: string; entries: readonly Entry[] }): JSX.Element => (
  <Section title={props.title}>
    <div class="datalist">
      <For each={props.entries}>
        {(entry) => (
          <A href={entry.href} class="item">
            <span class="head">
              <span class="title">{entry.title}</span>
            </span>
            <span class="sub">{entry.when}</span>
          </A>
        )}
      </For>
    </div>
  </Section>
);

const entriesOf = (slugs: readonly string[]): Entry[] =>
  FORM_SPECS.filter((spec: EventFormSpec) => slugs.includes(spec.slug)).map((spec) => ({
    href: `/registrar/${spec.slug}`,
    title: spec.title,
    when: spec.when,
  }));

export default function RegistrarRoute(): JSX.Element {
  return (
    <RequireLedger writes skeleton={5}>
      {() => (
        <>
          <PageHeader
            title="Registrar"
            lead="Cada operación se hace a mano en la plataforma y se anota aquí. Verás el efecto antes de escribir nada."
          />

          <div class="stack">
            <Group title="Operaciones" entries={entriesOf(OPERATIONS)} />
            <Group title="Traspasos entre fondos" entries={entriesOf(TRANSFERS)} />
            <Group title="Cubo especulativo" entries={entriesOf(BUCKET)} />
            <Group
              title="Eventos corporativos"
              entries={CORPORATE_FORMS.map((form) => ({
                href: `/registrar/evento-corporativo/${form.slug}`,
                title: form.title,
                when: form.when,
              }))}
            />
            <Group title="Catálogo" entries={entriesOf(CATALOGUE)} />
          </div>
        </>
      )}
    </RequireLedger>
  );
}
