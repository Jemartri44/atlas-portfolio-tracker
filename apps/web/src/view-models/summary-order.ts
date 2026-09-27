// The order of the cards of the summary, which is also the order the keyboard
// walks through them (docs/design/system.md §7.2; feature 020, M4).
//
// On a phone and up to the monitor, one column in the order of reading: how
// much there is, what needs doing, what happened lately, the tax card and how
// it got here. From the monitor's step on, the 8+4 of the mockup
// (`docs/design/proposals/mockups/resumen-privacidad.html`): the net worth
// with the tax card at its right, never alone in its row, and the evolution
// beside attention and the recent movements. CSS places each card in its
// column; this decides the order of the markup, so that the focus follows
// the eye.
//
// Presentation only: *which* order is a matter of where the eye goes, not of
// what is true.

export type SummaryCard = "worth" | "attention" | "moves" | "fiscal" | "evolution";

export const summaryOrder = (monitor: boolean): SummaryCard[] =>
  monitor
    ? ["worth", "fiscal", "evolution", "attention", "moves"]
    : ["worth", "attention", "moves", "fiscal", "evolution"];
