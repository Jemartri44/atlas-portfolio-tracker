// The order of the cards of the summary, which is also the order the keyboard
// walks through them (docs/design/system.md §7.2).
//
// What answers «¿cómo va y hay algo que hacer?» comes first, and the device decides what that is
// (the table of §4 of the visual audit of 2026-11-03):
// - **a phone**, one column: how much there is, this month's tasks and what needs doing fill the
//   first screen; then how it got here, the allocation, what happened lately and, out of the
//   season, the tax card folded to a row;
// - **from the grid's 12 columns** (1024px): the net worth as a band of tiles, the evolution with
//   this month beside it, attention with the allocation, the recent movements with the tax card.
// In the income tax season the tax card goes first on both. CSS places each card in its column;
// this decides the order of the markup, so that the focus follows the eye.
//
// Presentation only: whether it is the season is the domain's to say
// (`inRentaSeason`); this only places the card it decided about.

export type SummaryCard =
  | "worth"
  | "month"
  | "attention"
  | "evolution"
  | "allocation"
  | "moves"
  | "fiscal";

interface SummaryShape {
  /** From the grid's 12 columns (1024px) on. */
  wide: boolean;
  /** The date read falls in the income tax season (the domain's `inRentaSeason`). */
  season: boolean;
}

export const summaryOrder = (shape: SummaryShape): SummaryCard[] => {
  const cards: SummaryCard[] = shape.wide
    ? ["worth", "evolution", "month", "attention", "allocation", "moves"]
    : ["worth", "month", "attention", "evolution", "allocation", "moves"];
  return shape.season ? ["fiscal", ...cards] : [...cards, "fiscal"];
};
