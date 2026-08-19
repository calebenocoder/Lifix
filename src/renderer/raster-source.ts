import type { RasterDataReference } from "../core";

export interface RasterPixelFormat { readonly id: string; readonly channels: string; readonly bitsPerChannel: number; readonly componentType: "unorm" | "float" | "uint"; readonly alpha: "straight" | "premultiplied" | "opaque"; readonly rowOrder: "top-to-bottom" | "bottom-to-top"; readonly bytesPerPixel: number; }
export const RGBA8_UNORM = { id: "rgba8unorm", channels: "rgba", bitsPerChannel: 8, componentType: "unorm", alpha: "straight", rowOrder: "top-to-bottom", bytesPerPixel: 4 } as const satisfies RasterPixelFormat;
/** The source owns this buffer. Mutating its pixels requires publishing a higher revision. */
export interface RasterSource { readonly id: string; readonly revision: number; readonly width: number; readonly height: number; readonly format: RasterPixelFormat; readonly pixels: Uint8ClampedArray; }
export interface RasterSourceResolver { resolve(reference: RasterDataReference): RasterSource | undefined; subscribe?(listener: (sourceId: string) => void): () => void; }
export type RasterResourceErrorCode = "missing-source" | "invalid-dimensions" | "invalid-buffer-length" | "unsupported-format" | "resource-creation-failed";
export interface RasterResourceError { readonly code: RasterResourceErrorCode; readonly message: string; readonly sourceId?: string; readonly cause?: unknown; }
export interface TextureUploadLayout { readonly width: number; readonly height: number; readonly unpaddedBytesPerRow: number; readonly bytesPerRow: number; readonly rowsPerImage: number; readonly byteLength: number; }
export interface TextureUpload { readonly data: Uint8Array | Uint8ClampedArray; readonly layout: TextureUploadLayout; readonly alpha: "straight" | "premultiplied"; }
export interface RasterUv { readonly x: 0 | 1; readonly y: 0 | 1; readonly u: 0 | 1; readonly v: 0 | 1; }

