import { describe, expect, test } from "bun:test";
import { encodeIco } from "./ico";

const png = (n: number) => new Uint8Array(n).fill(n);

describe("encodeIco", () => {
  test("writes the header, one entry per image and the images in order", () => {
    const ico = encodeIco([
      { size: 16, png: png(3) },
      { size: 256, png: png(5) },
    ]);
    const view = new DataView(ico.buffer);
    expect([view.getUint16(0, true), view.getUint16(2, true), view.getUint16(4, true)]).toEqual([
      0, 1, 2,
    ]);
    // First entry: 16px, 32 bits, 3 bytes at offset 6 + 2 * 16.
    expect([ico[6], ico[7], view.getUint16(12, true)]).toEqual([16, 16, 32]);
    expect([view.getUint32(14, true), view.getUint32(18, true)]).toEqual([3, 38]);
    // Second entry: 256px is written as 0, its data follows the first image.
    expect([ico[22], ico[23]]).toEqual([0, 0]);
    expect([view.getUint32(30, true), view.getUint32(34, true)]).toEqual([5, 41]);
    expect([...ico.subarray(38)]).toEqual([3, 3, 3, 5, 5, 5, 5, 5]);
  });

  test("rejects an empty list and sizes outside 1–256", () => {
    expect(() => encodeIco([])).toThrow("at least one image");
    expect(() => encodeIco([{ size: 512, png: png(1) }])).toThrow("outside 1–256");
    expect(() => encodeIco([{ size: 0, png: png(1) }])).toThrow("outside 1–256");
  });
});
