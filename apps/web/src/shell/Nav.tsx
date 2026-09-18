// **The** navigation. One element, one list of links, two shapes: a bottom bar
// under 768px and a side rail from there up, switched by CSS alone
// (`styles/layout.css`). There is no second copy in the DOM, so "never both at
// once" is structural rather than a promise (decision (e)).
//
// Four destinations of equal standing plus the **action** of recording, which
// is not a destination: on the phone it sits in the middle, where the thumb
// is; on the desktop it becomes the primary button at the top of the rail.
// Settings do not take a thumb slot — they are touched once a month and live in
// the status bar (narrow) or the rail footer (wide).

import { A } from "@solidjs/router";
import type { JSX } from "solid-js";
import { LedgerChip } from "./LedgerChip.jsx";
import { PrivacyToggle } from "./PrivacyToggle.jsx";

/** Inline icons: no icon font, no sprite, nothing remote (constitution, security). */
const Icon = (props: { path: string }): JSX.Element => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
    <path d={props.path} stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

const ICONS = {
  summary: "M4 13h5v7H4zM10 4h5v16h-5zM16 9h4v11h-4z",
  movements: "M4 7h16M4 12h10M4 17h13",
  plus: "M12 5v14M5 12h14",
  core: "M12 3a9 9 0 1 0 9 9h-9z",
  bucket: "M5 7h14l-1.5 12h-11zM9 7V5a3 3 0 0 1 6 0v2",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12c0-.5 0-1-.1-1.4l1.7-1.3-1.7-3-2 .8a7 7 0 0 0-2.4-1.4L14.2 3H9.8l-.3 2.7a7 7 0 0 0-2.4 1.4l-2-.8-1.7 3L5.1 10.6c-.1.4-.1.9-.1 1.4s0 1 .1 1.4l-1.7 1.3 1.7 3 2-.8a7 7 0 0 0 2.4 1.4l.3 2.7h4.4l.3-2.7a7 7 0 0 0 2.4-1.4l2 .8 1.7-3-1.7-1.3c.1-.4.1-.9.1-1.4z",
} as const;

export const Nav = (): JSX.Element => (
  <nav class="nav" aria-label="Secciones">
    <ul>
      <li>
        <A href="/" end>
          <Icon path={ICONS.summary} />
          <span class="label">Resumen</span>
        </A>
      </li>
      <li>
        <A href="/movimientos">
          <Icon path={ICONS.movements} />
          <span class="label">Movimientos</span>
        </A>
      </li>
      <li class="action-item">
        <A href="/registrar" class="action" aria-label="Registrar una operación">
          <span class="pill">
            <Icon path={ICONS.plus} />
          </span>
          <span class="label">Registrar</span>
        </A>
      </li>
      <li>
        <A href="/nucleo">
          <Icon path={ICONS.core} />
          <span class="label">Núcleo</span>
        </A>
      </li>
      <li>
        <A href="/cubo">
          <Icon path={ICONS.bucket} />
          <span class="label">Cubo</span>
        </A>
      </li>
    </ul>
    {/* Wide layout only: what the status bar carries on a phone. */}
    <div class="rail-footer">
      <LedgerChip />
      <PrivacyToggle />
      <A href="/ajustes" class="row" style={{ "text-decoration": "none" }}>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          aria-hidden="true"
          style={{ height: "1.25rem", width: "1.25rem" }}
        >
          <path d={ICONS.settings} stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span>Ajustes</span>
      </A>
    </div>
  </nav>
);

export { ICONS };
