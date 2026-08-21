import { RASTER_TILE_SIZE, RGBA8_STRAIGHT, RasterStore, type RasterAsset, type RasterTileCoordinate } from "../core";
import { createRgba8RasterSource, type RasterSource, type RasterSourceResolver, type RasterTileSource, type RasterTiledSourceInfo } from "./raster-source";
import type { RasterDataReference } from "../core";

/**
 * Renderer-facing adapter for Core-owned RasterStore assets.
 * `resolve` intentionally supports only one-tile assets as a temporary compatibility bridge;
 * large assets must use `describe`/`resolveTile` and are never materialized into a giant buffer.
 */
export class RasterStoreSourceResolver implements RasterSourceResolver {
  readonly #listeners = new Set<(sourceId: string) => void>();
  readonly #compatibility = new Map<string, RasterSource>();
  readonly #unsubscribe: () => void;
  constructor(private readonly store: RasterStore) { this.#unsubscribe = store.subscribeAssetChanges(id => { this.#compatibility.delete(id); this.#listeners.forEach(listener => listener(id)); }); }
  resolve(reference: RasterDataReference): RasterSource | undefined {
    const asset = this.#asset(reference); if (!asset || asset.tileColumns !== 1 || asset.tileRows !== 1) return undefined;
    const cached = this.#compatibility.get(asset.id); if (cached?.revision === asset.revision) return cached;
    const pixels = new Uint8ClampedArray(asset.width * asset.height * RGBA8_STRAIGHT.bytesPerPixel); const tile = asset.resolveTile({ x: 0, y: 0 });
    if (tile.pixels) for (let row = 0; row < asset.height; row += 1) pixels.set(tile.pixels.subarray(row * RASTER_TILE_SIZE * RGBA8_STRAIGHT.bytesPerPixel, row * RASTER_TILE_SIZE * RGBA8_STRAIGHT.bytesPerPixel + asset.width * RGBA8_STRAIGHT.bytesPerPixel), row * asset.width * RGBA8_STRAIGHT.bytesPerPixel);
    const source = createRgba8RasterSource(asset.id, asset.width, asset.height, pixels, asset.revision); this.#compatibility.set(asset.id, source); return source;
  }
  describe(reference: RasterDataReference): RasterTiledSourceInfo | undefined { const asset = this.#asset(reference); return asset ? { sourceId: asset.id, revision: asset.revision, width: asset.width, height: asset.height, tileSize: RASTER_TILE_SIZE, tileColumns: asset.tileColumns, tileRows: asset.tileRows, format: { id: RGBA8_STRAIGHT.id, channels: RGBA8_STRAIGHT.channels, bitsPerChannel: 8, componentType: "unorm", alpha: RGBA8_STRAIGHT.alpha, rowOrder: RGBA8_STRAIGHT.rowOrder, bytesPerPixel: RGBA8_STRAIGHT.bytesPerPixel } } : undefined; }
  resolveTile(reference: RasterDataReference, tileX: number, tileY: number): RasterTileSource | undefined { const asset = this.#asset(reference); if (!asset) return undefined; const coordinate: RasterTileCoordinate = { x: tileX, y: tileY }; const tile = asset.resolveTile(coordinate); return { sourceId: asset.id, assetRevision: asset.revision, x: tile.x, y: tile.y, width: tile.width, height: tile.height, revision: tile.revision, allocated: tile.allocated, format: { id: RGBA8_STRAIGHT.id, channels: RGBA8_STRAIGHT.channels, bitsPerChannel: 8, componentType: "unorm", alpha: RGBA8_STRAIGHT.alpha, rowOrder: RGBA8_STRAIGHT.rowOrder, bytesPerPixel: RGBA8_STRAIGHT.bytesPerPixel }, pixels: tile.pixels }; }
  subscribe(listener: (sourceId: string) => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  dispose(): void { this.#unsubscribe(); this.#compatibility.clear(); this.#listeners.clear(); }
  #asset(reference: RasterDataReference): RasterAsset | undefined { return reference.sourceId ? this.store.get(reference.sourceId) : undefined; }
}
