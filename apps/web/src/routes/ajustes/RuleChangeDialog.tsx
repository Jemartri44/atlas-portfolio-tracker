// The question about the ECB rates of a change of `fiscal_date_rule` (feature
// 012, block 6; criterion 25): said before saving, line by line, with what is
// known — and, without a history, «no se puede verificar contra el oficial»,
// never taken for right or wrong. Rates are public figures: shown, not masked.

import type { LedgerEvent } from "@atlas/domain";
import type { RuleChangeImpact, RuleChangeLine } from "@atlas/domain/ecb";
import { For, type JSX, Show } from "solid-js";
import { ConfirmDialog } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { eventReferences, inSentence } from "../../format/events.js";
import type { NameIndex } from "../../format/names.js";
import { countOf, formatExact } from "../../format/number.js";

const official = (line: RuleChangeLine): string =>
  line.official === undefined
    ? ""
    : ` El oficial es ${formatExact(line.official.rate)} del ${formatDate(line.official.date)}.`;

const VERDICT: Record<RuleChangeLine["verdict"], string> = {
  after_fiscal_date: "El tipo queda fechado después de su fecha fiscal.",
  not_official: "Deja de ser el tipo de su fecha fiscal.",
  unverifiable: "No se puede verificar contra el oficial.",
};

export const RuleChangeDialog = (props: {
  impact: RuleChangeImpact | undefined;
  events: readonly LedgerEvent[];
  names: NameIndex;
  onClose: () => void;
  onConfirm: () => void;
}): JSX.Element => {
  const reference = () => eventReferences(props.events, props.names);
  return (
    <ConfirmDialog
      open={props.impact !== undefined}
      title="Este cambio deja tipos del BCE de otra fecha"
      confirm="Guardar de todas formas"
      onClose={props.onClose}
      onConfirm={props.onConfirm}
    >
      <p>
        Con la regla nueva cambia la fecha fiscal de{" "}
        {countOf(props.impact?.lines.length ?? 0, "una línea", "líneas")} y su tipo del BCE puede
        dejar de ser el de esa fecha. No se recalcula nada: las cifras siguen usando el tipo de tus
        datos hasta que lo corrijas desde «Verificación».
      </p>
      <ul class="sentences">
        <For each={props.impact?.lines ?? []}>
          {(line) => (
            <li>
              {inSentence(reference()(line.event_id))}: {formatExact(line.rate)} {line.currency} del{" "}
              {formatDate(line.rate_date)}; su fecha fiscal pasa al{" "}
              {formatDate(line.new_fiscal_date)}. {VERDICT[line.verdict]}
              {official(line)}
            </li>
          )}
        </For>
      </ul>
      <Show when={props.impact?.checked === false}>
        <p class="card-note">
          No hay histórico del BCE en este dispositivo: solo se sabe qué tipos quedan fechados
          después de su fecha fiscal. El resto no se puede verificar contra el oficial.
        </p>
      </Show>
    </ConfirmDialog>
  );
};
