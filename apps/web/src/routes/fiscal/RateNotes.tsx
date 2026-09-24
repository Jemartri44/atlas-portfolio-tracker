// The notes of the report about ECB rates (feature 012, blocks 4 and 6;
// ADR-0029, points 8 and 10; criterion 25): a line that depends on a rate in
// doubt, or dated after its fiscal date. The figure is the ledger's and does
// not move; what the note says is that it should be checked before declaring.
// The report carried them since block 4, and nothing on this screen said them.

import type { LedgerEvent, Warning } from "@atlas/domain";
import { For, type JSX, Show } from "solid-js";
import { Notice } from "../../components/index.js";
import { eventReferences, inSentence } from "../../format/events.js";
import { describeWarning } from "../../format/messages/warnings.js";
import type { NameIndex } from "../../format/names.js";

const CODES = new Set([
  "tax_fx_rate_finding",
  "tax_fx_rate_unverified",
  "tax_fx_rate_date_after_fiscal_date",
]);

export const RateNotes = (props: {
  notes: readonly Warning[];
  events: readonly LedgerEvent[];
  names: NameIndex;
  privacy: boolean;
}): JSX.Element => {
  const shown = () => props.notes.filter((note) => CODES.has(note.code));
  const reference = () => eventReferences(props.events, props.names);
  return (
    <Show when={shown().length > 0}>
      <div class="span-12">
        <Notice severity="caution" title="Tipos del BCE de estas líneas (criterio 25)">
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
          Para corregirlo, «Ajustes → Verificación» dice qué tipos no son los oficiales.
        </Notice>
      </div>
    </Show>
  );
};
