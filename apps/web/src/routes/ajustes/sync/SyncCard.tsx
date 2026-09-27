// «Sincronizar» inside the card of Sincronización (feature 015, E4; Q7): the
// state of the sync of this browser, the button that syncs, the explicit
// start (upload to an empty cloud, join from the cloud, join with my
// operations), what is held back with its resolutions, deactivating and, only
// after the cloud was rewritten, downloading it again. Shown only with a
// session: the device is the session's.
//
// **Nothing here runs by itself**: every write is a button, and every start,
// redownload and redo asks first. After a write the ledger is read again, and
// the card says that what the screens show may change with a sync.

import { For, type JSX, Show } from "solid-js";
import { Notice } from "../../../components/index.js";
import type { StartHow, WebSyncStatus } from "../../../sync/engine.js";
import { HeldList, RedoConfirm } from "./HeldList.jsx";
import { createSyncController, type SyncCardProps } from "./sync-controller.js";
import { REDOWNLOAD_ASKS, START, said, syncedAt } from "./sync-texts.js";

const ALL: readonly StartHow[] = ["init", "join_from_remote", "join_with_mine"];
const JOIN: readonly StartHow[] = ["join_from_remote", "join_with_mine"];

/** Where this browser stands, as the card branches on it. */
const standing = (
  state: WebSyncStatus,
  device: string,
): "start" | "deactivated" | "other_device" | "synced" => {
  if (!state.configured || state.half) {
    return "start";
  }
  if (!state.enabled) {
    return "deactivated";
  }
  return state.joined === device ? "synced" : "other_device";
};

export const SyncCard = (props: SyncCardProps): JSX.Element => {
  const card = createSyncController(props);

  const starts = (hows: readonly StartHow[]): JSX.Element => (
    <div class="button-row">
      <For each={hows}>
        {(how) => (
          <button
            type="button"
            class="secondary"
            disabled={card.busy()}
            onClick={() => card.setAsking(how)}
          >
            {START[how].label}
          </button>
        )}
      </For>
    </div>
  );

  const synced = (state: WebSyncStatus): JSX.Element => (
    <>
      <dl class="facts">
        <div class="fact">
          <dt>Pendientes de subir</dt>
          <dd>{state.pending ?? "—"}</dd>
        </div>
        <div class="fact">
          <dt>Retenidas</dt>
          <dd>{state.held}</dd>
        </div>
        <div class="fact">
          <dt>Última sincronización</dt>
          <dd>{state.lastSyncAt === undefined ? "nunca" : syncedAt(state.lastSyncAt)}</dd>
        </div>
      </dl>
      <p class="card-note">
        Lo que ves antes de sincronizar puede cambiar después: llegan las operaciones de tus otros
        dispositivos.
      </p>
      <div class="button-row">
        <button type="button" disabled={card.busy()} onClick={() => void card.sync()}>
          Sincronizar
        </button>
        <Show when={card.rewritten()}>
          <button
            type="button"
            class="secondary"
            disabled={card.busy()}
            onClick={() => card.setAsking("redownload")}
          >
            Volver a descargar
          </button>
        </Show>
        <button
          type="button"
          class="secondary"
          disabled={card.busy()}
          onClick={() => void card.stop()}
        >
          Desactivar
        </button>
      </div>
    </>
  );

  const body = (state: WebSyncStatus): JSX.Element => {
    switch (standing(state, props.device)) {
      case "start":
        return (
          <>
            <p>
              {state.half
                ? "El inicio de la sincronización quedó a medias. Empieza otra vez para terminarlo."
                : "Tus datos no se sincronizan. Para empezar hay que elegirlo:"}
            </p>
            {starts(ALL)}
          </>
        );
      case "deactivated":
        return (
          <>
            <p>{said("sync_deactivated")}</p>
            {starts(JOIN)}
          </>
        );
      case "other_device":
        return (
          <>
            <Notice severity="caution" title="Otro dispositivo">
              {said(state.joined === undefined ? "sync_device_unknown" : "sync_device_changed")}
            </Notice>
            {starts(JOIN)}
          </>
        );
      default:
        return synced(state);
    }
  };

  return (
    <div>
      <h3 class="block-title">Sincronizar</h3>
      <Show when={card.status() === null}>
        <p class="meta">{said("sync_marker_unreadable")}</p>
      </Show>
      <Show when={card.status()} fallback={<p class="meta">Comprobando la sincronización…</p>}>
        {/* An expression of JSX, so the branch follows each new state. */}
        {(state) => <>{body(state())}</>}
      </Show>

      <Show when={card.asking()}>
        {(how) => (
          <Notice
            severity="caution"
            title={
              how() === "redownload"
                ? "¿Volver a descargar?"
                : `¿${START[how() as StartHow].label}?`
            }
            action={
              <div class="button-row">
                <button type="button" disabled={card.busy()} onClick={() => void card.proceed()}>
                  Sí, seguir
                </button>
                <button
                  type="button"
                  class="secondary"
                  disabled={card.busy()}
                  onClick={() => card.setAsking(undefined)}
                >
                  Cancelar
                </button>
              </div>
            }
          >
            {how() === "redownload" ? REDOWNLOAD_ASKS : START[how() as StartHow].asks}
          </Notice>
        )}
      </Show>

      <HeldList
        items={card.held() ?? []}
        busy={card.busy()}
        onResolve={(item, resolution) => void card.resolve(item, resolution)}
      />
      <Show when={card.discarding()}>
        <Notice
          severity="caution"
          title="¿Descartar lo retenido?"
          action={
            <div class="button-row">
              <button type="button" disabled={card.busy()} onClick={() => void card.discard()}>
                Sí, descartar
              </button>
              <button
                type="button"
                class="secondary"
                disabled={card.busy()}
                onClick={() => card.setDiscarding(undefined)}
              >
                Cancelar
              </button>
            </div>
          }
        >
          Sale de tus datos y nunca se sube a la nube. Queda apartado entre lo descartado, por si
          hiciera falta volver a registrarlo a mano.
        </Notice>
      </Show>
      <Show when={card.redo()}>
        {(redo) => (
          <RedoConfirm
            redo={redo()}
            busy={card.busy()}
            onRecord={() => void card.recordPlanned()}
            onCancel={() => card.setRedo(undefined)}
          />
        )}
      </Show>

      <Show when={card.told()}>
        {(message) => (
          <Notice severity={message().severity} title={message().title}>
            {message().text}
          </Notice>
        )}
      </Show>
    </div>
  );
};
