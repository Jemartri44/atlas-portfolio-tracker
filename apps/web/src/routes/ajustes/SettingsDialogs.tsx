// The questions a configuration change has to ask before it is written, each
// one about damage that is invisible in the form:
//
//   1. which live warnings this change switches off (constitution IV),
//   2. which lines keep an ECB rate of another date (criterion 25, feature 012),
//   3. which closed tax years it moves (ADR-0013),
//   4. which events already in the ledger stop being valid (ADR-0015).
//
// All three come from the domain, so the CLI and the web cannot disagree about
// what a change does. Here there is only the wording left.

import type { FilingModel, FiscalYearImpact, LedgerEvent, Warning } from "@atlas/domain";
import type { ClosedYearImpact } from "@atlas/domain/fiscal";
import { For, type JSX, Show } from "solid-js";
import { Amount, ClosedYearNotice, ConfirmDialog } from "../../components/index.js";
import { eventLabel } from "../../format/labels.js";
import { describeWarning } from "../../format/messages/warnings.js";
import { type NameIndex, NO_NAMES } from "../../format/names.js";
import { countOf } from "../../format/number.js";
import { maskFigures } from "../../format/privacy.js";
import { usePrivacy } from "../../ledger/state.js";
import { RuleChangeDialog } from "./RuleChangeDialog.jsx";
import type { RuleChangeQuestion } from "./rule-change.js";

/** An event that the new configuration would leave invalid (ADR-0015). */
export interface InvalidatedEvent {
  id: string;
  type: string;
  error: string;
}

interface DialogsProps {
  /** Defined while the question is open; `undefined` closes it. */
  silenced: readonly Warning[] | undefined;
  moved: readonly FiscalYearImpact[] | undefined;
  /** Filed returns this change would move, with the figures it moves (FR-018). */
  closedYears: readonly ClosedYearImpact[];
  invalidating: readonly InvalidatedEvent[] | undefined;
  onDismiss: (which: "silenced" | "moved" | "invalidating") => void;
  /** Save again; `acceptInvalid` only for the third question (ADR-0015). */
  onSave: (acceptInvalid?: boolean) => void;
  /** The catalogue, so a silenced warning names its asset. */
  names?: NameIndex;
  /** The ECB rates a change of `fiscal_date_rule` leaves behind (criterion 25). */
  rates: RuleChangeQuestion;
  events: readonly LedgerEvent[];
}

const IN_MODEL: Record<FilingModel, string> = {
  renta: "en la Renta",
  "720": "en el Modelo 720",
  "721": "en el Modelo 721",
};

/**
 * The headline of the question about past years, which is the first thing
 * read. It says gains move **only** when a realized gain moves: since the
 * review of feature 011 a change of the fiscal date rule reaches a Modelo 720
 * or 721 too, which declares no gains, and the headline said otherwise. With
 * no gain moving it names the one model reached, or stays neutral when
 * returns of several models are.
 */
export const movedTitle = (
  moved: readonly FiscalYearImpact[],
  closedYears: readonly ClosedYearImpact[],
): string => {
  if (moved.length > 0) {
    return "Este cambio mueve ganancias de ejercicios anteriores";
  }
  const models = [...new Set(closedYears.map((impact) => impact.model))];
  if (models.length === 1) {
    return `Este cambio puede afectar a lo que declaraste ${IN_MODEL[models[0] as FilingModel]}`;
  }
  return "Este cambio puede afectar a declaraciones ya presentadas";
};

export const SettingsDialogs = (props: DialogsProps): JSX.Element => {
  const privacy = usePrivacy();

  return (
    <>
      <RuleChangeDialog
        impact={props.rates.impact()}
        events={props.events}
        names={props.names ?? NO_NAMES}
        onClose={props.rates.clear}
        onConfirm={() => {
          props.rates.answer();
          props.onSave();
        }}
      />
      <ConfirmDialog
        open={props.silenced !== undefined}
        title="Este cambio silencia avisos activos"
        confirm="Guardar de todas formas"
        onClose={() => props.onDismiss("silenced")}
        onConfirm={() => props.onSave()}
      >
        <p>Con la configuración nueva, estos avisos que hoy están activos dejarían de salir:</p>
        <ul>
          <For each={props.silenced ?? []}>
            {(warning) => (
              <li>
                {describeWarning(warning, { names: props.names ?? NO_NAMES, privacy: privacy() })}
              </li>
            )}
          </For>
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        open={props.moved !== undefined}
        title={movedTitle(props.moved ?? [], props.closedYears)}
        confirm="Guardar de todas formas"
        onClose={() => props.onDismiss("moved")}
        onConfirm={() => props.onSave()}
      >
        <p>
          Los hechos no cambian, cambia su lectura: una declaración ya presentada puede dejar de
          cuadrar.
        </p>
        <ClosedYearNotice impacts={props.closedYears} />
        <Show when={(props.moved ?? []).length > 0}>
          <table>
            <thead>
              <tr>
                <th scope="col">Ejercicio</th>
                <th scope="col" class="num">
                  Antes
                </th>
                <th scope="col" class="num">
                  Después
                </th>
              </tr>
            </thead>
            <tbody>
              <For each={props.moved ?? []}>
                {(impact) => (
                  <tr>
                    <td>{impact.year}</td>
                    <td class="num">
                      <Amount value={impact.before} />
                    </td>
                    <td class="num">
                      <Amount value={impact.after} />
                    </td>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </ConfirmDialog>

      <ConfirmDialog
        open={props.invalidating !== undefined}
        title="Hay eventos que quedarían inválidos"
        confirm="Aceptar y guardar"
        onClose={() => props.onDismiss("invalidating")}
        onConfirm={() => props.onSave(true)}
      >
        <p>
          Con la configuración nueva,{" "}
          {countOf(
            props.invalidating?.length ?? 0,
            "movimiento ya registrado deja",
            "movimientos ya registrados dejan",
          )}{" "}
          de ser válidos. Los hechos no cambian, cambia cómo se leen: las consultas seguirán
          avisando y no podrás registrar nada más hasta rectificarlos.
        </p>
        <ul>
          <For each={props.invalidating ?? []}>
            {(item) => (
              <li>
                {eventLabel(item.type)}: {maskFigures(item.error, privacy())}
              </li>
            )}
          </For>
        </ul>
      </ConfirmDialog>
    </>
  );
};
