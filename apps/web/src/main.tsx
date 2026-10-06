// Boot. **The only file with start-up effects**: the theme on the document, the
// service worker and the first load of the ledger (cloud or local, `ledger/mode.ts`). ADR-0017 asks to keep
// `createEffect`/`onMount` in a few files so Solid 2 hurts as little as
// possible, and there is no `use:` directive anywhere in `apps/web`.

import { createEffect } from "solid-js";
import { render } from "solid-js/web";
import { App } from "./App.jsx";
import { LEDGER_MODE } from "./ledger/mode.js";
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

  if (LEDGER_MODE === "cloud") {
    // The product (ADR-0035): session, then the ledger of the cloud; lazy, so the
    // boot carries only this `import()`. Nothing is read from the device.
    void import("./ledger/cloud.js").then((cloud) => {
      cloud.watchConnection();
      return cloud.bootCloud();
    });
  } else {
    // Reopen whatever ledger was open, with no click: it lives in this browser.
    void import("./ledger/actions.js").then((actions) => actions.restoreLedger());
  }
}
