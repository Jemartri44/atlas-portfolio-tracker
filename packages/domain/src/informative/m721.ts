// The Modelo 721 is the Modelo 720 with a single category (decision (j)), so it
// has no machinery of its own: this file exists only so that a reader looking
// for it finds it, and re-exports what builds both.
//
// What is its own is written where it belongs: `holdings.ts` separates crypto
// from securities, and `m720.ts` carries the sentence the output has to say
// about self-custody (prompt 010, P6).

export { informativeReturn, model720, model721 } from "./m720.js";
