/** Fills `target` with random bytes. Implemented with Web Crypto in adapters; deterministic in tests. */
export type RandomSource = (target: Uint8Array) => void;