export function expectedRasterByteLength(width: number, height: number, format: RasterPixelFormat = RGBA8_UNORM): number { return width * height * format.bytesPerPixel; }
export function validateRasterSource(source: RasterSource): RasterSource {
  if (!source.id) throw rasterError("missing-source", "Raster source ID is required");
  if (!Number.isSafeInteger(source.width) || !Number.isSafeInteger(source.height) || source.width <= 0 || source.height <= 0) throw rasterError("invalid-dimensions", "Raster dimensions must be positive safe integers", source.id);
  if (source.format.id !== RGBA8_UNORM.id) throw rasterError("unsupported-format", `Unsupported raster format: ${String((source.format as { id?: unknown }).id)}`, source.id);
  const expected = expectedRasterByteLength(source.width, source.height, source.format); if (!Number.isSafeInteger(expected) || source.pixels.byteLength !== expected) throw rasterError("invalid-buffer-length", `Raster ${source.id} requires ${expected} bytes but received ${source.pixels.byteLength}`, source.id);
  if (!Number.isSafeInteger(source.revision) || source.revision < 0) throw rasterError("invalid-dimensions", "Raster revision must be a non-negative safe integer", source.id);
  return source;
}
export function createRgba8RasterSource(id: string, width: number, height: number, pixels: Uint8ClampedArray, revision = 0): RasterSource { return validateRasterSource({ id, width, height, pixels, revision, format: RGBA8_UNORM }); }
export function createSolidRasterSource(id: string, width: number, height: number, color: readonly [number, number, number, number], revision = 0): RasterSource {
  if (color.some(channel => !Number.isInteger(channel) || channel < 0 || channel > 255)) throw new RangeError("Raster color channels must be integer values between 0 and 255");
  const pixels = new Uint8ClampedArray(expectedRasterByteLength(width, height)); for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(color, offset); return createRgba8RasterSource(id, width, height, pixels, revision);
}
export class InMemoryRasterSourceResolver implements RasterSourceResolver {
  #sources = new Map<string, RasterSource>(); #listeners = new Set<(sourceId: string) => void>();
  constructor(sources: readonly RasterSource[] = []) { sources.forEach(source => this.#sources.set(source.id, validateRasterSource(source))); }
  set(source: RasterSource): void { const validated = validateRasterSource(source); const previous = this.#sources.get(source.id); this.#sources.set(source.id, validated); if (!previous || previous.revision !== source.revision) this.#listeners.forEach(listener => listener(source.id)); }
  remove(id: string): void { if (this.#sources.delete(id)) this.#listeners.forEach(listener => listener(id)); }
  resolve(reference: RasterDataReference): RasterSource | undefined { return reference.sourceId ? this.#sources.get(reference.sourceId) : undefined; }
  subscribe(listener: (sourceId: string) => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
}
/** Backend-owned cache keyed by stable source ID plus revision; replacement and disposal release resources. */
export class RasterResourceCache<Resource> {
  #entries = new Map<string, { revision: number; resource: Resource }>(); lastError?: RasterResourceError;
  constructor(private readonly resolver: RasterSourceResolver, private readonly create: (source: RasterSource) => Resource, private readonly destroy: (resource: Resource) => void = () => {}) {}
  get(reference: RasterDataReference): Resource | undefined {
    let source: RasterSource | undefined; try { source = this.resolver.resolve(reference); } catch (cause) { this.lastError = rasterError("resource-creation-failed", "Raster source resolution failed", reference.sourceId, cause); return undefined; }
    if (!source) { this.lastError = rasterError("missing-source", `Raster source is unavailable: ${reference.sourceId ?? "unidentified"}`, reference.sourceId); return undefined; }
    try { validateRasterSource(source); const entry = this.#entries.get(source.id); if (entry?.revision === source.revision) { this.lastError = undefined; return entry.resource; } const resource = this.create(source); if (entry) this.destroy(entry.resource); this.#entries.set(source.id, { revision: source.revision, resource }); this.lastError = undefined; return resource; } catch (cause) { this.lastError = isRasterError(cause) ? cause : rasterError("resource-creation-failed", `Raster resource creation failed: ${source.id}`, source.id, cause); return undefined; }
  }
  invalidate(sourceId?: string): void { if (sourceId) { const entry = this.#entries.get(sourceId); if (entry) this.destroy(entry.resource); this.#entries.delete(sourceId); return; } this.#entries.forEach(entry => this.destroy(entry.resource)); this.#entries.clear(); }
  dispose(): void { this.invalidate(); }
  get size(): number { return this.#entries.size; }
}
export function calculateTextureUploadLayout(width: number, height: number, bytesPerPixel: number = RGBA8_UNORM.bytesPerPixel, alignment: number = 256): TextureUploadLayout {
  if (![width, height, bytesPerPixel, alignment].every(Number.isSafeInteger) || width <= 0 || height <= 0 || bytesPerPixel <= 0 || alignment <= 0) throw new RangeError("Texture upload dimensions and alignment must be positive safe integers"); const unpaddedBytesPerRow = width * bytesPerPixel; const bytesPerRow = Math.ceil(unpaddedBytesPerRow / alignment) * alignment; return { width, height, unpaddedBytesPerRow, bytesPerRow, rowsPerImage: height, byteLength: bytesPerRow * height };
}
export function prepareTextureUpload(source: RasterSource, alignment = 256, alpha: "straight" | "premultiplied" = "premultiplied"): TextureUpload {
  validateRasterSource(source); const layout = calculateTextureUploadLayout(source.width, source.height, source.format.bytesPerPixel, alignment); if (alpha === "straight" && layout.bytesPerRow === layout.unpaddedBytesPerRow) return { data: source.pixels, layout, alpha }; const data = new Uint8Array(layout.byteLength); for (let row = 0; row < source.height; row += 1) for (let column = 0; column < source.width; column += 1) { const sourceOffset = row * layout.unpaddedBytesPerRow + column * 4; const targetOffset = row * layout.bytesPerRow + column * 4; const opacity = source.pixels[sourceOffset + 3]; data[targetOffset] = alpha === "premultiplied" ? Math.round(source.pixels[sourceOffset] * opacity / 255) : source.pixels[sourceOffset]; data[targetOffset + 1] = alpha === "premultiplied" ? Math.round(source.pixels[sourceOffset + 1] * opacity / 255) : source.pixels[sourceOffset + 1]; data[targetOffset + 2] = alpha === "premultiplied" ? Math.round(source.pixels[sourceOffset + 2] * opacity / 255) : source.pixels[sourceOffset + 2]; data[targetOffset + 3] = opacity; } return { data, layout, alpha };
}
/** Vertex order and UVs share a top-left origin; the first pixel row maps to v=0 without a vertical flip. */
export function rasterUvForVertex(index: number): RasterUv { const vertices: readonly RasterUv[] = [{ x: 0, y: 0, u: 0, v: 0 }, { x: 1, y: 0, u: 1, v: 0 }, { x: 0, y: 1, u: 0, v: 1 }, { x: 0, y: 1, u: 0, v: 1 }, { x: 1, y: 0, u: 1, v: 0 }, { x: 1, y: 1, u: 1, v: 1 }]; if (!Number.isInteger(index) || index < 0 || index >= vertices.length) throw new RangeError("Raster vertex index must be between 0 and 5"); return vertices[index]; }
function rasterError(code: RasterResourceErrorCode, message: string, sourceId?: string, cause?: unknown): RasterResourceError & Error { return Object.assign(new Error(message), { code, sourceId, cause }); }
function isRasterError(value: unknown): value is RasterResourceError & Error { return value instanceof Error && "code" in value; }
