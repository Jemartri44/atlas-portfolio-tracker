// Boot. **The only file with start-up effects**: the theme on the document, the
// service worker and the first load of the ledger. ADR-0017 asks to keep
// `createEffect`/`onMount` in a few files so Solid 2 hurts as little as
// possible, and there is no `use:` directive anywhere in `apps/web`.

import { createEffect } from "solid-js";
import { render } from "solid-js/web";
import { App } from "./App.jsx";
import { restoreLedger } from "./ledger/actions.js";
import { store } from "./ledger/state.js";
import { applyTheme } from "./shell/theme.js";
import "./styles/index.css";

const root = document.querySelector("#app");

if (root !== null) {
  render(() => {
    // The theme follows the system unless the user forced one: the tokens and
    // the colour of the browser's bar follow it too (`shell/theme.ts`).
    createEffect(() => applyTheme(document, store.theme()));
    return <App />;
  }, root);

  // Reopen whatever ledger was open, with no click: it lives in this browser.
  void restoreLedger();
}
