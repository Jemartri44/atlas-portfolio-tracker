// The gate every screen that needs the ledger goes through, so the four states
// are written once (FR-019): loading shows the shape of what is coming, no
// ledger sends you to open one, a failure explains itself with its action, and
// a degraded ledger blocks **writing** only.

import { A, Navigate } from "@solidjs/router";
import { createResource, type JSX, Show } from "solid-js";
import { ErrorView, Notice, Skeleton } from "../components/index.js";
import type { AppError, LedgerSnapshot } from "../ledger/state.js";
import { store } from "../ledger/state.js";

/**
 * Whether the sync is the cause of an invalid ledger (review of PR #97,
 * correctness B1): D-Q1 lets a correction the sync holds back leave the
 * ledger of this browser invalid, and that is resolved in the section of the
 * sync in Ajustes, not in the verification. Read lazily, and only when the
 * notice is painted; it only reads.
 */
const HeldCause = (): JSX.Element => {
  const [pending] = createResource(() =>
    import("../sync/held-pending.js").then((sync) => sync.browserHeldPending()).catch(() => 0),
  );
  return (
    <Show when={(pending() ?? 0) > 0}>
      <p>
        <strong>La causa es lo que la sincronización retiene</strong>: mientras no se resuelva, tus
        datos aquí pueden quedar incompletos. Se resuelve en{" "}
        <A href="/ajustes#sincronizacion">Ajustes › Sincronización › Retenidas</A>.
      </p>
    </Show>
  );
};

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
   * The two phases that carry something, read through the type and not through
   * an assertion: `<Show when={x()}>{(x) => …}</Show>` narrows, which is what
   * the twelve `as NonNullable<…>` of the screens were standing in for.
   */
  const loaded = (): LedgerSnapshot | undefined => {
    const current = phase();
    return current.phase === "ready" ? current.snapshot : undefined;
  };

  const failure = (): AppError | undefined => {
    const current = phase();
    return current.phase === "failed" ? current.error : undefined;
  };

  return (
    <Show when={phase().phase !== "unconfigured"} fallback={<Navigate href="/libro" />}>
      <Show
        when={phase().phase !== "loading"}
        fallback={<Skeleton lines={props.skeleton ?? 4} tall />}
      >
        <Show
          when={loaded()}
          fallback={
            <Show when={failure()}>
              {(error) => (
                <ErrorView error={error()} title="No se han podido leer tus datos">
                  <Show when={error().action === undefined}>
                    <A href="/libro" role="button">
                      Abrir otro archivo
                    </A>
                  </Show>
                </ErrorView>
              )}
            </Show>
          }
        >
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
                  Mientras haya eventos inválidos solo se puede registrar un cambio de
                  configuración. Rectifica lo que falla y vuelve.
                  <HeldCause />
                </Notice>
              }
            >
              {props.children(snapshot())}
            </Show>
          )}
        </Show>
      </Show>
    </Show>
  );
};
