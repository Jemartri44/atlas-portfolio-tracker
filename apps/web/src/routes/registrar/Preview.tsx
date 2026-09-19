// What is going to happen, before it happens (FR-044).
//
// The positions, the cash and the lots **that change**, the gains the event would book and
// the warnings it raises — all of it from the domain use case the CLI also uses
// (`previewEvent`, decision (h)), so the preview cannot disagree with the
// write. What does not move is counted, not listed (`previewChanges`).
//
// Every quantity goes through `Amount`: the preview printed them raw, so with
// the privacy mode on it listed every lot of the fund to four decimals.

import type { EventPreview } from "@atlas/domain";
import { For, type JSX, Show } from "solid-js";
import { Amount, Notice, Section, Tag } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { describeWarning } from "../../format/messages/warnings.js";
import { displayName, type NameIndex, NO_NAMES } from "../../format/names.js";
import { countOf } from "../../format/number.js";
import { usePrivacy } from "../../ledger/state.js";
import { type CashRow, type ChangeRow, previewChanges } from "../../view-models/preview.js";

/**
 * One row: its name on top, wrapping if it has to, and the two figures under
 * it or beside it. The name used to be `nowrap` in a flex row that could not
 * shrink, so a long fund name pushed the card 58 to 207 px past a phone screen
 * and dragged the "Registrar" button under the navigation bar.
 */
const Change = (props: { row: ChangeRow; empty: string }): JSX.Element => (
  <li class="change">
    <span class="change-name">
      {props.row.label}
      <Show when={props.row.isNew}>
        <Tag tone="done">nuevo</Tag>
      </Show>
      <Show when={props.row.closed}>
        <Tag>cerrado</Tag>
      </Show>
    </span>
    <span class="values">
      <Show
        when={props.row.before !== undefined}
        fallback={<span class="meta">{props.empty}</span>}
      >
        <Amount quantity={props.row.before} class="meta" />
      </Show>
      <span class="arrow" aria-hidden="true">
        →
      </span>
      <Show when={props.row.after !== undefined} fallback={<span>{props.empty}</span>}>
        <Amount quantity={props.row.after} />
      </Show>
    </span>
  </li>
);

/** The cash of an account, before and after; amounts, so the mask covers them. */
const Cash = (props: { row: CashRow }): JSX.Element => (
  <li class="change">
    <span class="change-name">
      {props.row.label}
      <Show when={props.row.short}>
        <Tag tone="caution" icon="caution">
          en negativo
        </Tag>
      </Show>
    </span>
    <span class="values">
      <Amount value={props.row.before} class="meta" />
      <span class="arrow" aria-hidden="true">
        →
      </span>
      <Amount value={props.row.after} />
    </span>
  </li>
);

export const Preview = (props: { preview: EventPreview; names?: NameIndex }): JSX.Element => {
  const names = (): NameIndex => props.names ?? NO_NAMES;
  const privacy = usePrivacy();
  const changes = () => previewChanges(props.preview, names());

  return (
    <div class="preview">
      <Section title="Posiciones" aside={<span>antes → después</span>}>
        <ul class="changes">
          <For each={changes().positions}>{(row) => <Change row={row} empty="0" />}</For>
        </ul>
        <Show when={changes().positions.length === 0}>
          <p class="meta">Este movimiento no cambia ninguna posición.</p>
        </Show>
        <Show when={changes().positions.length > 0 && changes().unchangedPositions > 0}>
          <p class="card-note">
            {countOf(
              changes().unchangedPositions,
              "posición sin cambios",
              "posiciones sin cambios",
            )}
          </p>
        </Show>
      </Section>

      <Show when={changes().cash.length > 0}>
        <Section title="Efectivo" aside={<span>antes → después</span>}>
          <ul class="changes">
            <For each={changes().cash}>{(row) => <Cash row={row} />}</For>
          </ul>
        </Section>
      </Show>

      <Show when={changes().lots.length > 0}>
        <Section title="Lotes fiscales" aside={<span>antes → después</span>}>
          <ul class="changes">
            <For each={changes().lots}>{(row) => <Change row={row} empty="—" />}</For>
          </ul>
          <Show when={changes().unchangedLots > 0}>
            <p class="card-note">
              {countOf(changes().unchangedLots, "lote sin cambios", "lotes sin cambios")}
            </p>
          </Show>
        </Section>
      </Show>

      <Show when={props.preview.gains.length > 0}>
        <Section title="Ganancia que genera">
          <ul class="changes">
            <For each={props.preview.gains}>
              {(gain) => (
                <li class="change">
                  <span class="change-name">
                    {displayName(names(), gain.asset_id)} · {formatDate(gain.fiscal_date)}
                  </span>
                  <Amount value={gain.gain_eur_rounded} signed coloured />
                </li>
              )}
            </For>
          </ul>
          <p class="card-note">
            Es la ganancia fiscal que quedará registrada, calculada con FIFO sobre los lotes de
            arriba.
          </p>
        </Section>
      </Show>

      <For each={props.preview.warnings}>
        {(warning) => (
          <Notice severity="caution" title="Aviso">
            {describeWarning(warning, { names: names(), privacy: privacy() })}
          </Notice>
        )}
      </For>
    </div>
  );
};
