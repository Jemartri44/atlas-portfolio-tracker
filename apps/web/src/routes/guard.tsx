// The gate every screen that needs the ledger goes through, so the states are written once: loading
// shows the shape of what is coming, and a degraded ledger blocks **writing** only. No session, no
// connection and a read that failed never get here: the frame puts `CloudGate` in place of the
// content (`shell/AppShell.tsx`).
//
// A screen that **writes** is not unmounted while a write is in flight or after
// a `412` reloaded the ledger (ADR-0035, §2): the form keeps what the person
// typed and rebuilds its preview over the new ledger.

import { A } from "@solidjs/router";
import { createMemo, type JSX, Show } from "solid-js";
import { Notice, Skeleton } from "../components/index.js";
import type { LedgerSnapshot } from "../ledger/state.js";
import { store, today } from "../ledger/state.js";
import { SessionNotice } from "../shell/SessionNotice.jsx";

interface RequireLedgerProps {
  /** Painted with the loaded ledger. */
  children: (snapshot: LedgerSnapshot) => JSX.Element;
  /** Screens that write refuse to work on a degraded ledger (ADR-0015). */
  writes?: boolean;
  /** Lines of skeleton while it loads, sized like the real content. */
  skeleton?: number;
}

export const RequireLedger = (props: RequireLedgerProps): JSX.Element => {
  const phase = () => store.load();

  /*
   * The phase that carries something, read through the type and not through an
   * assertion: `<Show when={x()}>{(x) => …}</Show>` narrows, which is what the
   * twelve `as NonNullable<…>` of the screens were standing in for.
   */
  const loaded = (): LedgerSnapshot | undefined => {
    const current = phase();
    return current.phase === "ready" ? current.snapshot : undefined;
  };

  /**
   * What the content is painted from: a view of the ledger that belongs to this gate.
   *
   * While a write is in flight a ledger that arrives (the reload after a `412`) does **not** paint
   * the screen again — that would lose what the person typed — but it is taken into the view in
   * place, so the screen reads the ledger that is there now and not the one it was painted from.
   * What a screen computed once, when it mounted, keeps the ledger of that moment: only what is
   * read when it is used (a form building its draft or its preview) sees the new one.
   *
   * A ledger with the **same etag** as the view is the same ledger: a silent reload (the
   * connection came back, a lost answer was looked for) hands over a new snapshot object that
   * says nothing new, and painting from it would remount the form for no reason. A different etag
   * does paint again: the preview the person saw belongs to the ledger it was built on.
   *
   * A write that ends is looked at again (`writing` is read here): a new day that came during it
   * is applied then, not at the next reload.
   */
  let held: LedgerSnapshot | undefined;
  let heldEtag = "";
  let heldDay = "";
  const painted = createMemo<LedgerSnapshot | undefined>(() => {
    const next = loaded();
    // A new day in Madrid repaints from scratch: the screens value the portfolio at today's date.
    const day = today();
    if (held !== undefined && store.writing()) {
      if (next !== undefined) {
        Object.assign(held, next);
        heldEtag = next.etag;
      }
      return held;
    }
    if (held !== undefined && day === heldDay && next?.etag === heldEtag) {
      return held;
    }
    held = next === undefined ? undefined : { ...next };
    heldEtag = next?.etag ?? "";
    heldDay = day;
    return held;
  });

  return (
    <Show
      when={phase().phase !== "loading"}
      fallback={<Skeleton lines={props.skeleton ?? 4} tall />}
    >
      <Show when={painted()} keyed>
        {(snapshot) => (
          <Show
            when={props.writes !== true || store.invalidCount() === 0}
            fallback={
              <Notice
                severity="danger"
                title="Tus datos tienen movimientos inválidos"
                action={
                  <A href="/ajustes/verificacion" role="button">
                    Ver la verificación
                  </A>
                }
              >
                Mientras haya eventos inválidos solo se puede registrar un cambio de configuración.
                Rectifica lo que falla y vuelve.
              </Notice>
            }
          >
            <Show when={props.writes === true}>
              <SessionNotice />
            </Show>
            {props.children(snapshot)}
          </Show>
        )}
      </Show>
    </Show>
  );
};
