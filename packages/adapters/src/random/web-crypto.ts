import type { RandomSource } from "@atlas/domain";

/** Cryptographically strong randomness from the platform (Node 22 and browsers). */
export const webCryptoRandom: RandomSource = (target) => {
  crypto.getRandomValues(target);
};
