// The order of the cards of the summary, which is also the order the keyboard
// walks through them (docs/design/system.md §7.2; feature 020, M4 and M2).
//
// What answers «¿hay algo que tenga que hacer?» comes first. On a phone and up
// to the monitor, one column in the order of the text of the proposal (§8 P6
// of prompt 020): the risk of losing the data, in one line; the tax card, only
// in the income tax season; how much there is; what needs doing; what
// happened lately; how it got here; and, out of the season, the tax card
// folded to a row at the end. From the monitor's step on, the 8+4 of the
// mockup: the line across, the net worth with the tax card at its right
// (never alone in its row) and the evolution beside attention and the recent
// movements. CSS places each card in its column; this decides the order of
// the markup, so that the focus follows the eye.
//
// Presentation only: whether it is the season is the domain's to say
// (`inRentaSeason`); this only places the card it decided about.

export type SummaryCard = "loss" | "worth" | "attention" | "moves" | "fiscal" | "evolution";

export interface SummaryShape {
  /** From the monitor's step (1800px) on. */
  monitor: boolean;
  /** The date read falls in the income tax season (the domain's `inRentaSeason`). */
  season: boolean;
  /** The data live in the browser and are overdue for an export. */
  dataLoss: boolean;
}

export const summaryOrder = (shape: SummaryShape): SummaryCard[] => {
  const loss: SummaryCard[] = shape.dataLoss ? ["loss"] : [];
  if (shape.monitor) {
    return [...loss, "worth", "fiscal", "evolution", "attention", "moves"];
  }
  return shape.season
    ? [...loss, "fiscal", "worth", "attention", "moves", "evolution"]
    : [...loss, "worth", "attention", "moves", "evolution", "fiscal"];
};
