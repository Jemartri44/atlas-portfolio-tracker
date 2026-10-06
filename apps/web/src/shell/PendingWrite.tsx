// The notice of a write whose answer was lost (ADR-0035, §2; `ledger/pending.ts`).
// It lives in the frame, not in a form: the connection can fall while a form is
// open, the gate then takes the screen, and the question still has to be there
// when the ledger comes back. Lazy: nothing of it is on the boot path.

import { type JSX, Match, Show, Switch } from "solid-js";
import { Notice } from "../components/Notice.jsx";
import { discardPending, retryPending, settlePending } from "../ledger/pending.js";
import { store } from "../ledger/state.js";

export default function PendingWrite(): JSX.Element {
  const current = () => store.pending();
  return (
    <Show when={current()}>
      {(pending) => (
        <Switch>
          <Match when={pending().state === "unknown" || pending().state === "checking"}>
            <Notice
              severity="caution"
              title="No sabemos si se guardó"
              action={
                <button
                  type="button"
                  disabled={pending().state === "checking"}
                  onClick={() => void settlePending()}
                >
                  Comprobar ahora
                </button>
              }
            >
              La conexión falló justo al guardar y no sabemos si la operación llegó a registrarse.
              En cuanto haya conexión lo comprobamos. Hasta entonces no se puede registrar otra
              cosa.
            </Notice>
          </Match>
          <Match when={pending().state === "written"}>
            <Notice
              severity="info"
              title="Ya está registrada"
              action={
                <button type="button" onClick={discardPending}>
                  Entendido
                </button>
              }
            >
              La operación sí se guardó antes de cortarse la conexión. No hace falta repetirla.
            </Notice>
          </Match>
          <Match when={pending().state === "partial"}>
            <Notice
              severity="danger"
              title="Se guardó solo una parte"
              action={
                <button type="button" onClick={discardPending}>
                  Entendido
                </button>
              }
            >
              Una parte de la operación sí quedó registrada. Revisa los movimientos antes de hacer
              nada más.
            </Notice>
          </Match>
          <Match when={pending().state === "not_written"}>
            <Notice
              severity="caution"
              title="No se guardó"
              action={
                <div class="button-row">
                  <button type="button" onClick={() => void retryPending()}>
                    Enviar otra vez
                  </button>
                  <button type="button" class="secondary" onClick={discardPending}>
                    Descartar
                  </button>
                </div>
              }
            >
              La operación no llegó a registrarse. Puedes enviarla otra vez con los mismos datos: no
              se duplicará.
              <Show when={pending().said}>{(said) => <p>{said()}</p>}</Show>
            </Notice>
          </Match>
          <Match when={pending().state === "changed"}>
            {/* No «send again» here: there is no effect to confirm, so the form is the way. */}
            <Notice
              severity="caution"
              title="Tus datos han cambiado"
              action={
                <button type="button" onClick={discardPending}>
                  Entendido
                </button>
              }
            >
              Mientras tanto se ha registrado algo más en tus datos, y la operación no está
              guardada. Vuelve a hacerla desde su pantalla: verás su efecto sobre los datos actuales
              y se te pedirá confirmar otra vez.
            </Notice>
          </Match>
        </Switch>
      )}
    </Show>
  );
}
