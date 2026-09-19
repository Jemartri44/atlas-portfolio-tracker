// The icon set: inline SVG, one 24px grid, one stroke width, round caps
// (docs/design/system.md). Nothing remote, no font, no sprite file: each icon
// is a few static shapes written into the element (constitution, security).
//
// The shapes are trusted constants of this module, never data, which is why
// writing them with `innerHTML` is safe here and nowhere else.

import type { JSX } from "solid-js";

const SHAPES = {
  summary:
    '<path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="M12 16.5 15.5 11"/><path d="M3.5 20h17"/>',
  movements:
    '<path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" stroke-width="2.6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  portfolio:
    '<path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12z"/><path d="M15 3.9a8.5 8.5 0 0 1 5.1 5.1H15z"/>',
  bucket:
    '<path d="M9 3.5h6"/><path d="M10 3.5v6L5 18.2a1.8 1.8 0 0 0 1.6 2.8h10.8a1.8 1.8 0 0 0 1.6-2.8L14 9.5v-6"/><path d="M7.3 14.5h9.4"/>',
  settings:
    '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  eyeoff:
    '<path d="M3.5 3.5l17 17"/><path d="M10.6 5.6c.5-.1.9-.1 1.4-.1 6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-2.9 3.7M6.6 6.6A16.5 16.5 0 0 0 2.5 12S6 18.5 12 18.5c1.8 0 3.4-.6 4.8-1.4"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
  browser:
    '<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9h18"/><path d="M6.2 6.8h.01M8.7 6.8h.01" stroke-width="2.2"/>',
  laptop: '<rect x="4.5" y="5" width="15" height="10.5" rx="1.5"/><path d="M2.5 19h19"/>',
  caution:
    '<path d="M10.3 4.3 2.9 17.6A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-2.9L13.7 4.3a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4M12 16.8h.01" stroke-width="2.2"/>',
  danger:
    '<path d="M8.3 3.5h7.4l4.8 4.8v7.4l-4.8 4.8H8.3l-4.8-4.8V8.3z"/><path d="M12 8v5M12 16.2h.01" stroke-width="2.2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 7.8h.01" stroke-width="2.2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  chevright: '<path d="M9.5 6l6 6-6 6"/>',
  chevdown: '<path d="M6 9.5l6 6 6-6"/>',
  arrow: '<path d="M5 12h14M13.5 6.5 19 12l-5.5 5.5"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  buy: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5"/><path d="M5 20h14"/>',
  sell: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M5 20h14"/>',
  dividend:
    '<ellipse cx="12" cy="7" rx="7" ry="2.8"/><path d="M5 7v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V7"/><path d="M5 12v5c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8v-5"/>',
  valuation:
    '<path d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7z"/><circle cx="8.2" cy="8.2" r="1.4"/>',
  cash: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><path d="M15 14.5h2.5"/>',
  transfer: '<path d="M4 8h13M13.5 4.5 17 8l-3.5 3.5"/><path d="M20 16H7M10.5 12.5 7 16l3.5 3.5"/>',
  export:
    '<path d="M12 14.5V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 14v4.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V14"/>',
  import:
    '<path d="M12 4v10.5M7.5 10 12 14.5 16.5 10"/><path d="M4.5 14v4.5a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V14"/>',
  globe:
    '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.3 2.4 3.5 5.2 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.2-3.5-8.5s1.2-6.1 3.5-8.5z"/>',
  half: '<circle cx="12" cy="12" r="7.5"/><path d="M12 4.5a7.5 7.5 0 0 1 0 15z" fill="currentColor" stroke="none"/>',
  reversed: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  flask:
    '<path d="M9 3.5h6"/><path d="M10 3.5v6L5 18.2a1.8 1.8 0 0 0 1.6 2.8h10.8a1.8 1.8 0 0 0 1.6-2.8L14 9.5v-6"/>',
  corporate: '<path d="M4 20.5V9l8-5 8 5v11.5"/><path d="M9 20.5v-6h6v6"/><path d="M3 20.5h18"/>',
  order: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12h4"/>',
  catalogue: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  shield: '<path d="M12 3.5 5 6v5.5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
} as const;

export type IconName = keyof typeof SHAPES;

interface IconProps {
  name: IconName;
  /** Size class: `icon` (20), `icon-sm` (16) or `icon-lg` (24), plus any extra. */
  class?: string | undefined;
}

export const Icon = (props: IconProps): JSX.Element => (
  <svg
    class={props.class ?? "icon"}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    innerHTML={SHAPES[props.name]}
  />
);
