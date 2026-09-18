// The gate every screen that needs the ledger goes through, so the four states
// are written once (FR-019): loading shows the shape of what is coming, no
// ledger sends you to open one, a failure explains itself with its action, and
// a degraded ledger blocks **writing** only.

import { A, Navigate } from "@solidjs/router";
import { type JSX, Show } from "solid-js";
import { Callout, Skeleton } from "../components/index.js";
import type { LedgerSnapshot } from "../ledger/state.js";
import { store } from "../ledger/state.js";

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
  return (
    <Show
      when={phase().phase !== "unconfigured" && phase().phase !== "reconnect"}
      fallback={<Navigate href="/libro" />}
    >
      <Show
        when={phase().phase !== "loading"}
        fallback={<Skeleton lines={props.skeleton ?? 4} tall />}
      >
        <Show
          when={phase().phase === "ready"}
          fallback={
            <Callout
              tone="error"
              title="No se ha podido leer el libro"
              action={
                <A
                  href={
                    (phase() as { error?: { action?: { to: string } } }).error?.action?.to ??
                    "/libro"
                  }
                  role="button"
                >
                  {(phase() as { error?: { action?: { label: string } } }).error?.action?.label ??
                    "Abrir otro libro"}
                </A>
              }
            >
              {(phase() as { error: { message: string; line?: number } }).error.message}
              <Show when={(phase() as { error: { line?: number } }).error.line !== undefined}>
                {" "}
                (línea {(phase() as { error: { line?: number } }).error.line})
              </Show>
            </Callout>
          }
        >
          <Show
            when={props.writes !== true || store.invalidCount() === 0}
            fallback={
              <Callout
                tone="error"
                title="El libro tiene eventos inválidos"
                action={
                  <A href="/ajustes/verificacion" role="button">
                    Ver la verificación
                  </A>
                }
              >
                Sobre un libro degradado solo puede escribirse un cambio de configuración
                (ADR-0015). Rectifica lo que falla y vuelve.
              </Callout>
            }
          >
            {props.children((phase() as { snapshot: LedgerSnapshot }).snapshot)}
          </Show>
        </Show>
      </Show>
    </Show>
  );
};
