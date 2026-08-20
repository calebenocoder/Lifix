import type { PixelSelection } from "./selection";

/** Platform-independent, serializable document model. */
export type DocumentId = string;
export type LayerId = string;
export interface Resolution { readonly x: number; readonly y: number; readonly unit: "ppi"; }
export interface ColorInfo { readonly model: "rgb"; readonly profile: "srgb"; readonly bitDepth: 8 | 16; readonly alpha: boolean; }
export interface Transform { readonly position: { readonly x: number; readonly y: number }; readonly scale: { readonly x: number; readonly y: number }; readonly rotation: number; }
export type BlendMode = "normal" | "multiply" | "screen" | "overlay";
export type GroupCompositingMode = "pass-through" | "isolated";
/** A locator, not pixel storage; future backends can use tiles, lazy data, or GPU caches. */
export interface RasterDataReference { readonly kind: "raster-reference"; readonly sourceId?: string; readonly storage: "external" | "tiled" | "lazy" | "gpu-cache"; }
export interface LayerBase { readonly id: LayerId; name: string; visible: boolean; opacity: number; blendMode: BlendMode; transform: Transform; parentId: LayerId | null; }
export interface RasterLayer extends LayerBase { readonly kind: "raster"; readonly raster: RasterDataReference; }
export interface GroupLayer extends LayerBase { readonly kind: "group"; compositing: GroupCompositingMode; readonly childLayerIds: LayerId[]; }
export type Layer = RasterLayer | GroupLayer;
export interface LayerTreeState { readonly rootLayerIds: LayerId[]; readonly layers: Record<LayerId, Layer>; }
export interface Document { readonly id: DocumentId; name: string; readonly width: number; readonly height: number; readonly resolution: Resolution; readonly color: ColorInfo; readonly layerTree: LayerTree; readonly metadata: Record<string, string>; /** Authoritative document-space operation region; never layer/session targeting. */ pixelSelection: PixelSelection | null; }
export interface LayerOptions { visible?: boolean; opacity?: number; blendMode?: BlendMode; transform?: Transform; }
export interface GroupLayerOptions extends LayerOptions { compositing?: GroupCompositingMode; }
export const identityTransform = (): Transform => ({ position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 });
function base(id: LayerId, name: string, options: LayerOptions): LayerBase { const opacity = options.opacity ?? 1; if (opacity < 0 || opacity > 1) throw new RangeError("Layer opacity must be between 0 and 1"); return { id, name, visible: options.visible ?? true, opacity, blendMode: options.blendMode ?? "normal", transform: options.transform ?? identityTransform(), parentId: null }; }
export function createRasterLayer(id: LayerId, name = "Raster Layer", options: LayerOptions = {}, raster: RasterDataReference = { kind: "raster-reference", storage: "tiled" }): RasterLayer { return { ...base(id, name, options), kind: "raster", raster }; }
export function createGroupLayer(id: LayerId, name = "Group", options: GroupLayerOptions = {}): GroupLayer { return { ...base(id, name, options), kind: "group", compositing: options.compositing ?? "pass-through", childLayerIds: [] }; }

export class LayerTree {
  readonly rootLayerIds: LayerId[] = [];
  readonly layers: Record<LayerId, Layer> = {};
  add(layer: Layer, parentId: LayerId | null = null, index?: number): void { if (this.layers[layer.id]) throw new Error(`Layer ID already exists: ${layer.id}`); if (parentId !== null && this.find(parentId)?.kind !== "group") throw new Error("Parent must be a group"); layer.parentId = parentId; this.layers[layer.id] = layer; const siblings = parentId === null ? this.rootLayerIds : (this.find(parentId) as GroupLayer).childLayerIds; this.#insert(siblings, layer.id, index); }
  remove(id: LayerId): Layer | undefined { const layer = this.find(id); if (!layer) return undefined; const parent = layer.parentId === null ? undefined : this.find(layer.parentId) as GroupLayer; const siblings = parent ? parent.childLayerIds : this.rootLayerIds; siblings.splice(siblings.indexOf(id), 1); this.#unregister(layer); return layer; }
  move(id: LayerId, parentId: LayerId | null, index?: number): void { const layer = this.find(id); if (!layer) throw new Error(`Unknown layer: ${id}`); if (parentId === id || (parentId !== null && this.isDescendant(parentId, id))) throw new Error("A layer cannot contain its ancestor"); if (parentId !== null && this.find(parentId)?.kind !== "group") throw new Error("Parent must be a group"); const old = layer.parentId === null ? this.rootLayerIds : (this.find(layer.parentId) as GroupLayer).childLayerIds; old.splice(old.indexOf(id), 1); const next = parentId === null ? this.rootLayerIds : (this.find(parentId) as GroupLayer).childLayerIds; layer.parentId = parentId; this.#insert(next, id, index); }
  reorder(id: LayerId, index: number): void { const layer = this.find(id); if (!layer) throw new Error(`Unknown layer: ${id}`); this.move(id, layer.parentId, index); }
  find(id: LayerId): Layer | undefined { return this.layers[id]; }
  snapshot(): LayerTreeState { return { rootLayerIds: [...this.rootLayerIds], layers: Object.fromEntries(Object.entries(this.layers).map(([id, layer]) => [id, this.#clone(layer)])) }; }
  restore(state: LayerTreeState): void { this.rootLayerIds.splice(0, this.rootLayerIds.length, ...state.rootLayerIds); Object.keys(this.layers).forEach(id => delete this.layers[id]); Object.entries(state.layers).forEach(([id, layer]) => { this.layers[id] = this.#clone(layer); }); }
  findParent(id: LayerId): GroupLayer | undefined { const layer = this.find(id); return layer?.parentId ? this.find(layer.parentId) as GroupLayer : undefined; }
  isDescendant(candidate: LayerId, ancestor: LayerId): boolean { let current = this.find(candidate); while (current?.parentId) { if (current.parentId === ancestor) return true; current = this.find(current.parentId); } return false; }
  traverse(): Layer[] { const result: Layer[] = []; const visit = (id: LayerId) => { const layer = this.find(id); if (!layer) return; result.push(layer); if (layer.kind === "group") layer.childLayerIds.forEach(visit); }; this.rootLayerIds.forEach(visit); return result; }
  #insert(siblings: LayerId[], id: LayerId, index?: number): void { siblings.splice(index === undefined ? siblings.length : Math.max(0, Math.min(index, siblings.length)), 0, id); }
  #clone(layer: Layer): Layer { const base = { ...layer, transform: { position: { ...layer.transform.position }, scale: { ...layer.transform.scale }, rotation: layer.transform.rotation } }; return layer.kind === "group" ? { ...base, kind: "group", compositing: layer.compositing, childLayerIds: [...layer.childLayerIds] } : { ...base, kind: "raster", raster: { ...layer.raster } }; }
  #unregister(layer: Layer): void { delete this.layers[layer.id]; if (layer.kind === "group") layer.childLayerIds.forEach(id => { const child = this.find(id); if (child) this.#unregister(child); }); }
}
export interface DocumentOptions { resolution?: Resolution; color?: ColorInfo; metadata?: Record<string, string>; }
export function createDocument(id: DocumentId, name: string, width: number, height: number, options: DocumentOptions = {}): Document { if (width <= 0 || height <= 0) throw new RangeError("Document dimensions must be positive"); return { id, name, width, height, resolution: options.resolution ?? { x: 72, y: 72, unit: "ppi" }, color: options.color ?? { model: "rgb", profile: "srgb", bitDepth: 8, alpha: true }, layerTree: new LayerTree(), metadata: { ...(options.metadata ?? {}) }, pixelSelection: null }; }
