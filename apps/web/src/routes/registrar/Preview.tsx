// What is going to happen, before it happens (FR-044).
//
// The event as it will be written, the positions and lots **before and after**,
// the gains it would book and the warnings it raises — all of it from the
// domain use case the CLI also uses (`previewEvent`, decision (h)), so the
// preview cannot disagree with the write.

import type { EventPreview } from "@atlas/domain";
import { For, type JSX, Show } from "solid-js";
import { Amount, Badge, Callout } from "../../components/index.js";
import { describeWarning } from "../../format/messages/warnings.js";
import { displayName, type NameIndex, NO_NAMES } from "../../format/names.js";
import { usePrivacy } from "../../ledger/state.js";

const positionKey = (row: { account_id: string; asset_id: string }): string =>
  `${row.account_id}|${row.asset_id}`;

export const Preview = (props: { preview: EventPreview; names?: NameIndex }): JSX.Element => {
  const names = (): NameIndex => props.names ?? NO_NAMES;
  const privacy = usePrivacy();
  const positions = (): {
    key: string;
    label: string;
    before?: string | undefined;
    after?: string | undefined;
  }[] => {
    const keys = new Map<string, string>();
    for (const row of [...props.preview.before.positions, ...props.preview.after.positions]) {
      keys.set(
        positionKey(row),
        `${displayName(names(), row.asset_id)} · ${displayName(names(), row.account_id)}`,
      );
    }
    return [...keys.entries()].map(([key, label]) => ({
      key,
      label,
      before: props.preview.before.positions
        .find((row) => positionKey(row) === key)
        ?.quantity.toString(),
      after: props.preview.after.positions
        .find((row) => positionKey(row) === key)
        ?.quantity.toString(),
    }));
  };

  const lots = (): {
    id: string;
    label: string;
    before?: string | undefined;
    after?: string | undefined;
    closed: boolean;
  }[] => {
    const ids = new Map<string, { asset_id: string; acquisition_date: string }>();
    for (const lot of [...props.preview.before.lots, ...props.preview.after.lots]) {
      ids.set(lot.id, { asset_id: lot.asset_id, acquisition_date: lot.acquisition_date });
    }
    return [...ids.entries()]
      .map(([id, info]) => {
        const before = props.preview.before.lots.find((lot) => lot.id === id);
        const after = props.preview.after.lots.find((lot) => lot.id === id);
        return {
          id,
          label: `${displayName(names(), info.asset_id)} · adquirido el ${info.acquisition_date}`,
          before: before?.quantity.toString(),
          after: after?.quantity.toString(),
          closed: after?.closed === true,
        };
      })
      .filter((row) => !(row.before === undefined && row.after === undefined));
  };

  return (
    <div class="preview">
      <section class="card">
        <header>
          <h2>Posiciones</h2>
          <span class="tiny">antes → después</span>
        </header>
        <div class="beforeafter">
          <For each={positions()}>
            {(row) => (
              <div class="change">
                <span class="change-name">{row.label}</span>
                <span class="values">
                  <span class="num subtle">{row.before ?? "0"}</span>
                  <span class="arrow" aria-hidden="true">
                    →
                  </span>
                  <span class="num">{row.after ?? "0"}</span>
                </span>
              </div>
            )}
          </For>
          <Show when={positions().length === 0}>
            <span class="subtle">Este evento no cambia ninguna posición.</span>
          </Show>
        </div>
      </section>

      <Show when={lots().length > 0}>
        <section class="card">
          <header>
            <h2>Lotes fiscales</h2>
            <span class="tiny">antes → después</span>
          </header>
          <div class="beforeafter">
            <For each={lots()}>
              {(row) => (
                <div class="change">
                  <span class="change-name">
                    {row.label}
                    <Show when={row.closed}>
                      {" "}
                      <Badge>cerrado</Badge>
                    </Show>
                  </span>
                  <span class="values">
                    <span class="num subtle">{row.before ?? "—"}</span>
                    <span class="arrow" aria-hidden="true">
                      →
                    </span>
                    <span class="num">{row.after ?? "—"}</span>
                  </span>
                </div>
              )}
            </For>
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
                  <span>
                    {displayName(names(), gain.asset_id)} · {gain.fiscal_date}
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
