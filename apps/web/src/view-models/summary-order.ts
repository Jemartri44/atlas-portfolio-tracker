// The order of the cards of the summary, which is also the order the keyboard
// walks through them (docs/design/system.md §7.2).
//
// What answers «¿cómo va y hay algo que hacer?» comes first, and the device decides what that is:
// - **a phone**, one column: how much there is, this month's tasks and what needs doing fill the
//   first screen; then how it got here, the allocation, what happened lately and, out of the
//   season, the tax card folded to a row;
// - **from the grid's 12 columns** (1024px): the net worth as a band of tiles, and two columns that
//   go their own way: how it got here and what happened lately on the left, and on the right what
//   needs doing, this month and the allocation, with the tax row last out of the season.
// In the income tax season the tax card goes first on both.
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

export interface SummaryPlaces {
  /** Across the whole width; on a phone, every card. */
  top: SummaryCard[];
  left: SummaryCard[];
  right: SummaryCard[];
}

export const summaryOrder = (shape: SummaryShape): SummaryPlaces => {
  if (!shape.wide) {
    const cards: SummaryCard[] = [
      "worth",
      "month",
      "attention",
      "evolution",
      "allocation",
      "moves",
    ];
    return {
      top: shape.season ? ["fiscal", ...cards] : [...cards, "fiscal"],
      left: [],
      right: [],
    };
  }
  return {
    top: shape.season ? ["fiscal", "worth"] : ["worth"],
    left: ["evolution", "moves"],
    right: ["attention", "month", "allocation", ...(shape.season ? [] : (["fiscal"] as const))],
  };
};
