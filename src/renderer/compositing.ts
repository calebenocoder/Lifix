import type { BlendMode } from "../core";

export interface PremultipliedColor { readonly r: number; readonly g: number; readonly b: number; readonly a: number; }
export interface StraightColor { readonly r: number; readonly g: number; readonly b: number; }

/** Kept as the mathematical reference for the direct premultiplied Normal path. */
export const NORMAL_PREMULTIPLIED_BLEND = { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } } as const;
export const BLEND_MODE_INDEX: Readonly<Record<BlendMode, number>> = { normal: 0, multiply: 1, screen: 2, overlay: 3 };

export function applyLayerOpacity(color: PremultipliedColor, opacity: number): PremultipliedColor { return { r: color.r * opacity, g: color.g * opacity, b: color.b * opacity, a: color.a * opacity }; }
export function unpremultiply(color: PremultipliedColor): StraightColor { return color.a > 0 ? { r: color.r / color.a, g: color.g / color.a, b: color.b / color.a } : { r: 0, g: 0, b: 0 }; }
export function blendColors(backdrop: StraightColor, source: StraightColor, mode: BlendMode): StraightColor {
  const channel = (backdropValue: number, sourceValue: number): number => {
    switch (mode) { case "normal": return sourceValue; case "multiply": return backdropValue * sourceValue; case "screen": return backdropValue + sourceValue - backdropValue * sourceValue; case "overlay": return backdropValue <= 0.5 ? 2 * backdropValue * sourceValue : 1 - 2 * (1 - backdropValue) * (1 - sourceValue); }
  };
  return { r: channel(backdrop.r, source.r), g: channel(backdrop.g, source.g), b: channel(backdrop.b, source.b) };
}
/** W3C-style blend followed by premultiplied source-over. Layer opacity scales source RGB and alpha exactly once. */
export function compositePremultiplied(source: PremultipliedColor, destination: PremultipliedColor, mode: BlendMode, opacity = 1): PremultipliedColor {
  const adjusted = applyLayerOpacity(source, opacity); const sourceColor = unpremultiply(adjusted); const backdropColor = unpremultiply(destination); const blended = blendColors(backdropColor, sourceColor, mode); const overlap = adjusted.a * destination.a; const remainingSource = 1 - destination.a; const remainingDestination = 1 - adjusted.a;
  return { r: adjusted.r * remainingSource + blended.r * overlap + destination.r * remainingDestination, g: adjusted.g * remainingSource + blended.g * overlap + destination.g * remainingDestination, b: adjusted.b * remainingSource + blended.b * overlap + destination.b * remainingDestination, a: adjusted.a + destination.a * remainingDestination };
}
export function compositePremultipliedNormal(source: PremultipliedColor, destination: PremultipliedColor, opacity = 1): PremultipliedColor { return compositePremultiplied(source, destination, "normal", opacity); }
export function canvasCompositeOperation(mode: BlendMode): GlobalCompositeOperation { return mode === "normal" ? "source-over" : mode; }
