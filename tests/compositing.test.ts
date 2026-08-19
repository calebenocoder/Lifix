import { describe, expect, it } from "vitest";
import { applyLayerOpacity, blendColors, compositePremultiplied, compositePremultipliedNormal, NORMAL_PREMULTIPLIED_BLEND } from "../src/renderer";

describe("premultiplied Normal compositing", () => {
  it("uses source-over factors compatible with premultiplied input", () => { expect(NORMAL_PREMULTIPLIED_BLEND).toEqual({ color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } }); });
  it("composites opaque and transparent sources deterministically", () => { const blue = { r: 0, g: 0, b: 1, a: 1 }; expect(compositePremultipliedNormal({ r: 1, g: 0, b: 0, a: 1 }, blue)).toEqual({ r: 1, g: 0, b: 0, a: 1 }); expect(compositePremultipliedNormal({ r: 0, g: 0, b: 0, a: 0 }, blue)).toEqual(blue); });
  it("handles half-alpha and layer opacity by scaling RGB and alpha together", () => { const halfRed = { r: 0.5, g: 0, b: 0, a: 0.5 }; expect(compositePremultipliedNormal(halfRed, { r: 0, g: 0, b: 1, a: 1 })).toEqual({ r: 0.5, g: 0, b: 0.5, a: 1 }); expect(applyLayerOpacity(halfRed, 0.5)).toEqual({ r: 0.25, g: 0, b: 0, a: 0.25 }); });
  it("composes multiple semi-transparent layers without exceeding alpha bounds", () => { const result = compositePremultipliedNormal({ r: 0, g: 0.5, b: 0, a: 0.5 }, compositePremultipliedNormal({ r: 0.5, g: 0, b: 0, a: 0.5 }, { r: 0, g: 0, b: 0, a: 0 })); expect(result).toEqual({ r: 0.25, g: 0.5, b: 0, a: 0.75 }); });

  it.each([
    ["normal", { r: 0.8, g: 0.4, b: 0.2 }], ["multiply", { r: 0.2, g: 0.2, b: 0.15 }], ["screen", { r: 0.85, g: 0.7, b: 0.8 }], ["overlay", { r: 0.4, g: 0.4, b: 0.6 }],
  ] as const)("defines opaque %s blend math", (mode, expected) => { const result = blendColors({ r: 0.25, g: 0.5, b: 0.75 }, { r: 0.8, g: 0.4, b: 0.2 }, mode); expect(result.r).toBeCloseTo(expected.r); expect(result.g).toBeCloseTo(expected.g); expect(result.b).toBeCloseTo(expected.b); });

  it.each([
    ["normal", { r: 0.5, g: 0, b: 0.25, a: 0.75 }], ["multiply", { r: 0.25, g: 0, b: 0.25, a: 0.75 }], ["screen", { r: 0.5, g: 0, b: 0.5, a: 0.75 }], ["overlay", { r: 0.25, g: 0, b: 0.5, a: 0.75 }],
  ] as const)("composites translucent %s source and destination", (mode, expected) => { expect(compositePremultiplied({ r: 0.5, g: 0, b: 0, a: 0.5 }, { r: 0, g: 0, b: 0.5, a: 0.5 }, mode)).toEqual(expected); });

  it("handles zero alpha and layer opacity without division artifacts", () => { const result = compositePremultiplied({ r: 0, g: 0, b: 0, a: 0 }, { r: 0.1, g: 0.2, b: 0.3, a: 0.4 }, "overlay", 0.25); expect(result).toEqual({ r: 0.1, g: 0.2, b: 0.3, a: 0.4 }); expect(Object.values(result).every(Number.isFinite)).toBe(true); });

  it("defines a deterministic multi-mode stack", () => { let result = { r: 0.2, g: 0.4, b: 0.6, a: 1 }; result = compositePremultiplied({ r: 0.4, g: 0.1, b: 0.1, a: 0.5 }, result, "multiply"); result = compositePremultiplied({ r: 0.025, g: 0.075, b: 0.225, a: 0.25 }, result, "screen"); result = compositePremultiplied({ r: 0.28, g: 0.2, b: 0.04, a: 0.4 }, result, "overlay"); expect(result.r).toBeCloseTo(0.23258); expect(result.g).toBeCloseTo(0.297); expect(result.b).toBeCloseTo(0.34528); expect(result.a).toBe(1); });
});
