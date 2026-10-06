// Where the data lives, on every screen (FR-011): in the cloud of Atlas, and
// nothing else (ADR-0035). The device keeps no copy, so there is no age and no
// reminder to export: the chip only says where the ledger is, and leads to
// Ajustes, where the copy can be downloaded.

import { type JSX, Show } from "solid-js";
import { Icon } from "../components/Icon.jsx";
import { sourceShortLabel } from "../ledger/source.js";
import { store } from "../ledger/state.js";

/** The cloud ledger: nothing to export and no age, only where it lives. */
const CLOUD_DETAIL = "Tus datos viven en la nube de Atlas: este dispositivo no guarda el libro.";

export const LedgerChip = (): JSX.Element => (
  <Show when={store.source()}>
    {(source) => (
      // A plain link: the router still handles it, but it does not mark it as
      // the current page, which on /ajustes is the settings button's job.
      <a href="/ajustes" class="source" title={CLOUD_DETAIL}>
        <Icon name="browser" class="icon-sm source-icon" />
        <span class="where">{sourceShortLabel(source())}</span>
      </a>
    )}
  </Show>
);
