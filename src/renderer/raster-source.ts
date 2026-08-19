import type { RasterDataReference } from "../core";

/** A small deterministic source for the first compositing path; future sources may resolve tiles, assets, or textures. */
export interface RasterSource { readonly id: string; readonly width: number; readonly height: number; /** RGBA pixels retained by the source boundary; current demo sources are solid-color. */ readonly pixels: Uint8ClampedArray; readonly color: readonly [number, number, number, number]; readonly revision?: number; }
export interface RasterSourceResolver { resolve(reference: RasterDataReference): RasterSource | undefined; }
export interface RasterColor { readonly r: number; readonly g: number; readonly b: number; readonly a: number; }

export function createSolidRasterSource(id: string, width: number, height: number, color: readonly [number, number, number, number], revision = 0): RasterSource {
  if (!id || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new RangeError("Raster source ID and dimensions must be valid");
  if (color.some(component => !Number.isFinite(component) || component < 0 || component > 255)) throw new RangeError("Raster color channels must be between 0 and 255");
  const pixels = new Uint8ClampedArray(width * height * 4); for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(color, offset);
  return { id, width, height, pixels, color: [...color] as [number, number, number, number], revision };
}
export class InMemoryRasterSourceResolver implements RasterSourceResolver {
  #sources = new Map<string, RasterSource>();
  constructor(sources: readonly RasterSource[] = []) { sources.forEach(source => this.set(source)); }
  set(source: RasterSource): void { this.#sources.set(source.id, source); }
  remove(id: string): void { this.#sources.delete(id); }
  resolve(reference: RasterDataReference): RasterSource | undefined { return reference.sourceId ? this.#sources.get(reference.sourceId) : undefined; }
}
/** Backend-owned cache keyed by stable source ID plus revision; it never stores Core objects. */
export class RasterResourceCache<Resource> {
  #entries = new Map<string, { revision: number; resource: Resource }>();
  constructor(private readonly resolver: RasterSourceResolver, private readonly create: (source: RasterSource) => Resource) {}
  get(reference: RasterDataReference): Resource | undefined { const source = this.resolver.resolve(reference); if (!source) return undefined; const revision = source.revision ?? 0; const entry = this.#entries.get(source.id); if (!entry || entry.revision !== revision) { const resource = this.create(source); this.#entries.set(source.id, { revision, resource }); return resource; } return entry.resource; }
  invalidate(sourceId?: string): void { if (sourceId) this.#entries.delete(sourceId); else this.#entries.clear(); }
  dispose(): void { this.#entries.clear(); }
}
export function sourceColor(source: RasterSource): RasterColor { return { r: source.color[0] / 255, g: source.color[1] / 255, b: source.color[2] / 255, a: source.color[3] / 255 }; }
