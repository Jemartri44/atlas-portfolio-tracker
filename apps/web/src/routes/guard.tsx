// The gate every screen that needs the ledger goes through, so the states are
// written once (FR-019): loading shows the shape of what is coming, and a
// degraded ledger blocks **writing** only. No session, no connection and a read
// that failed never get here: the frame puts `CloudGate` in place of the
// content (`shell/AppShell.tsx`).
//
// A screen that **writes** is not unmounted while a write is in flight or after
// a `412` reloaded the ledger (ADR-0035, §2): the form keeps what the person
// typed and rebuilds its preview over the new ledger.

import { A } from "@solidjs/router";
import { createMemo, type JSX, Show, untrack } from "solid-js";
import { Notice, Skeleton } from "../components/index.js";
import type { LedgerSnapshot } from "../ledger/state.js";
import { store } from "../ledger/state.js";
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
   * What the content is painted from. While a write is in flight, a ledger that
   * arrives (the reload after a `412`) does **not** replace it: replacing it
   * would paint the screen again and lose what the person typed.
   */
  let held: LedgerSnapshot | undefined;
  const painted = createMemo<LedgerSnapshot | undefined>(() => {
    const next = loaded();
    if (untrack(store.writing) && held !== undefined) {
      return held;
    }
    held = next;
    return next;
  });

  return (
    <Show
      when={phase().phase !== "loading"}
      fallback={<Skeleton lines={props.skeleton ?? 4} tall />}
    >
      <Show when={painted()}>
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
            {props.children(snapshot())}
          </Show>
        )}
      </Show>
    </Show>
  );
};
