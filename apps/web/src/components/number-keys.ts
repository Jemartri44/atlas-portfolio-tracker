// The keys of a numeric field.

/**
 * The dot is never part of a number typed here (`format/input.ts`). It is stopped at `beforeinput`,
 * which phone keyboards do report (their `keydown` is often an anonymous 229), for plain typing
 * and, where the platform allows cancelling it, for composition (the event is often not
 * cancelable there; the parser is the net); the dot of the
 * numeric keypad writes the comma in a decimal field and nothing in an integer one. A pasted dot is
 * not touched: the parser refuses the whole text, because dropping the dot would turn `0.500`
 * into `500`.
 */
export const noDot = (event: InputEvent): void => {
  if (
    (event.inputType === "insertText" || event.inputType === "insertCompositionText") &&
    (event.data ?? "").includes(".")
  ) {
    event.preventDefault();
  }
};

export const keypadComma =
  (kind: "decimal" | "integer") =>
  (event: KeyboardEvent & { currentTarget: HTMLInputElement }): void => {
    if (event.code !== "NumpadDecimal" || event.ctrlKey || event.metaKey || event.altKey) {
      return;
    }
    event.preventDefault();
    if (kind === "decimal") {
      const input = event.currentTarget;
      input.setRangeText(
        ",",
        input.selectionStart ?? input.value.length,
        input.selectionEnd ?? input.value.length,
        "end",
      );
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  };
