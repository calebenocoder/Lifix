import type { Document, Layer } from "../core";
import type { RenderInput, RenderLayer } from "./contracts";

function toRenderLayer(layer: Layer): RenderLayer {
  const base = { id: layer.id, name: layer.name, visible: layer.visible, opacity: layer.opacity, blendMode: layer.blendMode, parentId: layer.parentId, transform: { position: { ...layer.transform.position }, scale: { ...layer.transform.scale }, rotation: layer.transform.rotation } };
  return layer.kind === "group" ? { ...base, kind: "group", childLayerIds: [...layer.childLayerIds] } : { ...base, kind: "raster", raster: { ...layer.raster } };
}
/** Converts authoritative Core state into a detached, renderer-readable snapshot. */
export function createRenderInput(document: Document): RenderInput {
  const state = document.layerTree.snapshot();
  return { documentId: document.id, width: document.width, height: document.height, rootLayerIds: [...state.rootLayerIds], layers: Object.fromEntries(Object.entries(state.layers).map(([id, layer]) => [id, toRenderLayer(layer)])) };
}
