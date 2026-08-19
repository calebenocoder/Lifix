import type { BlendMode, GroupCompositingMode } from "../core";
import type { RenderInput, RenderLayer } from "./contracts";
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

export function transformedRasterBounds(transform: AffineTransform, size: RenderableSize): RenderBounds {
  const points = [transformPoint(transform, { x: 0, y: 0 }), transformPoint(transform, { x: size.width, y: 0 }), transformPoint(transform, { x: 0, y: size.height }), transformPoint(transform, { x: size.width, y: size.height })]; const xs = points.map(point => point.x); const ys = points.map(point => point.y); const x = Math.min(...xs); const y = Math.min(...ys); return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
export function unionRenderBounds(bounds: readonly (RenderBounds | undefined)[]): RenderBounds | undefined { const present = bounds.filter((value): value is RenderBounds => value !== undefined); if (!present.length) return undefined; const x = Math.min(...present.map(value => value.x)); const y = Math.min(...present.map(value => value.y)); const right = Math.max(...present.map(value => value.x + value.width)); const bottom = Math.max(...present.map(value => value.y + value.height)); return { x, y, width: right - x, height: bottom - y }; }
export function calculateRenderNodeBounds(node: RenderPlanNode, sizeOf: (layer: RenderPlanRaster) => RenderableSize | undefined): RenderBounds | undefined { if (node.kind === "raster") { const size = sizeOf(node); return size ? transformedRasterBounds(node.transform, size) : undefined; } return unionRenderBounds(node.children.map(child => calculateRenderNodeBounds(child, sizeOf))); }
