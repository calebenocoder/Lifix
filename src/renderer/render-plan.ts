import type { BlendMode, GroupCompositingMode } from "../core";
import type { RenderInput, RenderLayer, RenderLayerTransformPreview } from "./contracts";
import { affineFromTransform, identityAffine, multiplyAffine, transformPoint, type AffineTransform } from "./transform";

export interface RenderPlanRaster { readonly kind: "raster"; readonly layerId: string; readonly raster: Extract<RenderLayer, { readonly kind: "raster" }>["raster"]; readonly opacity: number; readonly blendMode: BlendMode; readonly transform: AffineTransform; }
export interface RenderPlanGroup { readonly kind: "group"; readonly layerId: string; readonly requestedMode: GroupCompositingMode; readonly mode: GroupCompositingMode; readonly opacity: number; readonly blendMode: BlendMode; readonly transform: AffineTransform; readonly children: readonly RenderPlanNode[]; }
export type RenderPlanNode = RenderPlanRaster | RenderPlanGroup;
export type RenderPlanLayer = RenderPlanRaster;
export interface SkippedRenderLayer { readonly layerId: string; readonly reason: "hidden" | "transparent"; }
export interface RenderPlan { readonly documentId: string; readonly nodes: readonly RenderPlanNode[]; /** Bottom-to-top across the complete tree. */ readonly layers: readonly RenderPlanLayer[]; readonly skipped: readonly SkippedRenderLayer[]; }
export interface RenderBounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface RenderableSize { readonly width: number; readonly height: number; }

/** Builds an immutable compositing tree. Non-trivial group opacity/blend forces isolation so it is applied once. */
export function createRenderPlan(input: RenderInput): RenderPlan {
  const layers: RenderPlanLayer[] = []; const skipped: SkippedRenderLayer[] = [];
  const skipDescendants = (id: string, reason: SkippedRenderLayer["reason"]): void => { const layer = input.layers[id]; if (!layer) return; if (layer.kind === "raster") skipped.push({ layerId: layer.id, reason }); else layer.childLayerIds.forEach(childId => skipDescendants(childId, reason)); };
  const visit = (id: string, parentTransform: AffineTransform, inheritedVisible: boolean): RenderPlanNode | undefined => {
    const layer = input.layers[id]; if (!layer) return undefined; const transform = multiplyAffine(parentTransform, affineFromTransform(layer.transform)); const visible = inheritedVisible && layer.visible;
    if (!visible) { skipDescendants(id, "hidden"); return undefined; } if (layer.opacity <= 0) { skipDescendants(id, "transparent"); return undefined; }
    if (layer.kind === "raster") { const node: RenderPlanRaster = { kind: "raster", layerId: layer.id, raster: layer.raster, opacity: layer.opacity, blendMode: layer.blendMode, transform }; layers.push(node); return node; }
    const children = layer.childLayerIds.map(childId => visit(childId, transform, visible)).filter((node): node is RenderPlanNode => node !== undefined); const mode: GroupCompositingMode = layer.compositing === "isolated" || layer.opacity !== 1 || layer.blendMode !== "normal" ? "isolated" : "pass-through";
    return { kind: "group", layerId: layer.id, requestedMode: layer.compositing, mode, opacity: layer.opacity, blendMode: layer.blendMode, transform, children };
  };
  const nodes = input.rootLayerIds.map(id => visit(id, identityAffine(), true)).filter((node): node is RenderPlanNode => node !== undefined); return { documentId: input.documentId, nodes, layers, skipped };
}

export function transformedRasterBounds(transform: AffineTransform, size: RenderableSize): RenderBounds | undefined {
  if (![transform.a, transform.b, transform.c, transform.d, transform.e, transform.f, size.width, size.height].every(Number.isFinite) || size.width <= 0 || size.height <= 0) return undefined;
  const points = [transformPoint(transform, { x: 0, y: 0 }), transformPoint(transform, { x: size.width, y: 0 }), transformPoint(transform, { x: 0, y: size.height }), transformPoint(transform, { x: size.width, y: size.height })]; const xs = points.map(point => point.x); const ys = points.map(point => point.y); const x = Math.min(...xs); const y = Math.min(...ys); const width = Math.max(...xs) - x; const height = Math.max(...ys) - y;
  return [x, y, width, height].every(Number.isFinite) && width >= 0 && height >= 0 ? { x, y, width, height } : undefined;
}
export function unionRenderBounds(bounds: readonly (RenderBounds | undefined)[]): RenderBounds | undefined { const present = bounds.filter((value): value is RenderBounds => value !== undefined); if (!present.length) return undefined; const x = Math.min(...present.map(value => value.x)); const y = Math.min(...present.map(value => value.y)); const right = Math.max(...present.map(value => value.x + value.width)); const bottom = Math.max(...present.map(value => value.y + value.height)); const width = right - x; const height = bottom - y; return [x, y, width, height].every(Number.isFinite) && width >= 0 && height >= 0 ? { x, y, width, height } : undefined; }
/** A preview target transforms as one document-space unit; targeting a group also affects descendants. */
export function previewAffectsNode(node: RenderPlanNode, preview: RenderLayerTransformPreview | undefined, inherited = false): boolean { return inherited || Boolean(preview && node.layerId === preview.layerId); }
export function previewedNodeTransform(node: RenderPlanNode, preview: RenderLayerTransformPreview | undefined, inherited = false): AffineTransform {
  return previewAffectsNode(node, preview, inherited) && preview ? multiplyAffine(preview.documentTransform, node.transform) : node.transform;
}
export function calculateRenderNodeBounds(node: RenderPlanNode, sizeOf: (layer: RenderPlanRaster) => RenderableSize | undefined, preview?: RenderLayerTransformPreview, inheritedPreview = false): RenderBounds | undefined {
  const affected = previewAffectsNode(node, preview, inheritedPreview);
  if (node.kind === "raster") { const size = sizeOf(node); return size ? transformedRasterBounds(previewedNodeTransform(node, preview, inheritedPreview), size) : undefined; }
  return unionRenderBounds(node.children.map(child => calculateRenderNodeBounds(child, sizeOf, preview, affected)));
}
