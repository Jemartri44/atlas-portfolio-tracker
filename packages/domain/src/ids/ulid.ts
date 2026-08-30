// ULID (https://github.com/ulid/spec): 48-bit timestamp + 80-bit randomness,
// Crockford base32, 26 characters. Monotonic within one generator: if the
// clock does not advance, the random part is incremented instead.

import { DomainError } from "../errors.js";
import type { Clock } from "../ports/clock.js";
import type { RandomSource } from "../ports/random.js";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_CHARS = 10;
const RANDOM_BYTES = 10;
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

export type Ulid = string;

export const isUlid = (value: unknown): value is Ulid =>
  typeof value === "string" && ULID_PATTERN.test(value);

const encodeTime = (milliseconds: number): string => {
  let remaining = milliseconds;
  let out = "";
  for (let i = 0; i < TIME_CHARS; i += 1) {
    out = ALPHABET.charAt(remaining % 32) + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
};

const encodeRandom = (bytes: Uint8Array): string => {
  let accumulator = 0;
  let pendingBits = 0;
  let out = "";
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    pendingBits += 8;
    while (pendingBits >= 5) {
      pendingBits -= 5;
      out += ALPHABET.charAt((accumulator >>> pendingBits) & 31);
    }
    accumulator &= (1 << pendingBits) - 1;
  }
  return out;
};

const incrementRandom = (bytes: Uint8Array): void => {
  for (let i = bytes.length - 1; i >= 0; i -= 1) {
    const value = bytes[i] as number;
    if (value < 0xff) {
      bytes[i] = value + 1;
      return;
    }
    bytes[i] = 0;
  }
  throw new DomainError("ulid_overflow", "ULID random part overflowed within one millisecond");
};

export interface UlidGenerator {
  next(): Ulid;
}

export const createUlidGenerator = ({
  clock,
  random,
}: {
  clock: Clock;
  random: RandomSource;
}): UlidGenerator => {
  let lastTime = -1;
  const lastRandom = new Uint8Array(RANDOM_BYTES);
  return {
    next: (): Ulid => {
      const time = clock.now().getTime();
      if (time > lastTime) {
        lastTime = time;
        random(lastRandom);
      } else {
        incrementRandom(lastRandom);
      }
      return encodeTime(lastTime) + encodeRandom(lastRandom);
    },
  };
};
