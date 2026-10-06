// What the cloud mode shows instead of the application while it cannot show
// data (ADR-0035, §2 and §3): the sign-in, the lack of connection, or a read
// that failed. **Nothing of the ledger** is on any of them, and none lets the
// user record anything: the data screens and the forms are not rendered at all.
//
// Lazy and with no style of its own: the notice and the button row are the
// ones of the rest of the application.

import { createSignal, type JSX, Match, Show, Switch } from "solid-js";
import { Notice } from "../components/Notice.jsx";
import type { SignedOutReason } from "../ledger/state.js";
import { store } from "../ledger/state.js";
import { signInHref } from "../sync/session.js";

const SENTENCES: Readonly<Record<SignedOutReason, string>> = {
  signed_out: "Entra con tu cuenta de Google para ver tus datos.",
  expired: "Tu sesión ha caducado. Entra de nuevo con Google para seguir.",
  not_allowed:
    "Esta cuenta de Google no tiene acceso a Atlas. Entra con otra cuenta si tienes más de una.",
  forgotten: "Este navegador se ha olvidado desde otro dispositivo. Entra de nuevo con Google.",
};

/** Reads the session and the ledger again, from the start. */
const retry = (): void => {
  void import("../ledger/cloud.js").then((cloud) => cloud.bootCloud());
};

const Retry = (): JSX.Element => (
  <button type="button" onClick={retry}>
    Reintentar
  </button>
);

/**
 * Signing in navigates in this same tab, and a write whose answer was lost lives
 * only in memory (never on the device): it would be gone without being settled.
 * So, with one still unresolved, the first click only warns, and says to look in
 * Movimientos when coming back; the second one goes. Simpler and safer than
 * blocking the sign-in, which may be the very thing the person needs to settle it.
 */
const unresolved = (): boolean => {
  const pending = store.pending();
  return pending !== undefined && pending.state !== "written";
};

export default function CloudGate(): JSX.Element {
  const phase = () => store.load();
  const [warned, setWarned] = createSignal(false);
  const enter = (): void => {
    if (unresolved() && !warned()) {
      setWarned(true);
      return;
    }
    window.location.assign(signInHref(undefined));
  };
  return (
    <Switch>
      <Match when={phase().phase === "signed_out"}>
        <Notice
          severity="info"
          title="Entrar en Atlas"
          action={
            // A full navigation to our own origin, never the router (it would take an
            // `<a>` for a screen of its own, found in a real browser): the Lambda
            // answers with a redirect to Google and the token never reaches the page.
            <button type="button" onClick={enter}>
              {warned() ? "Entrar de todos modos" : "Entrar con Google"}
            </button>
          }
        >
          {SENTENCES[(phase() as { reason: SignedOutReason }).reason]}
          <Show when={warned() && unresolved()}>
            <p>
              Hay una operación de la que no se sabe si quedó guardada, y este aviso se pierde al
              entrar. Cuando vuelvas, compruébalo en Movimientos antes de repetirla.
            </p>
          </Show>
        </Notice>
      </Match>
      <Match when={phase().phase === "offline"}>
        <Notice severity="caution" title="Sin conexión" action={<Retry />}>
          Atlas necesita conexión para mostrar tus datos. Mientras no la haya no se muestra nada ni
          se puede registrar. Cuando vuelva, se cargarán de nuevo solos.
        </Notice>
      </Match>
      <Match when={phase().phase === "cloud_failed"}>
        <Notice severity="danger" title="No se han podido leer tus datos" action={<Retry />}>
          {(phase() as { error: { message: string } }).error.message}
        </Notice>
      </Match>
    </Switch>
  );
}
