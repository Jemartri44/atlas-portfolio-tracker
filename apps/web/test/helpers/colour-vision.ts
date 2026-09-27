// The arithmetic of the palette test (feature 020, E1, block 0), written here
// with no dependency, each formula from its published source:
//
//   - sRGB ↔ linear: IEC 61966-2-1, the curve every browser applies.
//   - Colour vision deficiency: Machado, Oliveira & Fernandes, "A
//     Physiologically-based Model for Simulation of Color Vision Deficiency",
//     IEEE TVCG 15(6), 1291-1298, 2009, severity 1.0, applied to linear RGB.
//     Matrices as published by the authors at
//     https://www.inf.ufrgs.br/~oliveira/pubs_files/CVD_Simulation/CVD_Simulation.html
//     (read 2026-09-27).
//   - OKLab: Björn Ottosson, "A perceptual color space for image processing",
//     https://bottosson.github.io/posts/oklab/ (23 December 2020, read
//     2026-09-27). ΔE is the Euclidean distance in OKLab ×100, the unit of
//     docs/design/system.md §3.2 and of the proposal of 2026-09-25.
//   - Contrast: WCAG 2.x relative luminance, as `contrast.test.ts`.
//
// This is test code: the geometry and the colour of a chart may use `number`,
// and so may a test that measures colours. No figure a user reads is computed
// here.

export type Rgb = readonly [number, number, number];
export type Matrix = readonly [Rgb, Rgb, Rgb];
export type Deficiency = "protan" | "deutan" | "tritan";

export const MACHADO_2009: Record<Deficiency, Matrix> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

export const hexToRgb = (hex: string): Rgb => {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (match === null) {
    throw new Error(`no es un color #rrggbb: ${hex}`);
  }
  return [1, 2, 3].map((at) => Number.parseInt(match[at] as string, 16) / 255) as unknown as Rgb;
};

const toLinear = (channel: number): number =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

export const linear = (hex: string): Rgb => hexToRgb(hex).map(toLinear) as unknown as Rgb;

export const apply = (matrix: Matrix, rgb: Rgb): Rgb =>
  matrix.map((row) => row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]) as unknown as Rgb;

const clamp = (rgb: Rgb): Rgb =>
  rgb.map((value) => Math.min(1, Math.max(0, value))) as unknown as Rgb;

/** What a person with the deficiency sees, in linear RGB, clamped to the gamut. */
export const simulate = (
  rgb: Rgb,
  deficiency: Deficiency,
  matrices: Record<Deficiency, Matrix> = MACHADO_2009,
): Rgb => clamp(apply(matrices[deficiency], rgb));

/** Linear sRGB to OKLab (Ottosson 2020). */
export const oklab = (rgb: Rgb): Rgb => {
  const [r, g, b] = rgb;
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
};

/** ΔE OKLab ×100 between two colours, for normal vision or under a deficiency. */
export const deltaE = (
  a: string,
  b: string,
  deficiency?: Deficiency,
  matrices: Record<Deficiency, Matrix> = MACHADO_2009,
): number => {
  const seen = (hex: string): Rgb =>
    deficiency === undefined ? linear(hex) : simulate(linear(hex), deficiency, matrices);
  const [x, y] = [oklab(seen(a)), oklab(seen(b))];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** The worst of the three deficiencies: the pair has to survive all of them. */
export const worstDeficiencyDeltaE = (
  a: string,
  b: string,
  matrices: Record<Deficiency, Matrix> = MACHADO_2009,
): number =>
  Math.min(
    ...(["protan", "deutan", "tritan"] as const).map((kind) => deltaE(a, b, kind, matrices)),
  );

const luminance = (hex: string): number => {
  const [r, g, b] = linear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const contrast = (a: string, b: string): number => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
};
