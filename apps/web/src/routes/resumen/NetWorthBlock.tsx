// The patrimony: always broken down, never a single number (constitution III).
// The total shown is the sum of the figures shown, so adding the column gives
// the number at the top, and the partial mark says when something is missing
// instead of quietly showing a smaller total.
//
// On a phone: the figure, the proportion bar and the three books as rows; on
// a wide screen, a band with the figure on the left and the books as columns
// (docs/design/system.md §5.2). The figure has no cents (D10). The shares are
// percentages and stay visible with the privacy mode on; with a partial total
// there are none, because they would be shares of an incomplete total.

import { For, type JSX, Show } from "solid-js";
import { LineKey } from "../../components/chart/ChartLegend.jsx";
import { Amount, Disclosure, Figure, Pending, Tag } from "../../components/index.js";
import type { NetWorthBlock as Block, BlockKey, NetWorthView } from "../../view-models/index.js";

/** The same line keys as the evolution chart: colour and dash. */
const KEYS: Record<BlockKey, { colour: string; dash?: readonly number[] }> = {
  core: { colour: "--c-series-core" },
  bucket: { colour: "--c-series-bucket", dash: [6, 4] },
  cash: { colour: "--c-series-cash", dash: [1, 5] },
};

const widthOf = (share: string | undefined): number => {
  const value = Number.parseFloat(share ?? "");
  return Number.isFinite(value) ? value : -1;
};

/**
 * A stacked bar of the three shares, cut apart by the colour of the surface.
 * Only when every share is a share: a negative balance would draw a bar that
 * lies, and the percentages beside each book already say it.
 */
const Shares = (props: { blocks: readonly Block[] }): JSX.Element => {
  const boxes = () => {
    let cursor = 0;
    return props.blocks.map((block) => {
      const width = widthOf(block.share);
      const box = { key: block.key, x: cursor, width };
      cursor += width;
      return box;
    });
  };
  return (
    <Show when={props.blocks.every((block) => widthOf(block.share) >= 0)}>
      <svg class="shares" aria-hidden="true">
        <For each={boxes()}>
          {(box) => (
            <rect
              x={`${box.x}%`}
              y="0"
              width={`${box.width}%`}
              height="100%"
              class={`share-seg is-${box.key}`}
            />
          )}
        </For>
      </svg>
    </Show>
  );
};

/** The lines of one book, inside the breakdown. */
const Lines = (props: { block: Block }): JSX.Element => (
  <>
    <p class="block-title">{props.block.label}</p>
    <For each={props.block.lines}>
      {(line) => (
        <div class="stat-row">
          <span class="label" title={line.detail}>
            {line.name}
            <Show when={line.partial === true}>
              {" "}
              <Tag icon="half">parcial</Tag>
            </Show>
          </span>
          <span class="value">
            <Amount value={line.value} missingReason={line.missing} />
          </span>
        </div>
      )}
    </For>
    <Show when={props.block.lines.length === 0}>
      <p class="meta">Sin posiciones.</p>
    </Show>
  </>
);

export const NetWorthBlock = (props: { view: NetWorthView }): JSX.Element => (
  <section class="card hero span-12" aria-label="Patrimonio total">
    <div class="hero-main">
      <div class="card-head">
        <h2>Patrimonio total</h2>
      </div>
      <p class="hero-figure">
        <Amount value={props.view.total} decimals={0} missingReason="nada tiene precio" />
        <Show when={props.view.partial}>
          <Tag icon="half" title={`Faltan: ${props.view.missing.join(", ")}`}>
            parcial
          </Tag>
        </Show>
      </p>
      <Show when={!props.view.partial}>
        <Shares blocks={props.view.blocks} />
      </Show>
    </div>

    <ul class="parts">
      <For each={props.view.blocks}>
        {(block) => (
          <li class="part">
            <span class="part-label">
              <LineKey colour={KEYS[block.key].colour} dash={KEYS[block.key].dash} />
              <span>{block.label}</span>
              <Show when={block.partial && block.subtotal !== undefined}>
                <Tag icon="half">parcial</Tag>
              </Show>
            </span>
            <span class="part-figs">
              <Show when={block.share !== undefined}>
                <Figure value={block.share} unit="percent" decimals={0} class="part-share" />
              </Show>
              <Amount
                value={block.subtotal}
                decimals={0}
                class="part-fig"
                missingReason="ninguna posición tiene precio"
              />
            </span>
          </li>
        )}
      </For>
    </ul>

    <Show when={props.view.missing.length > 0}>
      <Pending action={{ label: "Registrar valoraciones", to: "/registrar/valuation" }}>
        Sin precio o sin tipo de cambio: {props.view.missing.join(", ")}. El total solo suma lo que
        sí lo tiene.
      </Pending>
    </Show>

    <Disclosure label="Ver desglose por activo y cuenta">
      <For each={props.view.blocks}>{(block) => <Lines block={block} />}</For>
    </Disclosure>
  </section>
);
