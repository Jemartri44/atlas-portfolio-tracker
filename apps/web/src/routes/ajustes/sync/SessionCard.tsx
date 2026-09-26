// «Sincronización» in Ajustes, feature 015 (E1): whether this browser is
// signed in to the cloud of Atlas, until when, which device it is, and the
// buttons to sign in and out. **The web works whole without it** (ADR-0019;
// ADR-0027: the static web is not protected by a sign-in): signing in only
// serves to sync, and syncing arrives in E4. A lazy section of Ajustes (Q7),
// never on the boot path.

import { createResource, createSignal, type JSX, Match, Show, Switch } from "solid-js";
import { Notice, Section } from "../../../components/index.js";
import { formatInstantDate } from "../../../format/date.js";
import { readSession, type SessionState, signInHref, signOut } from "../../../sync/session.js";
import { DevicesCard } from "./DevicesCard.jsx";

const webDevice = () => import("@atlas/adapters/web-device");

type Fetch = typeof fetch;

/** The id kept in this browser, and the state of the session; the id the API says is adopted. */
const load = async (request: Fetch): Promise<{ state: SessionState; kept: string | undefined }> => {
  const { readWebDeviceId, saveWebDeviceId } = await webDevice();
  const [state, kept] = await Promise.all([
    readSession(request),
    readWebDeviceId().catch(() => undefined),
  ]);
  if (state.kind === "signed_in" && state.deviceId !== kept) {
    await saveWebDeviceId(state.deviceId).catch(() => undefined);
    return { state, kept: state.deviceId };
  }
  return { state, kept };
};

const until = (instant: string): string => {
  const time = new Date(instant).toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${formatInstantDate(instant)}, ${time}`;
};

const UNAVAILABLE: Readonly<Record<string, string>> = {
  network_failed: "No hay conexión con la nube de Atlas.",
  not_found: "La nube de Atlas no está disponible en esta dirección.",
  remote_unavailable:
    "La nube de Atlas no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.",
};

/**
 * The card receives the `fetch` it asks the API with (T1 of the review of PR
 * #90, round 2): a test hands it its own, and never reaches the network. The
 * application gives it none, and it takes the browser's at the moment of each
 * call.
 */
export const SessionCard = (props: { readonly request?: Fetch }): JSX.Element => {
  const request: Fetch = (input, init) => (props.request ?? fetch)(input, init);
  const [session, { refetch }] = createResource(() => load(request));
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string>();

  const onSignOut = async (): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    const outcome = await signOut(request);
    setBusy(false);
    if (outcome !== "signed_out") {
      setFailure(outcome.code);
    }
    refetch();
  };

  const signIn = (label: string): JSX.Element => (
    <div class="button-row">
      {/* A full navigation to our own origin, never the router: the API answers with a redirect to Google. */}
      <button type="button" onClick={() => window.location.assign(signInHref(session()?.kept))}>
        {label}
      </button>
    </div>
  );

  return (
    <Section title="Sincronización">
      <Show when={session()} fallback={<p class="meta">Comprobando la sesión…</p>}>
        {(loaded) => (
          <Switch>
            <Match when={loaded().state.kind === "signed_in" && loaded().state}>
              {(state) => (
                <>
                  <dl class="facts">
                    <div class="fact">
                      <dt>Sesión</dt>
                      <dd>
                        iniciada, hasta el {until((state() as { expiresAt: string }).expiresAt)}
                      </dd>
                    </div>
                    <div class="fact">
                      <dt>Este navegador</dt>
                      <dd>
                        <code>{(state() as { deviceId: string }).deviceId}</code>
                      </dd>
                    </div>
                  </dl>
                  <p class="card-note">
                    La sesión sirve para sincronizar tus datos con la nube. No se renueva sola: al
                    caducar, se vuelve a iniciar con Google.
                  </p>
                  <div class="button-row">
                    <button
                      type="button"
                      class="secondary"
                      disabled={busy()}
                      onClick={() => void onSignOut()}
                    >
                      Cerrar sesión
                    </button>
                  </div>
                  <DevicesCard request={request} />
                </>
              )}
            </Match>
            <Match when={loaded().state.kind === "signed_out"}>
              <p>
                <strong>No has iniciado sesión.</strong> No hace falta para usar Atlas: solo para
                sincronizar tus datos con la nube.
              </p>
              {signIn("Iniciar sesión con Google")}
            </Match>
            <Match when={loaded().state.kind === "expired"}>
              <Notice severity="caution" title="La sesión ha caducado">
                Vuelve a iniciarla con Google para sincronizar. Tus datos siguen aquí.
              </Notice>
              {signIn("Volver a iniciar sesión")}
            </Match>
            <Match when={loaded().state.kind === "forgotten"}>
              <Notice severity="caution" title="Este navegador fue olvidado">
                Se retiró como dispositivo de la nube. Al volver a iniciar sesión recibirá uno
                nuevo.
              </Notice>
              {signIn("Volver a iniciar sesión")}
            </Match>
            <Match when={loaded().state.kind === "not_allowed"}>
              <Notice severity="danger" title="Sin acceso">
                Esta cuenta de Google ya no está en la lista de acceso de Atlas.
              </Notice>
            </Match>
            <Match when={loaded().state.kind === "unavailable" && loaded().state}>
              {(state) => (
                <p class="meta">
                  {UNAVAILABLE[(state() as { code: string }).code] ??
                    "La nube de Atlas no ha respondido como se esperaba."}{" "}
                  La web funciona igual sin ella.
                </p>
              )}
            </Match>
          </Switch>
        )}
      </Show>
      <Show when={failure()}>
        {(code) => (
          <Notice severity="danger" title="No se ha podido cerrar la sesión">
            {UNAVAILABLE[code()] ?? "La nube no ha respondido como se esperaba."} La sesión puede
            seguir abierta.
          </Notice>
        )}
      </Show>
    </Section>
  );
};
