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
import { describeWarning } from "../../format/messages/warnings.js";

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
}

export const SettingsDialogs = (props: DialogsProps): JSX.Element => (
  <>
    <ConfirmDialog
      open={props.silenced !== undefined}
      title="Este cambio silencia avisos activos"
      confirm="Guardar de todas formas"
      onClose={() => props.onDismiss("silenced")}
      onConfirm={() => props.onSave()}
    >
      <p>Subir un umbral no debe apagar un aviso vivo sin que te enteres (constitución IV):</p>
      <ul>
        <For each={props.silenced ?? []}>{(warning) => <li>{describeWarning(warning)}</li>}</For>
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
        Con la configuración nueva, {props.invalidating?.length} eventos ya registrados dejan de ser
        válidos. Los hechos no cambian, cambia su interpretación (ADR-0015): las consultas seguirán
        avisando y no podrás registrar hasta rectificarlos.
      </p>
      <ul>
        <For each={props.invalidating ?? []}>
          {(item) => (
            <li>
              {item.type}: {item.error}
            </li>
          )}
        </For>
      </ul>
    </ConfirmDialog>
  </>
);
