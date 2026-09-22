// The three questions a configuration change has to ask before it is written,
// each one about damage that is invisible in the form:
//
//   1. which live warnings this change switches off (constitution IV),
//   2. which closed tax years it moves (ADR-0013),
//   3. which events already in the ledger stop being valid (ADR-0015).
//
// All three come from the domain, so the CLI and the web cannot disagree about
// what a change does. Here there is only the wording left.

import type { FiscalYearImpact, Warning } from "@atlas/domain";
import { For, type JSX } from "solid-js";
import { Amount, ConfirmDialog } from "../../components/index.js";
import { eventLabel } from "../../format/labels.js";
import { describeWarning } from "../../format/messages/warnings.js";
import { type NameIndex, NO_NAMES } from "../../format/names.js";
import { countOf } from "../../format/number.js";
import { maskFigures } from "../../format/privacy.js";
import { usePrivacy } from "../../ledger/state.js";

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
  invalidating: readonly InvalidatedEvent[] | undefined;
  onDismiss: (which: "silenced" | "moved" | "invalidating") => void;
  /** Save again; `acceptInvalid` only for the third question (ADR-0015). */
  onSave: (acceptInvalid?: boolean) => void;
  /** The catalogue, so a silenced warning names its asset. */
  names?: NameIndex;
}

export const SettingsDialogs = (props: DialogsProps): JSX.Element => {
  const privacy = usePrivacy();

  return (
    <>
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
        title="Este cambio mueve ganancias de ejercicios anteriores"
        confirm="Guardar de todas formas"
        onClose={() => props.onDismiss("moved")}
        onConfirm={() => props.onSave()}
      >
        <p>
          Los hechos no cambian, cambia su lectura: una declaración ya presentada puede dejar de
          cuadrar.
        </p>
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
