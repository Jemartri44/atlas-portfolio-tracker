// A stylesheet as a list of rules, each with the at-rules and the selector it
// sits under and its declarations. Enough of CSS for the guardians of the
// palette: comments are dropped, strings do not hold braces in our sheets, and
// every block is either a rule or an at-rule wrapping rules.
//
// The guardians read **which block** a colour is declared in by this path, not
// by the order in which the values appear in the file: a reader "in order of
// appearance" cannot see a colour defined in light and forgotten in one of the
// two dark blocks (feature 020, E1, block 1).

export interface CssRule {
  /** The preludes from the outermost at-rule to the selector, trimmed. */
  path: string[];
  /** Declarations in order, `[property, value]`, values trimmed. */
  declarations: [string, string][];
}

const squash = (text: string): string => text.replace(/\s+/g, " ").trim();

export const cssRules = (source: string): CssRule[] => {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: CssRule[] = [];
  const stack: CssRule[] = [];
  let buffer = "";
  const flushDeclaration = (): void => {
    const current = stack[stack.length - 1];
    const declaration = buffer.trim();
    buffer = "";
    if (current === undefined || declaration === "") {
      return;
    }
    const colon = declaration.indexOf(":");
    if (colon > 0) {
      current.declarations.push([
        declaration.slice(0, colon).trim(),
        squash(declaration.slice(colon + 1)),
      ]);
    }
  };
  for (const char of text) {
    if (char === "{") {
      const parent = stack[stack.length - 1];
      const rule: CssRule = { path: [...(parent?.path ?? []), squash(buffer)], declarations: [] };
      buffer = "";
      stack.push(rule);
      rules.push(rule);
    } else if (char === "}") {
      flushDeclaration();
      stack.pop();
    } else if (char === ";") {
      flushDeclaration();
    } else {
      buffer += char;
    }
  }
  return rules;
};
