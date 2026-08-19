import { describe, expect, it } from "vitest";
import { applyLayerOpacity, compositePremultipliedNormal, NORMAL_PREMULTIPLIED_BLEND } from "../src/renderer";

describe("premultiplied Normal compositing", () => {
  it("uses source-over factors compatible with premultiplied input", () => { expect(NORMAL_PREMULTIPLIED_BLEND).toEqual({ color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } }); });
  it("composites opaque and transparent sources deterministically", () => { const blue = { r: 0, g: 0, b: 1, a: 1 }; expect(compositePremultipliedNormal({ r: 1, g: 0, b: 0, a: 1 }, blue)).toEqual({ r: 1, g: 0, b: 0, a: 1 }); expect(compositePremultipliedNormal({ r: 0, g: 0, b: 0, a: 0 }, blue)).toEqual(blue); });
  it("handles half-alpha and layer opacity by scaling RGB and alpha together", () => { const halfRed = { r: 0.5, g: 0, b: 0, a: 0.5 }; expect(compositePremultipliedNormal(halfRed, { r: 0, g: 0, b: 1, a: 1 })).toEqual({ r: 0.5, g: 0, b: 0.5, a: 1 }); expect(applyLayerOpacity(halfRed, 0.5)).toEqual({ r: 0.25, g: 0, b: 0, a: 0.25 }); });
  it("composes multiple semi-transparent layers without exceeding alpha bounds", () => { const result = compositePremultipliedNormal({ r: 0, g: 0.5, b: 0, a: 0.5 }, compositePremultipliedNormal({ r: 0.5, g: 0, b: 0, a: 0.5 }, { r: 0, g: 0, b: 0, a: 0 })); expect(result).toEqual({ r: 0.25, g: 0.5, b: 0, a: 0.75 }); });
});
