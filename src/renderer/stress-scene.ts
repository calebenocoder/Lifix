import type { BlendMode } from "../core";
import type { RenderInput, RenderLayer } from "./contracts";
import { createSolidRasterSource, type RasterSource } from "./raster-source";

export interface RendererStressSceneOptions {
  readonly layerCount: number;
  readonly documentWidth?: number;
  readonly documentHeight?: number;
  readonly resourceCount?: number;
  readonly groupDepth?: number;
  readonly visibleLayerCount?: number;
}
export interface RendererStressScene { readonly input: RenderInput; readonly sources: readonly RasterSource[]; }

const blendModes: readonly BlendMode[] = ["normal", "multiply", "screen", "overlay"];

/** Creates deterministic renderer-only data with small reusable source buffers. */
export function createRendererStressScene(options: RendererStressSceneOptions): RendererStressScene {
  if (!Number.isSafeInteger(options.layerCount) || options.layerCount < 0) throw new RangeError("Layer count must be a non-negative safe integer");
  const width = options.documentWidth ?? 16_384; const height = options.documentHeight ?? 8_192;
  const resourceCount = Math.max(1, options.resourceCount ?? Math.min(16, Math.max(1, options.layerCount)));
  const groupDepth = Math.max(0, options.groupDepth ?? 5); const visibleLayerCount = Math.min(options.layerCount, Math.max(0, options.visibleLayerCount ?? Math.ceil(options.layerCount / 3)));
  if (![width, height, resourceCount, groupDepth, visibleLayerCount].every(Number.isSafeInteger) || width <= 0 || height <= 0) throw new RangeError("Stress-scene dimensions and counts must be valid integers");
  const sources = Array.from({ length: resourceCount }, (_, index) => createSolidRasterSource(`stress-source-${index}`, 8, 8, [32 + index * 11 % 192, 48 + index * 17 % 176, 80 + index * 23 % 160, 255]));
  const layers: Record<string, RenderLayer> = {}; const rootLayerIds: string[] = []; const groupIds = Array.from({ length: groupDepth }, (_, index) => `stress-group-${index}`);
  groupIds.forEach((id, index) => { const parentId = index === 0 ? null : groupIds[index - 1]; layers[id] = { id, name: id, kind: "group", visible: true, opacity: index % 3 === 0 ? 0.85 : 1, blendMode: blendModes[index % blendModes.length], transform: { position: { x: index * 7, y: index * 5 }, scale: { x: 1, y: 1 }, rotation: index % 2 === 0 ? 4 : -3 }, parentId, compositing: index % 2 === 0 ? "isolated" : "pass-through", childLayerIds: index + 1 < groupIds.length ? [groupIds[index + 1]] : [] }; });
  if (groupIds.length) rootLayerIds.push(groupIds[0]);
  for (let index = 0; index < options.layerCount; index += 1) {
    const id = `stress-layer-${index}`; const parentId = groupIds.length ? groupIds[index % groupIds.length] : null; const visible = (index + 1) % 11 !== 0; const inViewport = index < visibleLayerCount;
    const layer: RenderLayer = { id, name: id, kind: "raster", visible, opacity: 0.35 + (index % 6) * 0.1, blendMode: blendModes[index % blendModes.length], transform: { position: inViewport ? { x: (index % 12) * 12, y: Math.floor(index / 12) * 12 } : { x: width + index * 32, y: height + index * 24 }, scale: { x: index % 7 === 0 ? -1 : 1 + (index % 3) * 0.25, y: 1 + (index % 2) * 0.2 }, rotation: index % 5 * 9 }, parentId, raster: { kind: "raster-reference", sourceId: sources[index % sources.length].id, storage: "lazy" } };
    layers[id] = layer;
    if (parentId === null) rootLayerIds.push(id); else { const parent = layers[parentId] as Extract<RenderLayer, { kind: "group" }>; layers[parentId] = { ...parent, childLayerIds: [...parent.childLayerIds, id] }; }
  }
  return { input: { documentId: "renderer-stress-scene", width, height, rootLayerIds, layers }, sources };
}
