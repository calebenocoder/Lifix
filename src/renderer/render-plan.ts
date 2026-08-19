import type { BlendMode } from "../core";
import type { RenderInput, RenderLayer } from "./contracts";
import { affineFromTransform, identityAffine, multiplyAffine, type AffineTransform } from "./transform";

export interface RenderPlanLayer { readonly layerId: string; readonly raster: Extract<RenderLayer, { readonly kind: "raster" }> ["raster"]; readonly opacity: number; readonly blendMode: BlendMode; readonly transform: AffineTransform; }
export interface SkippedRenderLayer { readonly layerId: string; readonly reason: "hidden" | "transparent" | "unsupported-blend-mode"; }
export interface RenderPlan { readonly documentId: string; /** Bottom-to-top: later items are composited above earlier items. */ readonly layers: readonly RenderPlanLayer[]; readonly skipped: readonly SkippedRenderLayer[]; }

/** Resolves a detached snapshot without mutating Core state. Groups inherit visibility, opacity, and transforms. */
export function createRenderPlan(input: RenderInput): RenderPlan {
  const layers: RenderPlanLayer[] = []; const skipped: SkippedRenderLayer[] = [];
  const visit = (id: string, parentTransform: AffineTransform, inheritedVisible: boolean, inheritedOpacity: number): void => {
    const layer = input.layers[id]; if (!layer) return;
    const transform = multiplyAffine(parentTransform, affineFromTransform(layer.transform));
    const visible = inheritedVisible && layer.visible; const opacity = inheritedOpacity * layer.opacity;
    if (layer.kind === "group") { layer.childLayerIds.forEach(childId => visit(childId, transform, visible, opacity)); return; }
    if (!visible) { skipped.push({ layerId: layer.id, reason: "hidden" }); return; }
    if (opacity <= 0) { skipped.push({ layerId: layer.id, reason: "transparent" }); return; }
    if (layer.blendMode !== "normal") { skipped.push({ layerId: layer.id, reason: "unsupported-blend-mode" }); return; }
    layers.push({ layerId: layer.id, raster: layer.raster, opacity, blendMode: layer.blendMode, transform });
  };
  input.rootLayerIds.forEach(id => visit(id, identityAffine(), true, 1));
  return { documentId: input.documentId, layers, skipped };
}
