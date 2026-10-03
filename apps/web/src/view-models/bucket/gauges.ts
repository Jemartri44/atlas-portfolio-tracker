// The gauges of the bucket and the dumbbells of its theses, as what a drawing
// needs (feature 020, E3, M10).
//
// **Every figure is the domain's** (`bucketGauges`, `thesisVsIndexPct`), and
// every mark is too: the mark of the warning is `NEAR_LIMIT_PCT`, the stop rule
// and the maximum weight are `Settings`. This file only places them on an
// axis, and an axis is geometry, so `number` is fine here: nothing that is read
// as a percentage is computed with it. The text of a figure stays a decimal
// string and is rounded once, when it is shown.

import type { BucketGauges } from "@atlas/domain/charts";
import { formatPercent, meaningfulDecimals } from "../../format/number.js";
import type { ThesisRow } from "./theses.js";

export interface GaugesView {
  contributionPctOfCap?: string;
  nearLimitPct: string;
  resultPct?: string;
  stopLossPct?: string;
  weightPct?: string;
  maxWeightPct?: string;
}

export const gaugesView = (gauges: BucketGauges): GaugesView => ({
  ...(gauges.contribution_pct_of_cap === undefined
    ? {}
    : { contributionPctOfCap: gauges.contribution_pct_of_cap.toString() }),
  nearLimitPct: gauges.near_limit_pct.toString(),
  ...(gauges.result_pct === undefined ? {} : { resultPct: gauges.result_pct.toString() }),
  ...(gauges.stop_loss_pct === undefined ? {} : { stopLossPct: gauges.stop_loss_pct.toString() }),
  ...(gauges.weight_pct === undefined ? {} : { weightPct: gauges.weight_pct.toString() }),
  ...(gauges.max_weight_pct === undefined
    ? {}
    : { maxWeightPct: gauges.max_weight_pct.toString() }),
});

