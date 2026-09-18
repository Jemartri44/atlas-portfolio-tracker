// The frame: status bar (narrow only), permanent degraded banner, content and
// the single navigation. No centred title band anywhere — the title of each
// screen is the first heading of its content (FR-028).

import { A } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { store } from "../ledger/state.js";
import { LedgerChip } from "./LedgerChip.jsx";
import { ICONS, Nav } from "./Nav.jsx";
import { PrivacyToggle } from "./PrivacyToggle.jsx";

const DegradedBanner = (): JSX.Element => (
  <Show when={store.invalidCount() > 0}>
    <aside class="degraded" role="status">
      <span>
        {store.invalidCount()}{" "}
        {store.invalidCount() === 1 ? "evento inválido" : "eventos inválidos"} en el libro: se puede
        consultar, no registrar.
      </span>
      <A href="/ajustes/verificacion">Verificar</A>
    </aside>
  </Show>
);

export const AppShell = (props: { children?: JSX.Element }): JSX.Element => (
  <div class="shell">
    <a href="#contenido" class="skip-link">
      Ir al contenido
    </a>
    <header class="statusbar">
      <LedgerChip />
      <div class="actions">
        <PrivacyToggle />
        <A href="/ajustes" class="icon-button" aria-label="Ajustes">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            aria-hidden="true"
          >
            <path d={ICONS.settings} stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </A>
      </div>
    </header>
    <DegradedBanner />
    <main id="contenido">{props.children}</main>
    <Nav />
  </div>
);
