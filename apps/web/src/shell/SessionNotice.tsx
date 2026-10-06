// The session of the web lasts 24 hours and is not renewed (`docs/api.md` §3;
// ADR-0035, question 6), and a form left half-written cannot be saved once it
// ends (what was typed stays on screen, but the write is refused). So,
// **before a form opens**, the page says if less than 15 minutes are left, and
// when a write finds the session already gone it says so too.
//
// Signing in again opens **another tab**: the Lambda answers with a redirect to
// Google, and this page — with what was typed in it, only in memory — stays where
// it is. Coming back, «Ya he entrado» reads the session again and gives the page
// the device of the new one; nothing is written on the device.

import { createSignal, type JSX, onCleanup, Show } from "solid-js";
import { Notice } from "../components/Notice.jsx";
import { store } from "../ledger/state.js";
import { signInHref } from "../sync/session.js";

/** Less than this and the person is told before opening a form. */
export const SESSION_WARNING_MINUTES = 15;

/** Minutes left in the session, or `undefined` while there is none known. */
const minutesLeft = (): number | undefined => {
  const source = store.source();
  if (source === undefined) {
    return undefined;
  }
  const now = (store.deps()?.clock.now() ?? new Date()).getTime();
  return Math.floor((Date.parse(source.expiresAt) - now) / 60_000);
};

export const SessionNotice = (props: {
  /** The session is already gone: a write was refused for it. */
  readonly expired?: boolean;
  /** Called when the session was renewed, so the screen that showed this can put it away. */
  readonly onRenewed?: () => void;
}): JSX.Element => {
  const [said, setSaid] = createSignal<string | undefined>(undefined);
  const [opened, setOpened] = createSignal(false);
  const [busy, setBusy] = createSignal(false);

  // The minutes left are re-read with the time, not only when something else changes.
  const [tick, setTick] = createSignal(0);
  const timer = setInterval(() => setTick((value) => value + 1), 30_000);
  onCleanup(() => clearInterval(timer));
  const left = (): number | undefined => {
    tick();
    return minutesLeft();
  };
  const ending = (): boolean =>
    props.expired === true || (left() ?? Number.POSITIVE_INFINITY) < SESSION_WARNING_MINUTES;

  const signIn = (): void => {
    window.open(signInHref(undefined), "_blank", "noopener");
    setOpened(true);
    setSaid(undefined);
  };

  const back = async (): Promise<void> => {
    setBusy(true);
    const { refreshSession } = await import("../ledger/cloud.js");
    const outcome = await refreshSession();
    setBusy(false);
    if (outcome === "signed_in") {
      setOpened(false);
      setSaid("Sesión renovada: puedes seguir donde estabas.");
      props.onRenewed?.();
      return;
    }
    setSaid(
      outcome === "offline"
        ? "No hay conexión para comprobar la sesión. Inténtalo de nuevo cuando vuelva."
        : "Todavía no hay una sesión iniciada. Termina de entrar en la otra pestaña y vuelve.",
    );
  };

  return (
    <>
      <Show when={ending()}>
        <Notice
          severity="caution"
          title={props.expired === true ? "Tu sesión ha terminado" : "Tu sesión caduca pronto"}
          action={
            <div class="button-row">
              <button type="button" onClick={signIn}>
                Entrar de nuevo
              </button>
              <Show when={opened()}>
                <button
                  type="button"
                  class="secondary"
                  disabled={busy()}
                  onClick={() => void back()}
                >
                  Ya he entrado
                </button>
              </Show>
            </div>
          }
        >
          {props.expired === true
            ? "Lo último no se ha guardado. Entra de nuevo con Google (se abre en otra pestaña), vuelve aquí y confirma otra vez: lo que has escrito sigue en pantalla."
            : `Quedan ${Math.max(left() ?? 0, 0)} minutos. Si caduca mientras rellenas, lo escrito se conserva, pero no podrás guardarlo hasta entrar de nuevo: hazlo ahora con Google (se abre en otra pestaña) y sigue aquí.`}
        </Notice>
      </Show>
      <Show when={said()}>
        {(sentence) => (
          <p class="meta" role="status">
            {sentence()}
          </p>
        )}
      </Show>
    </>
  );
};
