// "¿Qué puedo registrar?" — everything the user records by hand.
//
// What happens every month is one tap away, as tiles (docs/design/system.md
// §7.4): two columns on a phone, four on a wide screen. The rest — transfers
// between funds, the bucket's theses, corporate actions, the catalogue — waits
// folded underneath, each with one line about when it is used.
//
// Since feature 007 there is nothing left that only the CLI can write.

import { A } from "@solidjs/router";
import { For, type JSX } from "solid-js";
import { Disclosure, Icon, type IconName, Section } from "../../components/index.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { CORPORATE_FORMS } from "../../view-models/forms/corporate.js";
import { type EventFormSpec, FORM_SPECS } from "../../view-models/forms/index.js";
import { RequireLedger } from "../guard.jsx";

/** The day to day, with the glyph each one has in the list of movements. */
const DAILY: readonly (readonly [string, IconName])[] = [
  ["buy", "buy"],
  ["sell", "sell"],
  ["cash-in", "cashin"],
  ["cash-out", "cashout"],
  ["dividend", "dividend"],
  ["valuation", "valuation"],
  ["order", "order"],
];
const TRANSFERS = ["traspaso-solicitud", "traspaso-etapa", "traspaso"];
const BUCKET = ["tesis", "tesis-cierre"];
const CATALOGUE = ["cuenta", "activo"];

interface Entry {
  href: string;
  title: string;
  when: string;
}

const entriesOf = (slugs: readonly string[]): Entry[] =>
  FORM_SPECS.filter((spec: EventFormSpec) => slugs.includes(spec.slug)).map((spec) => ({
    href: `/registrar/${spec.slug}`,
    title: spec.title,
    when: spec.when,
  }));

const Tiles = (): JSX.Element => (
  <ul class="tiles" aria-label="Del día a día">
    <For each={DAILY}>
      {([slug, glyph]) => {
        const spec = FORM_SPECS.find((one) => one.slug === slug);
        return (
          <li>
            <A href={`/registrar/${slug}`} class="tile">
              <span class="lead" aria-hidden="true">
                <Icon name={glyph} />
              </span>
              <span class="tile-title">{spec?.title}</span>
              <span class="tile-when">{spec?.when}</span>
            </A>
          </li>
        );
      }}
    </For>
  </ul>
);

const Group = (props: { title: string; entries: readonly Entry[] }): JSX.Element => (
  <Disclosure label={props.title}>
    <ul class="rows">
      <For each={props.entries}>
        {(entry) => (
          <li>
            <A href={entry.href} class="row">
              <span class="main">
                <span class="title">{entry.title}</span>
                <span class="sub">{entry.when}</span>
              </span>
              <Icon name="chevright" class="icon-sm chev" />
            </A>
          </li>
        )}
      </For>
    </ul>
  </Disclosure>
);

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
            <section aria-labelledby="h-daily">
              <h2 id="h-daily" class="block-title">
                Del día a día
              </h2>
              <Tiles />
            </section>
            <Section title="Otros registros" class="groups">
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
              <Group title="Catálogo: cuentas y activos" entries={entriesOf(CATALOGUE)} />
            </Section>
          </div>
        </>
      )}
    </RequireLedger>
  );
}
