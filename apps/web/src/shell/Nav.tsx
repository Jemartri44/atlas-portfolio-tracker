// **The** navigation (docs/design/system.md §4.2). One element, one list: a
// bar at the bottom of a phone or a tablet, with Registrar in the middle under
// the thumb, and from 75rem a group of four destinations in the top bar with
// Registrar as the primary button after it. There is no second copy in the
// DOM, so "never two navigations" is structural and not a promise.
//
// The list is written in the order the eye reads it at each width, so the
// keyboard walks it in that same order: CSS could move Registrar to the middle,
// but not the Tab key. Settings are not a destination: they live in the status
// area of the header, touched once a month.
//
// A destination is current on its own page **and on every page under it**: the
// detail of a movement, its correction or a form of Registrar still belong to
// their section, and the bar has to say where the user is (review of
// 2026-09-19). The router only marks the exact page, so the mark is ours. The
// links are plain anchors, which the router still handles.

import { useLocation } from "@solidjs/router";
import { For, type JSX } from "solid-js";
import { Icon, type IconName } from "../components/Icon.jsx";
import { mediaQuery, TOP_BAR } from "./media.js";

interface Destination {
  href: string;
  label: string;
  icon: IconName;
  end?: boolean;
  action?: boolean;
}

const SUMMARY: Destination = { href: "/", label: "Resumen", icon: "summary", end: true };
const MOVEMENTS: Destination = { href: "/movimientos", label: "Movimientos", icon: "movements" };
const PORTFOLIO: Destination = { href: "/cartera", label: "Cartera", icon: "portfolio" };
const BUCKET: Destination = { href: "/cubo", label: "Cubo", icon: "bucket" };
const RECORD: Destination = { href: "/registrar", label: "Registrar", icon: "plus", action: true };

/** Narrow: Registrar in the middle. Wide: after the group of four. */
const NARROW = [SUMMARY, MOVEMENTS, RECORD, PORTFOLIO, BUCKET];
const WIDE = [SUMMARY, MOVEMENTS, PORTFOLIO, BUCKET, RECORD];

/** Whether a path is a destination's page or one under it. */
export const inSection = (path: string, href: string, end = false): boolean => {
  const clean = path.replace(/\/+$/, "") || "/";
  return clean === href || (!end && clean.startsWith(`${href}/`));
};

const Item = (props: { destination: Destination }): JSX.Element => {
  const location = useLocation();
  const current = (): "page" | undefined =>
    inSection(location.pathname, props.destination.href, props.destination.end)
      ? "page"
      : undefined;
  return props.destination.action === true ? (
    <li class="nav-action-item">
      <a
        href={props.destination.href}
        class="nav-action"
        aria-label="Registrar una operación"
        aria-current={current()}
      >
        <span class="plate">
          <Icon name="plus" class="nav-glyph" />
        </span>
        <span class="nav-label">{props.destination.label}</span>
      </a>
    </li>
  ) : (
    <li>
      <a href={props.destination.href} class="nav-link" aria-current={current()}>
        <span class="indicator">
          <Icon name={props.destination.icon} class="nav-glyph" />
        </span>
        <span class="nav-label">{props.destination.label}</span>
      </a>
    </li>
  );
};

export const Nav = (): JSX.Element => {
  const wide = mediaQuery(TOP_BAR);
  return (
    <nav class="nav" aria-label="Secciones">
      <ul class="nav-list">
        <For each={wide() ? WIDE : NARROW}>
          {(destination) => <Item destination={destination} />}
        </For>
      </ul>
    </nav>
  );
};
