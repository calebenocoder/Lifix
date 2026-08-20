import { createDocument, type BlendMode, type ColorInfo, type Document, type Layer, type LayerId, type LayerTreeState, type RasterDataReference, type Resolution, type Transform } from "./document";
import { clonePixelSelection, setPixelSelection, type PixelSelection } from "./selection";

/** Native project data v1. Pixel payloads deliberately live outside this structural format. */
export const PROJECT_FORMAT_VERSION = 1 as const;
export interface SerializedProject {
  readonly formatVersion: typeof PROJECT_FORMAT_VERSION;
  readonly document: {
    readonly id: string;
    readonly name: string;
    readonly width: number;
    readonly height: number;
    readonly resolution: Resolution;
    readonly color: ColorInfo;
    readonly metadata: Record<string, string>;
    readonly layerTree: LayerTreeState;
    /** Geometric editor operation state; transient interaction previews are intentionally excluded. */
    readonly pixelSelection: PixelSelection | null;
  };
}

export function serializeDocument(document: Document): SerializedProject {
  return {
    formatVersion: PROJECT_FORMAT_VERSION,
    document: {
      id: document.id, name: document.name, width: document.width, height: document.height,
      resolution: { ...document.resolution }, color: { ...document.color }, metadata: { ...document.metadata },
      layerTree: document.layerTree.snapshot(), pixelSelection: clonePixelSelection(document.pixelSelection),
    },
  };
}

export function deserializeProject(input: unknown): Document {
  const project = asObject(input, "Project data must be an object");
  if (project.formatVersion !== PROJECT_FORMAT_VERSION) throw new Error(`Unsupported project format version: ${String(project.formatVersion)}`);
  const source = asObject(project.document, "Project document is required");
  const id = requiredString(source.id, "Document ID");
  const name = requiredString(source.name, "Document name");
  const width = positiveNumber(source.width, "Document width");
  const height = positiveNumber(source.height, "Document height");
  const resolution = validateResolution(source.resolution);
  const color = validateColor(source.color);
  const metadata = validateMetadata(source.metadata);
  const tree = validateLayerTree(source.layerTree);
  const pixelSelection = source.pixelSelection === undefined ? null : validatePixelSelection(source.pixelSelection, width, height);
  const document = createDocument(id, name, width, height, { resolution, color, metadata });
  document.layerTree.restore(tree);
  setPixelSelection(document, pixelSelection);
  return document;
}

