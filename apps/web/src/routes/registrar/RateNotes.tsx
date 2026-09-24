// What the form says about the ECB rate (feature 012, block 3): where the
// proposal came from, that the ECB has not published yet, that there is no
// history to propose from — and, before writing, that a typed rate is not
// the official one, with the explicit yes it needs. Rates are public figures:
// they are shown as recorded, never masked.

import { Switch as Case, For, type JSX, Match, Show } from "solid-js";
import { Notice, Switch } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { formatExact } from "../../format/number.js";
import type { RateToConfirm } from "../../view-models/forms/rates.js";
import type { FormRates } from "./rates.js";

const whose = (basis: "fiscal" | "business"): string =>
  basis === "fiscal" ? "la fecha fiscal" : "la fecha de la operación";

/** Beside the fields: what the history proposed, or why it did not. */
export const RateHint = (props: { rates: FormRates; currency: string }): JSX.Element => (
  <Case>
    <Match when={props.rates.hint().kind === "proposed" && props.rates.hint()}>
      {(hint) => {
        const proposed = hint() as Extract<ReturnType<FormRates["hint"]>, { kind: "proposed" }>;
        return (
          <p class="card-note">
            Tipo propuesto por el histórico del BCE: {formatExact(proposed.rate)}{" "}
            {proposed.currency} por euro, publicado el {formatDate(proposed.date)} para{" "}
            {whose(proposed.basis)} ({formatDate(proposed.reference)}). Si lo cambias y no coincide
            con el oficial, se te pedirá confirmarlo.
          </p>
        );
      }}
    </Match>
    <Match when={props.rates.hint().kind === "waiting" && props.rates.hint()}>
      {(hint) => {
        const waiting = hint() as Extract<ReturnType<FormRates["hint"]>, { kind: "waiting" }>;
        return (
          <Notice severity="caution" title="El BCE todavía no ha publicado este tipo">
            El tipo de {waiting.currency} de {formatDate(waiting.reference)} aún no está en el
            histórico, que llega hasta el {formatDate(waiting.latest)}. Si ya lo tienes, tecléalo;
            no se inventa ninguno.
          </Notice>
        );
      }}
    </Match>
    <Match
      when={
        props.currency !== "" &&
        props.currency !== "EUR" &&
        props.rates.web()?.history === undefined
      }
    >
      <p class="card-note">
        <Show
          when={props.rates.web()?.problem === "permission"}
          fallback="No hay histórico del BCE en este dispositivo: el tipo se teclea. En Ajustes puedes enlazar la carpeta de la consola o importar el histórico."
        >
          Hay una carpeta enlazada, pero el navegador ya no tiene permiso para leerla: vuelve a
          enlazarla en Ajustes para que se proponga el tipo.
        </Show>
      </p>
    </Match>
  </Case>
);

const Mismatch = (props: { rate: RateToConfirm }): JSX.Element => (
  <li>
    Has tecleado {formatExact(props.rate.typed)} {props.rate.currency} por euro
    {props.rate.typedDate === undefined ? "" : ` del ${formatDate(props.rate.typedDate)}`}; para{" "}
    {whose(props.rate.basis)} ({formatDate(props.rate.reference)}) el BCE publicó{" "}
    {formatExact(props.rate.official)} el {formatDate(props.rate.officialDate)}.
  </li>
);

/** Before writing: a typed rate that is not the official one, and its explicit yes. */
export const RateConfirm = (props: { rates: FormRates }): JSX.Element => (
  <Show when={props.rates.toConfirm().length > 0}>
    <Notice severity="caution" title="El tipo no es el oficial">
      <ul class="sentences">
        <For each={props.rates.toConfirm()}>{(rate) => <Mismatch rate={rate} />}</For>
      </ul>
      Se registra el tecleado si lo confirmas; la verificación de tus datos lo señalará.
    </Notice>
    <Switch
      id="confirm-fx-rate"
      label="Registrar con el tipo tecleado"
      checked={props.rates.acknowledged()}
      onChange={(checked) => props.rates.acknowledge(checked)}
    />
  </Show>
);
