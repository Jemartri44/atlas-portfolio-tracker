// «Dispositivos» in Ajustes (feature 015, E2, block 4; ADR-0033, point 8):
// every token of the console with its state and its last sync, **the issues
// of the last days marked** — a token nobody remembers issuing is the sign of
// a stolen account —, and revoking them one by one. Only with the session; a
// lazy part of the section of the sync, never on the boot path. The name of a
// device is text, never markup. Nothing here comes from the ledger, so the
// privacy mode has nothing to cover.

import { createResource, createSignal, For, type JSX, Match, Show, Switch } from "solid-js";
import { Notice } from "../../../components/index.js";
import { formatInstantDate } from "../../../format/date.js";
import { readTokens, revokeToken, type TokenRow } from "../../../sync/devices.js";

type Fetch = typeof fetch;

const STATUS: Readonly<Record<TokenRow["status"], string>> = {
  active: "Activo",
  expired: "Caducado",
  revoked: "Revocado",
  unreadable: "Ilegible",
};

const FAILED: Readonly<Record<string, string>> = {
  unauthenticated: "Inicia sesión para ver los dispositivos.",
  session_invalid: "La sesión ha caducado: vuelve a iniciarla para ver los dispositivos.",
  network_failed: "No hay conexión con la nube de Atlas.",
  remote_unavailable: "La nube de Atlas no está disponible ahora mismo.",
};

const Row = (props: {
  row: TokenRow;
  onRevoke: (id: string) => void;
  busy: boolean;
}): JSX.Element => (
  <li>
    <div class="row">
      <span class="main">
        <span class="title">
          {props.row.device_name ?? props.row.token_id}{" "}
          <span class={props.row.status === "active" ? "tag is-accent" : "tag"}>
            {STATUS[props.row.status]}
          </span>{" "}
          <Show when={props.row.recent === true}>
            <span class="tag is-caution">Reciente</span>
          </Show>
        </span>
        <Show when={props.row.status !== "unreadable"}>
          <span class="sub">
            Emitido el {formatInstantDate(props.row.issued_at ?? "")}
            {props.row.status === "revoked"
              ? `, revocado el ${formatInstantDate(props.row.revoked_at ?? "")}`
              : `, caduca el ${formatInstantDate(props.row.expires_at ?? "")}`}
            . Última sincronización:{" "}
            {props.row.last_sync_at === undefined
              ? "nunca"
              : formatInstantDate(props.row.last_sync_at)}
            .
          </span>
        </Show>
      </span>
      <Show when={props.row.status === "active" || props.row.status === "expired"}>
        <button
          type="button"
          class="secondary"
          disabled={props.busy}
          onClick={() => props.onRevoke(props.row.token_id)}
        >
          Revocar
        </button>
      </Show>
    </div>
  </li>
);

export const DevicesCard = (props: { readonly request?: Fetch }): JSX.Element => {
  const request: Fetch = (input, init) => (props.request ?? fetch)(input, init);
  const [tokens, { refetch }] = createResource(() => readTokens(request));
  const [busy, setBusy] = createSignal(false);
  const [failure, setFailure] = createSignal<string>();

  const onRevoke = async (tokenId: string): Promise<void> => {
    setBusy(true);
    setFailure(undefined);
    const outcome = await revokeToken(request, tokenId);
    setBusy(false);
    if (outcome !== "revoked") {
      setFailure(outcome.code);
    }
    refetch();
  };

  return (
    <section aria-label="Dispositivos de la consola">
      <h3>Dispositivos de la consola</h3>
      <Show when={tokens()} fallback={<p class="meta">Leyendo los dispositivos…</p>}>
        {(state) => (
          <Switch>
            <Match when={state().kind === "list" && state()}>
              {(list) => (
                <Show
                  when={(list() as { tokens: readonly TokenRow[] }).tokens.length > 0}
                  fallback={<p class="meta">Ninguna consola ha iniciado sesión todavía.</p>}
                >
                  <ul class="rows">
                    <For each={(list() as { tokens: readonly TokenRow[] }).tokens}>
                      {(row) => (
                        <Row row={row} onRevoke={(id) => void onRevoke(id)} busy={busy()} />
                      )}
                    </For>
                  </ul>
                </Show>
              )}
            </Match>
            <Match when={state().kind === "failed" && state()}>
              {(failed) => (
                <p class="meta">
                  {FAILED[(failed() as { code: string }).code] ??
                    "La nube no ha respondido como se esperaba."}
                </p>
              )}
            </Match>
          </Switch>
        )}
      </Show>
      <Show when={failure()}>
        {(code) => (
          <Notice severity="danger" title="No se ha podido revocar el token">
            {FAILED[code()] ?? "La nube no ha respondido como se esperaba."} El token puede seguir
            vivo.
          </Notice>
        )}
      </Show>
    </section>
  );
};