function asObject(value: unknown, message: string): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message); return value as Record<string, unknown>; }
function requiredString(value: unknown, label: string): string { if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`); return value; }
function positiveNumber(value: unknown, label: string): number { if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a positive finite number`); return value; }
function validateResolution(value: unknown): Resolution { const result = asObject(value, "Resolution is required"); if (result.unit !== "ppi") throw new Error("Resolution unit must be ppi"); return { x: positiveNumber(result.x, "Resolution x"), y: positiveNumber(result.y, "Resolution y"), unit: "ppi" }; }
function validateColor(value: unknown): ColorInfo { const result = asObject(value, "Color information is required"); if (result.model !== "rgb" || result.profile !== "srgb" || (result.bitDepth !== 8 && result.bitDepth !== 16) || typeof result.alpha !== "boolean") throw new Error("Invalid color information"); return { model: "rgb", profile: "srgb", bitDepth: result.bitDepth, alpha: result.alpha }; }
function validateMetadata(value: unknown): Record<string, string> { const result = asObject(value, "Document metadata is required"); for (const [key, item] of Object.entries(result)) { requiredString(key, "Metadata key"); if (typeof item !== "string") throw new Error("Metadata values must be strings"); } return { ...result } as Record<string, string>; }
function validatePixelSelection(value: unknown, width: number, height: number): PixelSelection | null {
  if (value === null) return null;
  const source = asObject(value, "Pixel selection must be an object or null");
  if (source.kind !== "rectangle") throw new Error("Unsupported pixel selection kind");
  const coordinate = (item: unknown, label: string) => { if (typeof item !== "number" || !Number.isFinite(item)) throw new Error(`${label} must be finite`); return item; };
  const selection: PixelSelection = { kind: "rectangle", left: coordinate(source.left, "Pixel selection left"), top: coordinate(source.top, "Pixel selection top"), right: coordinate(source.right, "Pixel selection right"), bottom: coordinate(source.bottom, "Pixel selection bottom") };
  if (selection.left >= selection.right || selection.top >= selection.bottom) throw new Error("Pixel selection must have positive normalized bounds");
  if (selection.left < 0 || selection.top < 0 || selection.right > width || selection.bottom > height) throw new Error("Pixel selection must be within document bounds");
  return selection;
}
function validateLayerTree(value: unknown): LayerTreeState {
  const source = asObject(value, "Layer tree is required");
  if (!Array.isArray(source.rootLayerIds) || !source.rootLayerIds.every(id => typeof id === "string")) throw new Error("Root layer IDs must be a string array");
  const rawLayers = asObject(source.layers, "Layer map is required");
  const layers: Record<LayerId, Layer> = {};
  for (const [id, raw] of Object.entries(rawLayers)) layers[id] = validateLayer(id, raw);
  const roots = [...source.rootLayerIds] as LayerId[];
  assertUnique(roots, "Root layer IDs");
  const referenced = new Set<LayerId>();
  const visit = (id: LayerId, expectedParent: LayerId | null): void => {
    const layer = layers[id];
    if (!layer) throw new Error(`Layer reference does not exist: ${id}`);
    if (referenced.has(id)) throw new Error(`Layer is referenced more than once: ${id}`);
    if (layer.parentId !== expectedParent) throw new Error(`Invalid parent relationship for layer: ${id}`);
    referenced.add(id);
    if (layer.kind === "group") { assertUnique(layer.childLayerIds, `Child layer IDs for ${id}`); layer.childLayerIds.forEach(childId => visit(childId, id)); }
  };
  roots.forEach(id => visit(id, null));
  if (referenced.size !== Object.keys(layers).length) throw new Error("Layer tree contains unreachable layers");
  return { rootLayerIds: roots, layers };
}
function validateLayer(id: string, value: unknown): Layer {
  requiredString(id, "Layer map key");
  const raw = asObject(value, `Layer ${id} must be an object`);
  if (raw.id !== id) throw new Error(`Layer ID mismatch: ${id}`);
  const common = { id, name: requiredString(raw.name, `Layer name for ${id}`), visible: boolean(raw.visible, `Layer visibility for ${id}`), opacity: opacity(raw.opacity), blendMode: blendMode(raw.blendMode), transform: transform(raw.transform), parentId: raw.parentId === null ? null : requiredString(raw.parentId, `Parent ID for ${id}`) };
  if (raw.kind === "group") { if (!Array.isArray(raw.childLayerIds) || !raw.childLayerIds.every(child => typeof child === "string")) throw new Error(`Group children must be string IDs: ${id}`); if (raw.compositing !== undefined && raw.compositing !== "pass-through" && raw.compositing !== "isolated") throw new Error(`Unsupported group compositing mode: ${id}`); return { ...common, kind: "group", compositing: raw.compositing ?? "pass-through", childLayerIds: [...raw.childLayerIds] }; }
  if (raw.kind === "raster") return { ...common, kind: "raster", raster: raster(raw.raster) };
  throw new Error(`Unsupported layer kind: ${String(raw.kind)}`);
}
function boolean(value: unknown, label: string): boolean { if (typeof value !== "boolean") throw new Error(`${label} must be boolean`); return value; }
function opacity(value: unknown): number { if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("Layer opacity must be between 0 and 1"); return value; }
function blendMode(value: unknown): BlendMode { if (value === "normal" || value === "multiply" || value === "screen" || value === "overlay") return value; throw new Error("Unsupported blend mode"); }
function transform(value: unknown): Transform { const raw = asObject(value, "Layer transform is required"); const position = asObject(raw.position, "Transform position is required"); const scale = asObject(raw.scale, "Transform scale is required"); const finite = (item: unknown, label: string) => { if (typeof item !== "number" || !Number.isFinite(item)) throw new Error(`${label} must be finite`); return item; }; return { position: { x: finite(position.x, "Position x"), y: finite(position.y, "Position y") }, scale: { x: finite(scale.x, "Scale x"), y: finite(scale.y, "Scale y") }, rotation: finite(raw.rotation, "Rotation") }; }
function raster(value: unknown): RasterDataReference { const raw = asObject(value, "Raster reference is required"); if (raw.kind !== "raster-reference" || (raw.storage !== "external" && raw.storage !== "tiled" && raw.storage !== "lazy" && raw.storage !== "gpu-cache")) throw new Error("Invalid raster reference"); if (raw.sourceId !== undefined && typeof raw.sourceId !== "string") throw new Error("Raster source ID must be a string"); return raw.sourceId === undefined ? { kind: "raster-reference", storage: raw.storage } : { kind: "raster-reference", storage: raw.storage, sourceId: raw.sourceId }; }
function assertUnique(ids: string[], label: string): void { if (new Set(ids).size !== ids.length) throw new Error(`${label} must be unique`); }
