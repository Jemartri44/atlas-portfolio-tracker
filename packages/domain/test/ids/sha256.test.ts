import { describe, expect, it } from "vitest";
import { sha256Hex, toHex, utf8Encode } from "../../src/ids/sha256.js";

describe("utf8Encode", () => {
  it("encodes 1, 2, 3 and 4 byte sequences", () => {
    expect(Array.from(utf8Encode("a"))).toEqual([0x61]);
    expect(Array.from(utf8Encode("é"))).toEqual([0xc3, 0xa9]);
    expect(Array.from(utf8Encode("€"))).toEqual([0xe2, 0x82, 0xac]);
    expect(Array.from(utf8Encode("😀"))).toEqual([0xf0, 0x9f, 0x98, 0x80]);
  });

  it("encodes lone surrogates deterministically instead of throwing", () => {
    expect(Array.from(utf8Encode("\ud83d"))).toEqual([0xed, 0xa0, 0xbd]);
    expect(Array.from(utf8Encode("\ud83dx"))).toEqual([0xed, 0xa0, 0xbd, 0x78]);
    expect(Array.from(utf8Encode("\udc00"))).toEqual([0xed, 0xb0, 0x80]);
  });
});

describe("sha256Hex", () => {
  it("matches the FIPS 180-4 test vectors", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("handles the padding boundaries (55, 56, 63, 64 bytes) and long inputs", () => {
    expect(sha256Hex("a".repeat(55))).toBe(
      "9f4390f8d30c2dd92ec9f095b65e2b9ae9b0a925a5258e241c9f1e910f734318",
    );
    expect(sha256Hex("a".repeat(56))).toBe(
      "b35439a4ac6f0948b6d6f9e3c6af0f5f590ce20f1bde7090ef7970686ec6738a",
    );
    expect(sha256Hex("a".repeat(63))).toBe(
      "7d3e74a05d7db15bce4ad9ec0658ea98e3f06eeecf16b4c6fff2da457ddc2f34",
    );
    expect(sha256Hex("a".repeat(64))).toBe(
      "ffe054fe7ae0cb6dc65c3af9b61d5209f439851db43d0ba5997337df154668eb",
    );
    expect(sha256Hex("a".repeat(1_000_000))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });

  it("accepts raw bytes and renders hex with leading zeros", () => {
    expect(sha256Hex(Uint8Array.from([0x61, 0x62, 0x63]))).toBe(sha256Hex("abc"));
    expect(toHex(Uint8Array.from([0, 1, 255]))).toBe("0001ff");
  });
});
