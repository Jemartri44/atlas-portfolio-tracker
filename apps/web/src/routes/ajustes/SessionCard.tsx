// «Sesión» in Ajustes (ADR-0035): until when the session of this browser lasts,
// the button to close it and the devices of the console. Nothing is kept on the
// device: the session is the cookie the API set, and this page only reads it.

import { createSignal, type JSX, Show } from "solid-js";
import { Notice, Section } from "../../components/index.js";
import { formatInstantDate } from "../../format/date.js";
import { store } from "../../ledger/state.js";
import { signOut } from "../../sync/session.js";
import { DevicesCard } from "./DevicesCard.jsx";

const when = (instant: string): string => {
  const time = new Date(instant).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatInstantDate(instant)}, ${time}`;
};

export const SessionCard = (props: { readonly request?: typeof fetch }): JSX.Element => {
  const request: typeof fetch = (input, init) => (props.request ?? fetch)(input, init);
  const [busy, setBusy] = createSignal(false);
  const [failed, setFailed] = createSignal(false);

  const onSignOut = async (): Promise<void> => {
    setBusy(true);
    setFailed(false);
    const outcome = await signOut(request);
    setBusy(false);
    if (outcome !== "signed_out") {
      setFailed(true);
      return;
    }
    // The ledger and everything on screen go with the session.
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
        <button type="button" class="secondary" disabled={busy()} onClick={() => void onSignOut()}>
          Cerrar sesión
        </button>
      </div>
      <Show when={failed()}>
        <Notice severity="danger" title="No se ha podido cerrar la sesión">
          La nube no ha respondido como se esperaba. La sesión puede seguir abierta.
        </Notice>
      </Show>
      <DevicesCard request={request} />
    </Section>
  );
};
