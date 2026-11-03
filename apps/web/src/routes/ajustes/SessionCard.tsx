// «Sesión» in Ajustes (ADR-0035): until when the session of this browser lasts,
// the button to close it, and the one to close it on every device at once — for a
// lost phone. Nothing is kept on the device: the session is the cookie the API
// set, and this page only reads it.

import { createSignal, type JSX, Show } from "solid-js";
import { signOut, signOutEverywhere } from "../../auth/session.js";
import { Notice, Section } from "../../components/index.js";
import { formatInstantDate } from "../../format/date.js";
import { store } from "../../ledger/state.js";

const when = (instant: string): string => {
  const time = new Date(instant).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  });
  return `${formatInstantDate(instant)}, ${time}`;
};

export const SessionCard = (props: { readonly request?: typeof fetch }): JSX.Element => {
  const request: typeof fetch = (input, init) => (props.request ?? fetch)(input, init);
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);

  const onSignOut = async (everywhere: boolean): Promise<void> => {
    setBusy(true);
    setFailed(false);
    const outcome = await (everywhere ? signOutEverywhere : signOut)(request);
    setBusy(false);
    if (outcome !== "signed_out") {
      setFailed(true);
      return;
    }
    // The ledger and everything on screen go with the session, and so do the prices imported by
    // hand: they say which assets are followed, and the next person on this browser must not see it.
    try {
      await (await import("../../prices/quotes.js")).forgetPrices();
    } catch {
      // A browser that keeps no site data has nothing to forget; the sign-out goes on.
    }
    const { bootCloud } = await import("../../ledger/cloud.js");
    await bootCloud(request);
  };

  return (
    <Section title="Sesión">
      <Show when={store.source()}>
        {(source) => (
          <p>
            Iniciada con Google, hasta el {when(source().expiresAt)}. No se renueva sola: al
            caducar, se vuelve a entrar.
          </p>
        )}
      </Show>
      <div class="button-row">
        <button
          type="button"
          class="secondary"
          disabled={busy()}
          onClick={() => void onSignOut(false)}
        >
          Cerrar sesión
        </button>
        <button
          type="button"
          class="secondary"
          disabled={busy()}
          onClick={() => void onSignOut(true)}
        >
          Cerrar sesión en todos los dispositivos
        </button>
      </div>
      <p>
        Si pierdes el móvil o entraste en un ordenador ajeno: cierra la sesión en todos los
        dispositivos a la vez, también en este. Después vuelves a entrar con Google.
      </p>
      <Show when={failed()}>
        <Notice severity="danger" title="No se ha podido cerrar la sesión">
          La nube no ha respondido como se esperaba y la sesión puede seguir abierta. Inténtalo otra
          vez.
        </Notice>
      </Show>
    </Section>
  );
};
