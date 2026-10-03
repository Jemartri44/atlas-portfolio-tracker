// The bytes the API of the tests draws, fixed: never chance. The harness drew
// them at random, and one run in 4,096 gave a device id that began with `--`,
// which the console read as an option (`atlas admin forget-device` left with
// 64). Every id of 16 bytes (device, token, session) begins with `--` here,
// the case that broke; the rest of each id comes from a fixed counter.

import { createHash } from "node:crypto";

export const dashRandom = () => {
  let drawn = 0;
  return (bytes: number): Uint8Array => {
    drawn += 1;
    const out = Uint8Array.from(
      createHash("sha256").update(`dashids-${drawn}`).digest().subarray(0, bytes),
    );
    if (bytes === 16) {
      // `-` is 62 in base64url: 111110 111110 are the first twelve bits.
      out[0] = 0xfb;
      out[1] = 0xe0 | ((out[1] as number) & 0x0f);
    }
    return out;
  };
};
