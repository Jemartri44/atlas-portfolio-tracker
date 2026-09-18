// The privacy switch, one tap away from every screen (FR-023). Native
// `<input type="checkbox" role="switch">`, which Pico styles as a switch
// (ADR-0017): no component library for something the platform already has.

import type { JSX } from "solid-js";
import { store } from "../ledger/state.js";

export const PrivacyToggle = (): JSX.Element => (
  <label class="row switch-inline" for="privacy">
    <input
      id="privacy"
      type="checkbox"
      role="switch"
      checked={store.privacy()}
      aria-checked={store.privacy()}
      onChange={(event) => store.setPrivacy(event.currentTarget.checked)}
      aria-label="Ocultar importes y cantidades"
    />
    <span class="tiny">{store.privacy() ? "Oculto" : "Visible"}</span>
  </label>
);
