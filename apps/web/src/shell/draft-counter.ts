// The counter of drafts in the frame (feature 012, block 5; in the cloud since
// feature 027): visible on every screen while one is pending, and a way to the
// list. It is of the ECB, so it arrives in a chunk of its own, **after** the
// first paint (decision (r) of prompt 012): the frame keeps an empty place and
// imports this lazily.
//
// Plain DOM and not a Solid component, on purpose: a lazily loaded component
// here made the bundler move Solid itself into a chunk of its own on the boot
// path (measured: +0,6 KB gzip before the first screen). The link is an
// ordinary `<a>`, which the router handles like every other.
//
// Drafts are read from the cloud, so nothing is asked before the ledger is
// there (no session, no count) and a count that cannot be read paints nothing.

import { createEffect, createRoot } from "solid-js";
import { countOf } from "../format/number.js";
import { countDrafts, DRAFTS_CHANGED } from "../ledger/draft-store.js";
import { store } from "../ledger/state.js";

/** The clock of the icon set (`Icon.tsx`): a trusted constant, never data. */
const CLOCK =
  '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>';

const paint = (slot: HTMLElement, total: number): void => {
  slot.replaceChildren();
  if (total === 0) {
    return;
  }
  // The classes of the chip beside it, in the colour of its warning: the
  // counter costs the boot stylesheet nothing.
  const link = document.createElement("a");
  link.href = "/registrar/borradores";
  link.className = "source";
  // The chip beside it gives way on a narrow bar; the count never does (a
  // "2" clipped to half was measured at 400 px). Set through the CSSOM, which
  // the policy of styles allows, so the boot stylesheet does not grow.
  link.style.flexShrink = "0";
  const said = countOf(total, "borrador pendiente", "borradores pendientes");
  link.title = `${said}: no cuentan en ninguna cifra hasta que los registras.`;
  link.setAttribute("aria-label", said);
  const age = document.createElement("span");
  age.className = "age is-overdue";
  age.innerHTML = CLOCK;
  age.append(String(total));
  link.append(age);
  slot.append(link);
};

/** Fills the place the frame kept, and keeps it current while it is on the page. */
export const mountDraftCounter = (slot: HTMLElement): void => {
  // The latest answer wins: a slow one never paints over a newer one.
  let asked = 0;
  createRoot((dispose) => {
    const read = (): void => {
      // Painted once and since gone from the page (the frame was replaced): stop.
      if (!slot.isConnected && slot.childNodes.length > 0) {
        window.removeEventListener(DRAFTS_CHANGED, read);
        dispose();
        return;
      }
      asked += 1;
      const mine = asked;
      if (store.load().phase !== "ready") {
        slot.replaceChildren();
        return;
      }
      void countDrafts().then((total) => {
        if (asked === mine) {
          paint(slot, total ?? 0);
        }
      });
    };
    // Re-read whenever the ledger changes (it is read again after every write
    // and every phase change), and when a screen says the drafts changed.
    createEffect(() => {
      store.load();
      read();
    });
    window.addEventListener(DRAFTS_CHANGED, read);
  });
};
