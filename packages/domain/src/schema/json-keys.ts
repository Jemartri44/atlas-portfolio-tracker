// Whether the text of a JSON value repeats a key inside one object, at any
// level (review of PR #96, security N3). `JSON.parse` keeps the last of two
// equal keys without a word, so `"amount":"1000.00", …, "amount":"1.00"` reads
// as 1.00 to the domain and as 1000.00 to a person reading the file: two
// readers, two ledgers. Only the exact text says it, so it is read here, token
// by token. Keys are compared decoded: `"a"` and `"a"` are the same key.
//
// Called only on a text `JSON.parse` already accepted: every string is closed
// and every bracket matched, which is what lets this walk stay this small.

export const repeatsKey = (text: string): boolean => {
  /** One entry per open bracket: the keys of an object seen so far, or null for an array. */
  const open: (Set<string> | null)[] = [];
  let expectKey = false;
  let at = 0;
  while (at < text.length) {
    const char = text[at];
    if (char === '"') {
      let end = at + 1;
      while (text[end] !== '"') {
        end += text[end] === "\\" ? 2 : 1;
      }
      if (expectKey) {
        // After `{` or a `,` inside an object: this string is a key.
        const keys = open[open.length - 1] as Set<string>;
        const key = JSON.parse(text.slice(at, end + 1)) as string;
        if (keys.has(key)) {
          return true;
        }
        keys.add(key);
        expectKey = false;
      }
      at = end + 1;
      continue;
    }
    if (char === "{") {
      open.push(new Set());
      expectKey = true;
    } else if (char === "[") {
      open.push(null);
    } else if (char === "}" || char === "]") {
      open.pop();
    } else if (char === ",") {
      expectKey = open[open.length - 1] !== null;
    }
    at += 1;
  }
  return false;
};

/** Whether a text holds a lone surrogate: its UTF-8 would not be UTF-8 (review of PR #96, B1). */
export const holdsLoneSurrogate = (text: string): boolean => /\p{Cs}/u.test(text);
