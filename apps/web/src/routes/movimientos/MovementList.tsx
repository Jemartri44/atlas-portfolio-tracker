// The rows of the ledger. **One data source, two presentations**: two-line
// cards under 768px and a native table from there up, switched by CSS
// (`styles/components.css`). No sideways scrollbar at 360px, which is an
// acceptance criterion and not an aspiration (FR-031).

import { A } from "@solidjs/router";
import { For, type JSX, Show } from "solid-js";
import { Amount, Badge } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import type { MovementRow } from "../../view-models/index.js";

const StatusBadge = (props: { row: MovementRow }): JSX.Element => (
  <Show when={props.row.status !== "current"}>
    <Badge tone={props.row.status === "reversed" ? "negative" : "neutral"}>
      {props.row.statusLabel}
    </Badge>
  </Show>
);

const Figure = (props: { row: MovementRow }): JSX.Element => (
  <Show
    when={props.row.amount !== undefined}
    fallback={
      <Show when={props.row.quantity !== undefined} fallback={<span class="tiny">—</span>}>
        <Amount quantity={props.row.quantity} />
      </Show>
    }
  >
    <Amount value={props.row.amount} />
  </Show>
);

export const MovementList = (props: { rows: readonly MovementRow[] }): JSX.Element => (
  <>
    {/* Phone: a card per row, the whole card is the target. */}
    <div class="movements">
      <For each={props.rows}>
        {(row) => (
          <A
            href={`/movimientos/${row.id}`}
            class={`movement${row.status === "reversed" ? " is-reversed" : ""}`}
          >
            <span class="head">
              <span class="type">{row.typeLabel}</span>
              <span class="tiny">{formatDate(row.date)}</span>
              <StatusBadge row={row} />
              <Show when={row.invalidReason !== undefined}>
                <Badge tone="negative" title={row.invalidReason}>
                  inválido
                </Badge>
              </Show>
            </span>
            <span class="amount">
              <Figure row={row} />
            </span>
            <span class="sub">{row.subtitle}</span>
          </A>
        )}
      </For>
    </div>

    {/* Desktop: the same rows as a dense table. */}
    <table class="movements-table">
      <thead>
        <tr>
          <th scope="col">Fecha</th>
          <th scope="col">Tipo</th>
          <th scope="col">Cuenta y activo</th>
          <th scope="col">Estado</th>
          <th scope="col" class="num">
            Importe o cantidad
          </th>
        </tr>
      </thead>
      <tbody>
        <For each={props.rows}>
          {(row) => (
            <tr>
              <td>
                <A href={`/movimientos/${row.id}`}>{formatDate(row.date)}</A>
                <Show when={row.administrative}>
                  <span class="tiny" title="Fecha de registro: este tipo no tiene fecha de negocio">
                    {" "}
                    (registro)
                  </span>
                </Show>
              </td>
              <td>{row.typeLabel}</td>
              <td class="truncate">{row.subtitle}</td>
              <td>
                <Show when={row.status !== "current"} fallback={<span class="tiny">vigente</span>}>
                  <StatusBadge row={row} />
                </Show>
                <Show when={row.invalidReason !== undefined}>
                  {" "}
                  <Badge tone="negative" title={row.invalidReason}>
                    inválido
                  </Badge>
                </Show>
              </td>
              <td class="num">
                <Figure row={row} />
              </td>
            </tr>
          )}
        </For>
      </tbody>
    </table>
  </>
);
