// The patrimony: always broken down, never a single number (constitution III).
// The total shown is the sum of the figures shown, so adding the column gives
// the number at the top, and the partial mark says when something is missing
// instead of quietly showing a smaller total.
//
// Direction A (docs/design/system.md §5.2): the figure in the serif, the return of the core under
// it, the proportion bar, and the three books as tiles — on a wide screen side by side, each with
// its own figure and the small line of its evolution (piece 1 of direction B); on a phone, rows.
// The shares and the returns are percentages and stay visible with the privacy mode on; with a
// partial total there are no shares, because they would be shares of an incomplete total.

import type { CoreReturn, CoreReturnGap } from "@atlas/domain/charts";
import { For, type JSX, Show } from "solid-js";
import { LineKey } from "../../components/chart/ChartLegend.jsx";
import { Sparkline } from "../../components/chart/Sparkline.jsx";
import { Amount, Disclosure, Figure, Pending, Tag } from "../../components/index.js";
import type { NetWorthBlock as Block, BlockKey, NetWorthView } from "../../view-models/index.js";

/** The same line keys as the evolution chart: colour and dash. */
const KEYS: Record<BlockKey, { colour: string; dash?: readonly number[] }> = {
  core: { colour: "--c-series-core" },
  bucket: { colour: "--c-series-bucket", dash: [6, 4] },
  cash: { colour: "--c-series-cash", dash: [1, 5] },
};

/** What the summary knows of each book besides its value, once it has computed it. */
export interface BookFigures {
  month?: CoreReturn | undefined;
  year?: CoreReturn | undefined;
  /** The bucket against the same money in the index, in percent. */
  bucketVsIndexPct?: string | undefined;
  /** Investment accounts with a balance on the date. */
  cashAccounts: number;
  /** The last year of each tile's own value (the figure it shows), for its small line. */
  spark: Record<BlockKey, readonly (number | null)[]>;
}

const GAPS: Record<CoreReturnGap, string> = {
  partial: "falta un precio",
  short_history: "poca historia",
  uncovered_buys: "compras sin su ingreso",
  no_base: "nada invertido",
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

/** «este mes +2,1 %», or why there is no figure: never a made-up one. */
const Return = (props: { label: string; value: CoreReturn | undefined; period: string }) => (
  <span class="delta">
    {props.label}{" "}
    <Show
      when={props.value?.pct}
      fallback={
        <span class="nodata">
          {props.value?.gap === "short_history"
            ? `menos de ${props.period} de historia`
            : props.value?.gap === undefined
              ? "…"
              : `sin dato (${GAPS[props.value.gap]})`}
        </span>
      }
    >
      {(pct) => <Figure value={pct().toString()} unit="percent" decimals={1} signed coloured />}
    </Show>
  </span>
);

/** The line of a tile under its figure: what that book has to say. */
const Metric = (props: { block: Block; figures: BookFigures | undefined }): JSX.Element => {
  switch (props.block.key) {
    case "core":
      return (
        <>
          <Return label="este mes" value={props.figures?.month} period="un mes" />
          <Return label="12 meses" value={props.figures?.year} period="12 meses" />
        </>
      );
    case "bucket":
      return (
        <span class="delta">
          frente al índice{" "}
          <Show
            when={props.figures?.bucketVsIndexPct}
            fallback={<span class="nodata">{props.figures === undefined ? "…" : "sin dato"}</span>}
          >
            {(pct) => <Figure value={pct()} unit="percent" decimals={1} signed coloured />}
          </Show>
        </span>
      );
    default:
      return (
        <span class="delta">
          {props.figures === undefined
            ? ""
            : props.figures.cashAccounts === 1
              ? "en 1 cuenta de inversión"
              : `en ${props.figures.cashAccounts} cuentas de inversión`}
        </span>
      );
  }
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

export const NetWorthBlock = (props: {
  view: NetWorthView;
  figures?: BookFigures | undefined;
}): JSX.Element => (
  <section class="card hero span-12 summary-worth" aria-label="Patrimonio total">
    <div class="hero-main">
      <h2 class="eyebrow">Patrimonio total</h2>
      <p class="hero-figure">
        <Amount value={props.view.total} decimals={0} missingReason="nada tiene precio" />
        <Show when={props.view.partial}>
          <Tag icon="half" title={`Faltan: ${props.view.missing.join(", ")}`}>
            parcial
          </Tag>
        </Show>
      </p>
      <p class="hero-deltas">
        <span>Cartera principal:</span>
        <Return label="este mes" value={props.figures?.month} period="un mes" />
        <Return label="12 meses" value={props.figures?.year} period="12 meses" />
      </p>
      <Show when={!props.view.partial}>
        <Shares blocks={props.view.blocks} />
      </Show>
    </div>

    <ul class="parts">
      <For each={props.view.blocks}>
        {(block) => (
          <li class={`part is-${block.key}`}>
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
            <span class="part-metric">
              <Metric block={block} figures={props.figures} />
            </span>
            <Show when={props.figures}>
              {(figures) => <Sparkline values={figures().spark[block.key]} tone={block.key} />}
            </Show>
          </li>
        )}
      </For>
    </ul>

    <Show when={props.view.missing.length === 1}>
      <Pending line action={{ label: "Registrar", to: "/registrar/valuation" }}>
        Sin precio: {props.view.missing[0]}.
      </Pending>
    </Show>
    <Show when={props.view.missing.length > 1}>
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
