export interface PremultipliedColor { readonly r: number; readonly g: number; readonly b: number; readonly a: number; }
/** WebGPU blend state for premultiplied-alpha Normal/source-over compositing. */
export const NORMAL_PREMULTIPLIED_BLEND = { color: { srcFactor: "one", dstFactor: "one-minus-src-alpha" }, alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha" } } as const;
export function applyLayerOpacity(color: PremultipliedColor, opacity: number): PremultipliedColor { return { r: color.r * opacity, g: color.g * opacity, b: color.b * opacity, a: color.a * opacity }; }
export function compositePremultipliedNormal(source: PremultipliedColor, destination: PremultipliedColor, opacity = 1): PremultipliedColor { const adjusted = applyLayerOpacity(source, opacity); const remaining = 1 - adjusted.a; return { r: adjusted.r + destination.r * remaining, g: adjusted.g + destination.g * remaining, b: adjusted.b + destination.b * remaining, a: adjusted.a + destination.a * remaining }; }
