// The frame: status bar (narrow only), permanent degraded banner, content and
// the single navigation. No centred title band anywhere — the title of each
// screen is the first heading of its content (FR-028).

import { A } from "@solidjs/router";
import { ErrorBoundary, type JSX, Show } from "solid-js";
// Imported straight from its module, not through the barrel: the shell is on
// the boot path, and a barrel drags everything it re-exports with it — the
// shared table, the chart layer and the date picker would all be downloaded
// before the first screen paints.
import { Callout } from "../components/Callout.jsx";
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

/**
 * The last line: a screen that throws leaves the shell standing and says so.
 *
 * Without this, `<main>` came out **empty** — nothing, no message, no way back —
 * whenever a lazily loaded screen could not be fetched, which is what happens
 * to an installed PWA that lost the network before its chunk was cached
 * (measured in the review of 2026-09-18: 0 characters inside `<main>`). The
 * navigation is outside the boundary on purpose: whatever broke, the other four
 * destinations still work.
 */
const ScreenFailed = (props: { failure: unknown; retry: () => void }): JSX.Element => (
  <Callout
    tone="error"
    title="Esta pantalla no ha podido abrirse"
    action={
      <div class="row wrap">
        <button type="button" onClick={() => props.retry()}>
          Reintentar
        </button>
        <button type="button" class="secondary" onClick={() => window.location.reload()}>
          Recargar la aplicación
        </button>
      </div>
    }
  >
    El libro no se ha tocado: esto es un fallo de la propia pantalla. Si acabas de perder la
    conexión, recarga cuando vuelvas a tenerla.
    <Show when={props.failure instanceof Error}>
      <p class="tiny flush">{(props.failure as Error).message}</p>
    </Show>
  </Callout>
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
    <main id="contenido">
      <ErrorBoundary
        fallback={(failure, reset) => <ScreenFailed failure={failure} retry={reset} />}
      >
        {props.children}
      </ErrorBoundary>
    </main>
    <Nav />
  </div>
);
