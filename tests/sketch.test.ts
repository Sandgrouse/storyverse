import { describe, expect, it } from "vitest";
import { toGreyscalePixels } from "@/lib/sketch";

describe("toGreyscalePixels", () => {
  it("turns a coloured pixel buffer into equal R, G and B", () => {
    const pixels = new Uint8ClampedArray([
      200, 50, 30, 255, 20, 180, 60, 255,
    ]);
    const out = toGreyscalePixels(pixels);
    expect(out).toHaveLength(8);
    expect(out[0]).toBe(out[1]);
    expect(out[1]).toBe(out[2]);
    expect(out[3]).toBe(255);
    expect(out[4]).toBe(out[5]);
    expect(out[5]).toBe(out[6]);
    expect(out[7]).toBe(255);
  });

  it("leaves grey pixels grey and keeps alpha", () => {
    const pixels = new Uint8ClampedArray([128, 128, 128, 200]);
    const out = toGreyscalePixels(pixels);
    expect(out[0]).toBe(out[1]);
    expect(out[1]).toBe(out[2]);
    expect(out[3]).toBe(200);
  });

  it("does not change the input buffer", () => {
    const pixels = new Uint8ClampedArray([200, 50, 30, 255]);
    toGreyscalePixels(pixels);
    expect([...pixels]).toEqual([200, 50, 30, 255]);
  });
});
