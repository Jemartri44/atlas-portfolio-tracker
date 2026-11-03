// The bars of a split and their words: the parts in order of weight, the names of the regions and
// the complete label of a default. Plain data; the figure is always in text beside the colour.

import { Decimal } from "@atlas/domain";
import type { ExposureIndex, Split } from "@atlas/domain/portfolio";
import type { BarSegment, LegendEntry } from "../../components/index.js";
import { formatDate } from "../../format/date.js";
import { formatPercent, meaningfulDecimals } from "../../format/number.js";

export type Dimension = "currency" | "region";

const REGIONS: Readonly<Record<string, string>> = {
  north_america: "América del Norte",
  europe_developed: "Europa desarrollada",
  asia_pacific_developed: "Asia-Pacífico desarrollada",
  emerging: "Emergentes",
  global: "Global",
  other: "Otras",
};

/** The name of a key: the ISO code of a currency, the words of a region. */
export const keyLabel = (dimension: Dimension, key: string): string =>
  dimension === "currency" ? key : (REGIONS[key] ?? key);

/** The regions an owner can write: the closed list, in the order they are explained. */
export const regionOptions = (): { value: string; label: string }[] =>
  Object.entries(REGIONS).map(([value, label]) => ({ value, label }));

/** The parts, from the largest, in the greys `a`…`c`; what does not fit goes together to `rest`. */
const PARTS = ["a", "b", "c"] as const;

export interface BarView {
  segments: BarSegment[];
  legend: LegendEntry[];
}

const percentOf = (pct: string): string =>
  formatPercent(pct, { decimals: Math.min(1, meaningfulDecimals(pct)) });

/** A split as a bar and its legend. The widths are read as numbers only to draw; the text is exact. */
export const barOf = (
  dimension: Dimension,
  parts: readonly { key: string; pct: string }[],
): BarView => {
  const sorted = [...parts]
    .filter((part) => Number.parseFloat(part.pct) > 0)
    .sort(
      (a, b) => Number.parseFloat(b.pct) - Number.parseFloat(a.pct) || a.key.localeCompare(b.key),
    );
  const shown = sorted.slice(0, PARTS.length);
  const rest = sorted.slice(PARTS.length);
  const segments: BarSegment[] = shown.map((part, index) => ({
    key: PARTS[index] as string,
    width: Number.parseFloat(part.pct),
  }));
  const legend: LegendEntry[] = shown.map((part, index) => ({
    key: PARTS[index] as string,
    label: keyLabel(dimension, part.key),
    figure: percentOf(part.pct),
  }));
  if (rest.length > 0) {
    const total = rest.reduce((sum, part) => sum.add(Decimal.parse(part.pct)), Decimal.ZERO);
    segments.push({ key: "rest", width: Number.parseFloat(total.toString()) });
    legend.push({
      key: "rest",
      label: `Otras (${rest.length})`,
      figure: percentOf(total.toString()),
    });
  }
  return { segments, legend };
};

export const barOfSplit = (dimension: Dimension, split: Split): BarView =>
  barOf(
    dimension,
    Object.entries(split).map(([key, pct]) => ({ key, pct })),
  );

/** «por defecto · MSCI World (según la cartera de SPDR…) · ficha 02/11/2026». */
export const indexLabel = (index: ExposureIndex): string =>
  [
    "por defecto",
    `${index.name}${index.via === undefined ? "" : ` (según la cartera de ${index.via})`}`,
    index.as_of === undefined ? "por definición" : `ficha ${formatDate(index.as_of)}`,
  ].join(" · ");
