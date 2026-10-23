// The privacy mode, one tap away from every screen. A **pressed or unpressed button**, not a
// switch: a pill with the crossed eye and "Oculto" when it hides, the open eye and "Visible" when
// it does not. The whole button is the 44px target; the pill it shows is 32px, so the bar stays
// light.
//
// Its accessible name does not change with the state — the pressed state is
// what a screen reader announces — so the words inside are for the eye.

import { type JSX, Show } from "solid-js";
import { Icon } from "../components/Icon.jsx";
import { privacy, setPrivacy } from "./preferences.js";

export const PrivacyToggle = (): JSX.Element => (
  <button
    type="button"
    class="privacy"
    aria-pressed={privacy()}
    aria-label="Ocultar importes y cantidades"
    onClick={() => setPrivacy(!privacy())}
  >
    <span class="pill" aria-hidden="true">
      <Show when={privacy()} fallback={<Icon name="eye" class="icon-sm" />}>
        <Icon name="eyeoff" class="icon-sm" />
      </Show>
      <span class="short">{privacy() ? "Oculto" : "Visible"}</span>
      <span class="long">{privacy() ? "Importes ocultos" : "Importes visibles"}</span>
    </span>
  </button>
);