/** Where things go on a bar, in percent of its width. */
export interface MeterShape {
  /** The filled part: from the left edge, or from the zero line. */
  from: number;
  to: number;
  /** The mark of the rule the figure is held against. */
  mark?: number;
  /** The zero line, when the axis has a negative side. */
  zero?: number;
  /** A dot at the end of a stem, for a signed figure. */
  dot?: number;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

const at = (value: number, low: number, high: number): number =>
  clamp(((value - low) / (high - low)) * 100, 0, 100);

/** The contribution against the cap: from 0 to the larger of 100 and what was reached. */
export const capShape = (pct: string, near: string): MeterShape => {
  const value = Number.parseFloat(pct);
  const high = Math.max(100, value);
  return { from: 0, to: at(value, 0, high), mark: at(Number.parseFloat(near), 0, high) };
};

/** The result over what was contributed: symmetric around zero, wide enough for the stop rule. */
export const resultShape = (pct: string, stop: string | undefined): MeterShape => {
  const value = Number.parseFloat(pct);
  const rule = stop === undefined ? 0 : Number.parseFloat(stop);
  const bound = Math.max(10, Math.abs(value), rule) * 1.05;
  return {
    from: 50,
    to: at(value, -bound, bound),
    zero: 50,
    dot: at(value, -bound, bound),
    ...(stop === undefined ? {} : { mark: at(-rule, -bound, bound) }),
  };
};

/** The weight of the bucket over net worth: 0 to a bit past the maximum, or past the weight. */
export const weightShape = (pct: string, max: string | undefined): MeterShape => {
  const value = Number.parseFloat(pct);
  const limit = max === undefined ? undefined : Number.parseFloat(max);
  const high = Math.max(limit === undefined ? 10 : limit * 1.5, value * 1.1, 1);
  return {
    from: 0,
    to: at(value, 0, high),
    ...(limit === undefined ? {} : { mark: at(limit, 0, high) }),
  };
};

export type MeterKey = "cap" | "result" | "weight";

/** What one gauge needs to be drawn: its words, its figure, where things go, and what a reader hears. */
export interface MeterView {
  label: string;
  /** The figure, a decimal string; it is rounded once, when it is shown. */
  value: string;
  signed: boolean;
  shape: MeterShape;
  /** The words under the mark of its rule; absent when there is no rule. */
  mark?: string;
  /** The label of the drawing: percentages only, never an amount. */
  aria: string;
  /** The one figure that adds the two books (constitution III). */
  both: boolean;
}

/** A percentage with the decimals that say something: «80 %», «6,5 %». */
const pct = (value: string, signed = false): string =>
  formatPercent(value, { decimals: meaningfulDecimals(value), ...(signed ? { signed } : {}) });

/** The gauge `which`, or nothing when the domain could not measure it. */
export const meterOf = (gauges: GaugesView, which: MeterKey): MeterView | undefined => {
  if (which === "cap" && gauges.contributionPctOfCap !== undefined) {
    const value = gauges.contributionPctOfCap;
    const near = pct(gauges.nearLimitPct);
    return {
      label: "Aportado frente al tope",
      value,
      signed: false,
      shape: capShape(value, gauges.nearLimitPct),
      mark: near,
      aria: `Aportado el ${pct(value)} del tope; aviso al ${near}`,
      both: false,
    };
  }
  if (which === "result" && gauges.resultPct !== undefined) {
    const value = gauges.resultPct;
    const stop = gauges.stopLossPct === undefined ? undefined : `−${pct(gauges.stopLossPct)}`;
    return {
      label: "Resultado sobre lo aportado",
      value,
      signed: true,
      shape: resultShape(value, gauges.stopLossPct),
      ...(stop === undefined ? {} : { mark: `parada ${stop}` }),
      aria: `Resultado de ${pct(value, true)} sobre lo aportado${
        stop === undefined ? "" : `; la regla de parada salta en ${stop}`
      }`,
      both: false,
    };
  }
  if (which === "weight" && gauges.weightPct !== undefined) {
    const value = gauges.weightPct;
    const max = gauges.maxWeightPct === undefined ? undefined : pct(gauges.maxWeightPct);
    return {
      label: "Peso del cubo en tu patrimonio",
      value,
      signed: false,
      shape: weightShape(value, gauges.maxWeightPct),
      ...(max === undefined ? {} : { mark: `máx. ${max}` }),
      aria: `El cubo pesa el ${pct(value)} del patrimonio${max === undefined ? "" : `; máximo ${max}`}`,
      both: true,
    };
  }
  return undefined;
};

export interface DumbbellRow {
  thesisId: string;
  name: string;
  period: string;
  /** Percent of the axis. */
  dot: number;
  ring: number;
  vsIndexPp: string;
  /** What a reader of the page hears: the two percentages, no amount. */
  aria: string;
}

export interface Dumbbells {
  rows: DumbbellRow[];
  /** The 0 % line, in percent of the axis. */
  zero: number;
}

/**
 * One axis for every thesis: from the lowest to the highest of the two
 * percentages, the zero included, so that the dumbbells compare with each
 * other. A thesis without a comparison is not drawn; the card already says
 * how many are left out and why.
 */
export const dumbbells = (rows: readonly ThesisRow[]): Dumbbells => {
  const drawn = rows.filter(
    (row) =>
      row.thesisPct !== undefined && row.indexPct !== undefined && row.vsIndexPp !== undefined,
  );
  const values = drawn.flatMap((row) => [
    Number.parseFloat(row.thesisPct as string),
    Number.parseFloat(row.indexPct as string),
  ]);
  const low = Math.min(0, ...values);
  const high = Math.max(0, ...values);
  const pad = Math.max(1, (high - low) * 0.08);
  const axis = (value: number): number => at(value, low - pad, high + pad);
  return {
    zero: axis(0),
    rows: drawn.map((row) => ({
      thesisId: row.thesisId,
      name: row.assetName,
      period: row.period,
      dot: axis(Number.parseFloat(row.thesisPct as string)),
      ring: axis(Number.parseFloat(row.indexPct as string)),
      vsIndexPp: row.vsIndexPp as string,
      aria: `Tesis ${pct(row.thesisPct as string, true)}, índice ${pct(row.indexPct as string, true)}`,
    })),
  };
};
