// "¿Qué puedo registrar?" — the nine things the user records by hand, each with
// one line about when it is used. What is not here (corporate actions,
// transfers, theses) is registered from the CLI and says so, instead of
// pretending it does not exist.

import { A } from "@solidjs/router";
import { For, type JSX } from "solid-js";
import { Callout } from "../../components/index.js";
import { PageHeader } from "../../shell/PageHeader.jsx";
import { FORM_SPECS } from "../../view-models/forms/index.js";
import { RequireLedger } from "../guard.jsx";

const OPERATIONS = ["buy", "sell", "cash-in", "cash-out", "dividend", "valuation", "order"];

export default function RegistrarRoute(): JSX.Element {
  const group = (slugs: readonly string[]) =>
    FORM_SPECS.filter((spec) => slugs.includes(spec.slug));

  return (
    <RequireLedger writes skeleton={5}>
      {() => (
        <>
          <PageHeader
            title="Registrar"
            lead="Cada operación se hace a mano en la plataforma y se anota aquí. Verás el efecto antes de escribir nada."
          />

          <div class="stack">
            <section class="card">
              <header>
                <h2>Operaciones</h2>
              </header>
              <div class="datalist">
                <For each={group(OPERATIONS)}>
                  {(spec) => (
                    <A href={`/registrar/${spec.slug}`} class="item">
                      <span class="head">
                        <span class="title">{spec.title}</span>
                      </span>
                      <span class="sub">{spec.when}</span>
                    </A>
                  )}
                </For>
              </div>
            </section>

            <section class="card">
              <header>
                <h2>Catálogo</h2>
              </header>
              <div class="datalist">
                <For each={group(["cuenta", "activo"])}>
                  {(spec) => (
                    <A href={`/registrar/${spec.slug}`} class="item">
                      <span class="head">
                        <span class="title">{spec.title}</span>
                      </span>
                      <span class="sub">{spec.when}</span>
                    </A>
                  )}
                </For>
              </div>
            </section>

            <Callout tone="info" title="Lo que todavía se registra desde la CLI">
              Los eventos corporativos (<em>splits</em>, canjes, liquidaciones), los traspasos entre
              fondos y las tesis del cubo tienen asistentes propios en <code>atlas</code> y llegarán
              a la web en la versión siguiente. Leerlos aquí ya funciona: aparecen en Movimientos
              como cualquier otro evento.
            </Callout>
          </div>
        </>
      )}
    </RequireLedger>
  );
}
