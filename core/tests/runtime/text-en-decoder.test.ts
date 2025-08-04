import { ensureSuperThis } from "@fireproof/core-runtime";
import { describe, expect, it } from "vitest";

describe("text encoder", function () {
  const sthis = ensureSuperThis();
  it("should encode and decode", function () {
    const input = "hello world";
    const encoded = sthis.txt.encode(input);
    const decoded = sthis.txt.decode(encoded);
    expect(decoded).toEqual(input);
  });
  it("base64", function () {
    const input = "hello world";
    const encoded = sthis.txt.base64.encode(input);
    const decoded = sthis.txt.base64.decode(encoded);
    expect(decoded).toEqual(input);
    expect(encoded).toEqual("aGVsbG8gd29ybGQ=");
  });

  it("base64 binary", function () {
    const input = new Uint8Array(
      new Array(0x10000)
        .fill(0)
        .map((_, i) => [i % 256, i >> 8])
        .flat(),
    );
    const encoded = sthis.txt.base64.encode(input);
    const decoded = sthis.txt.base64.decodeUint8(encoded);
    expect(decoded).toEqual(input);
    expect(input.length).toEqual(decoded.length);
  });
});
