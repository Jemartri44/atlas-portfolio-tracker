// The notes of the report the return shows on their own card: the ECB rates of a line in doubt
// (ADR-0029, criterion 25), whose figure does not move and should be checked before declaring, and
// the income in kind the user has to add.

import type { LedgerEvent, Warning } from "@atlas/domain";
import { For, type JSX, Show } from "solid-js";
import { Notice } from "../../components/index.js";
import { eventReferences, inSentence } from "../../format/events.js";
import { describeWarning } from "../../format/messages/warnings.js";
import type { NameIndex } from "../../format/names.js";

interface NotesProps {
  notes: readonly Warning[];
  events: readonly LedgerEvent[];
  names: NameIndex;
  privacy: boolean;
}

/** The notes of the report with these codes, each with the event it speaks of. */
const NotesCard = (
  props: NotesProps & { codes: readonly string[]; title: string; children?: JSX.Element },
): JSX.Element => {
  const shown = () => props.notes.filter((note) => props.codes.includes(note.code));
  const reference = () => eventReferences(props.events, props.names);
  return (
    <Show when={shown().length > 0}>
      <div class="span-12">
        <Notice severity="caution" title={props.title}>
          <ul class="sentences">
            <For each={shown()}>
              {(note) => (
                <li>
                  {inSentence(reference()(note.event_id))}:{" "}
                  {describeWarning(note, { names: props.names, privacy: props.privacy })}
                </li>
              )}
            </For>
          </ul>
          {props.children}
        </Notice>
      </div>
    </Show>
  );
};

export const RateNotes = (props: NotesProps): JSX.Element => (
  <NotesCard
    {...props}
    codes={["tax_fx_rate_finding", "tax_fx_rate_unverified", "tax_fx_rate_date_after_fiscal_date"]}
    title="Tipos del BCE de estas líneas (criterio 25)"
  >
    Para corregirlo, «Ajustes → Verificación» dice qué tipos no son los oficiales.
  </NotesCard>
);

/** Atlas does not compute the general base: this income is shown for the user to add (criterion 8). */
export const InKindNotes = (props: NotesProps): JSX.Element => (
  <NotesCard
    {...props}
    codes={["tax_in_kind_income_not_integrated", "tax_in_kind_income_missing"]}
    title="Renta en especie: súmala tú"
  />
);
