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
import {
  Amount,
  Disclosure,
  type NoticeItem,
  NoticeList,
  Parts,
  Section,
  Tag,
} from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { describeWarning } from "../../format/messages/warnings.js";
import { displayName, type NameIndex, NO_NAMES } from "../../format/names.js";
import { countOf } from "../../format/number.js";
import { usePrivacy } from "../../ledger/state.js";
import { GRID, mediaQuery } from "../../shell/media.js";
import { attentionItems } from "../../view-models/attention.js";
import { type CashRow, type ChangeRow, previewChanges } from "../../view-models/preview.js";
import { resultWord } from "../../view-models/sale.js";
import { draftSentence } from "../../view-models/sentence.js";

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
      {/* «nuevo» and «cerrado» are two states of the same row: one look for both. */}
      <Show when={props.row.isNew}>
        <Tag>nuevo</Tag>
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
        <Amount quantity={props.row.before} of={props.row.units} class="meta" />
      </Show>
      <span class="arrow" aria-hidden="true">
        →
      </span>
      <Show when={props.row.after !== undefined} fallback={<span>{props.empty}</span>}>
        <Amount quantity={props.row.after} of={props.row.units} />
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

/** Lots in sight on a phone before they are folded behind how many. */
const LOTS_IN_SIGHT = 3;

export const Preview = (props: {
  preview: EventPreview;
  names?: NameIndex;
  /** Which fields the user typed: their figures read unmasked in the sentence. */
  revealed?: (field: string) => boolean;
}): JSX.Element => {
  const names = (): NameIndex => props.names ?? NO_NAMES;
  const wide = mediaQuery(GRID);
  const privacy = usePrivacy();
  const changes = () => previewChanges(props.preview, names());

  /**
   * The warnings the candidate raises, grouped by the same rule as Atención
   * (`attentionItems`): a sale with ten purchases inside the window of its loss
   * is one line with how many, and each purchase waits folded under it. They
   * used to be ten notices saying the same thing (third pass of the review).
   * No notice links anywhere: leaving would lose what was typed.
   */
  const notices = (): NoticeItem[] =>
    attentionItems({
      invalidCount: 0,
      warnings: props.preview.warnings,
      findings: [],
      openOrders: [],
      openTransfers: [],
      names: names(),
      privacy: privacy(),
    }).map((item) => ({
      severity: item.severity === "error" ? "danger" : "caution",
      message: item.message,
      count: item.count,
      detail:
        item.warnings.length > 1 ? (
          <Disclosure label={`Ver los ${item.warnings.length} avisos`}>
            <ul class="sentences">
              <For each={item.warnings}>
                {(warning) => (
                  <li>{describeWarning(warning, { names: names(), privacy: privacy() })}</li>
                )}
              </For>
            </ul>
          </Disclosure>
        ) : undefined,
    }));

  /** The lots that move; on a phone, beyond a few, folded behind how many. */
  const Lots = (): JSX.Element => (
    <Show when={changes().lots.length > 0}>
      <Section title="Lotes fiscales" aside={<span>antes → después</span>}>
        <Show
          when={!wide() && changes().lots.length > LOTS_IN_SIGHT}
          fallback={
            <ul class="changes">
              <For each={changes().lots}>{(row) => <Change row={row} empty="—" />}</For>
            </ul>
          }
        >
          <Disclosure label={`Ver los ${changes().lots.length} lotes`}>
            <ul class="changes">
              <For each={changes().lots}>{(row) => <Change row={row} empty="—" />}</For>
            </ul>
          </Disclosure>
        </Show>
        <Show when={changes().unchangedLots > 0}>
          <p class="card-note">
            {countOf(changes().unchangedLots, "lote sin cambios", "lotes sin cambios")}
          </p>
        </Show>
      </Section>
    </Show>
  );

  /** What a sale books: its result, by its sign. */
  const Result = (): JSX.Element => (
    <Show when={props.preview.gains.length > 0}>
      <Section title="Resultado que genera">
        <ul class="changes">
          <For each={props.preview.gains}>
            {(gain) => (
              <li class="change">
                <span class="change-name">
                  {resultWord(gain.gain_eur_rounded)} · {displayName(names(), gain.asset_id)} ·{" "}
                  {formatDate(gain.fiscal_date)}
                </span>
                <Amount value={gain.gain_eur_rounded} signed coloured />
              </li>
            )}
          </For>
        </ul>
        <p class="card-note">
          Es el resultado fiscal que quedará registrado, calculado con FIFO sobre los lotes que
          cierra.
        </p>
      </Section>
    </Show>
  );

  return (
    <div class="preview">
      <p class="sentence">
        <Parts
          parts={draftSentence(props.preview.candidate, names())}
          {...(props.revealed === undefined ? {} : { revealed: props.revealed })}
        />
      </p>
      {/*
        On a phone what a sale books comes first, and its lots wait folded: a
        sale of a hundred units listed some twenty closed lots before its
        result (final pass of the review). On a desk, beside the form, they fit.
      */}
      <Show when={!wide()}>
        <Result />
      </Show>
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

      <Show when={wide()}>
        <Lots />
        <Result />
      </Show>

      <Show when={!wide()}>
        <Lots />
      </Show>

      <Show when={notices().length > 0}>
        <Section title="Avisos">
          <NoticeList items={notices()} label="Avisos del movimiento" />
        </Section>
      </Show>
    </div>
  );
};
