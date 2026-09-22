// The one disclosure of the application (docs/design/system.md §5.11): a
// native `<details>` whose summary is a real 44px row with a chevron that
// turns. "Ver activo por activo", "Ver los datos de la gráfica", "Más datos",
// "Detalle técnico": all of them look and behave the same.

import type { JSX } from "solid-js";
import { Icon } from "./Icon.jsx";

interface DisclosureProps {
  label: JSX.Element;
  children: JSX.Element;
  open?: boolean | undefined;
  /** Extra classes on the `<details>`, for where it sits. */
  class?: string | undefined;
}

export const Disclosure = (props: DisclosureProps): JSX.Element => (
  <details class={`disclosure ${props.class ?? ""}`.trimEnd()} open={props.open}>
    <summary>
      <span>{props.label}</span>
      <Icon name="chevdown" class="icon-sm chev" />
    </summary>
    <div class="disclosure-body">{props.children}</div>
  </details>
);
