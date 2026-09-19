// What is going to happen, before it happens (FR-044).
//
// The positions and lots **that change**, the gains the event would book and
// the warnings it raises — all of it from the domain use case the CLI also uses
// (`previewEvent`, decision (h)), so the preview cannot disagree with the
// write. What does not move is counted, not listed (`previewChanges`).
//
// Every quantity goes through `Amount`: the preview printed them raw, so with
// the privacy mode on it listed every lot of the fund to four decimals.

import type { EventPreview } from "@atlas/domain";
import { For, type JSX, Show } from "solid-js";
import { Amount, Callout, Tag } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { describeWarning } from "../../format/messages/warnings.js";
import { displayName, type NameIndex, NO_NAMES } from "../../format/names.js";
import { countOf } from "../../format/number.js";
import { usePrivacy } from "../../ledger/state.js";
import { type ChangeRow, previewChanges } from "../../view-models/preview.js";

/**
 * One row: its name on top, wrapping if it has to, and the two figures under
 * it or beside it. The name used to be `nowrap` in a flex row that could not
 * shrink, so a long fund name pushed the card 58 to 207 px past a phone screen
 * and dragged the "Registrar" button under the navigation bar.
 */
const Change = (props: { row: ChangeRow; empty: string }): JSX.Element => (
  <div class="change">
    <span class="change-name">
      {props.row.label}
      <Show when={props.row.isNew}>
        {" "}
        <Tag tone="done">nuevo</Tag>
      </Show>
      <Show when={props.row.closed}>
        {" "}
        <Tag>cerrado</Tag>
      </Show>
    </span>
    <span class="values">
      <Show
        when={props.row.before !== undefined}
        fallback={<span class="subtle">{props.empty}</span>}
      >
        <Amount quantity={props.row.before} class="subtle" />
      </Show>
      <span class="arrow" aria-hidden="true">
        →
      </span>
      <Show when={props.row.after !== undefined} fallback={<span>{props.empty}</span>}>
        <Amount quantity={props.row.after} />
      </Show>
    </span>
  </div>
);

export const Preview = (props: { preview: EventPreview; names?: NameIndex }): JSX.Element => {
  const names = (): NameIndex => props.names ?? NO_NAMES;
  const privacy = usePrivacy();
  const changes = () => previewChanges(props.preview, names());

  return (
    <div class="preview">
      <section class="card">
        <header>
          <h2>Posiciones</h2>
          <span class="tiny">antes → después</span>
        </header>
        <div class="beforeafter">
          <For each={changes().positions}>{(row) => <Change row={row} empty="0" />}</For>
          <Show when={changes().positions.length === 0}>
            <span class="subtle">Este evento no cambia ninguna posición.</span>
          </Show>
          <Show when={changes().positions.length > 0 && changes().unchangedPositions > 0}>
            <span class="tiny">
              {countOf(
                changes().unchangedPositions,
                "posición sin cambios",
                "posiciones sin cambios",
              )}
            </span>
          </Show>
        </div>
      </section>

      <Show when={changes().lots.length > 0}>
        <section class="card">
          <header>
            <h2>Lotes fiscales</h2>
            <span class="tiny">antes → después</span>
          </header>
          <div class="beforeafter">
            <For each={changes().lots}>{(row) => <Change row={row} empty="—" />}</For>
            <Show when={changes().unchangedLots > 0}>
              <span class="tiny">
                {countOf(changes().unchangedLots, "lote sin cambios", "lotes sin cambios")}
              </span>
            </Show>
          </div>
        </section>
      </Show>

      <Show when={props.preview.gains.length > 0}>
        <section class="card">
          <header>
            <h2>Ganancia que genera</h2>
          </header>
          <div class="beforeafter">
            <For each={props.preview.gains}>
              {(gain) => (
                <div class="change">
                  <span class="change-name">
                    {displayName(names(), gain.asset_id)} · {formatDate(gain.fiscal_date)}
                  </span>
                  <Amount value={gain.gain_eur_rounded} signed coloured />
                </div>
              )}
            </For>
          </div>
          <p class="note">
            Es la ganancia fiscal que quedará registrada, calculada con FIFO sobre los lotes de
            arriba.
          </p>
        </section>
      </Show>

      <For each={props.preview.warnings}>
        {(warning) => (
          <Callout tone="warning" title="Aviso">
            {describeWarning(warning, { names: names(), privacy: privacy() })}
          </Callout>
        )}
      </For>
    </div>
  );
};
