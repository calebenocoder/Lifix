import { RASTER_TILE_SIZE, RGBA8_STRAIGHT, RasterStore, type RasterAsset, type RasterTileCoordinate } from "../core";
import { createRgba8RasterSource, type RasterSource, type RasterSourceResolver, type RasterTileChange, type RasterTileSource, type RasterTiledSourceInfo } from "./raster-source";
import type { RasterDataReference } from "../core";

/**
 * Renderer-facing adapter for Core-owned RasterStore assets.
 * `resolve` intentionally supports only one-tile assets as a temporary compatibility bridge;
 * large assets must use `describe`/`resolveTile` and are never materialized into a giant buffer.
 */
export class RasterStoreSourceResolver implements RasterSourceResolver {
  readonly #listeners = new Set<(sourceId: string) => void>();
  readonly #tileListeners = new Set<(change: RasterTileChange) => void>();
  readonly #compatibility = new Map<string, RasterSource>();
  readonly #unsubscribeAsset: () => void;
  readonly #unsubscribeMutation: () => void;
  constructor(private readonly store: RasterStore) {
    this.#unsubscribeAsset = store.subscribeAssetChanges(id => { this.#compatibility.delete(id); this.#listeners.forEach(listener => listener(id)); if (!store.get(id)) this.#tileListeners.forEach(listener => listener({ sourceId: id })); });
    this.#unsubscribeMutation = store.subscribe(result => { this.#compatibility.delete(result.assetId); this.#tileListeners.forEach(listener => listener({ sourceId: result.assetId, tiles: result.dirtyTiles.map(tile => ({ x: tile.x, y: tile.y, revision: tile.revision })) })); });
  }
  resolve(reference: RasterDataReference): RasterSource | undefined {
    const asset = this.#asset(reference); if (!asset || asset.tileColumns !== 1 || asset.tileRows !== 1) return undefined;
    const cached = this.#compatibility.get(asset.id); if (cached?.revision === asset.revision) return cached;
    const pixels = new Uint8ClampedArray(asset.width * asset.height * RGBA8_STRAIGHT.bytesPerPixel); const tile = asset.resolveTile({ x: 0, y: 0 });
    if (tile.pixels) for (let row = 0; row < asset.height; row += 1) pixels.set(tile.pixels.subarray(row * RASTER_TILE_SIZE * RGBA8_STRAIGHT.bytesPerPixel, row * RASTER_TILE_SIZE * RGBA8_STRAIGHT.bytesPerPixel + asset.width * RGBA8_STRAIGHT.bytesPerPixel), row * asset.width * RGBA8_STRAIGHT.bytesPerPixel);
    const source = createRgba8RasterSource(asset.id, asset.width, asset.height, pixels, asset.revision); this.#compatibility.set(asset.id, source); return source;
  }
  describe(reference: RasterDataReference): RasterTiledSourceInfo | undefined { const asset = this.#asset(reference); return asset ? { sourceId: asset.id, revision: asset.revision, width: asset.width, height: asset.height, tileSize: RASTER_TILE_SIZE, tileColumns: asset.tileColumns, tileRows: asset.tileRows, format: { id: RGBA8_STRAIGHT.id, channels: RGBA8_STRAIGHT.channels, bitsPerChannel: 8, componentType: "unorm", alpha: RGBA8_STRAIGHT.alpha, rowOrder: RGBA8_STRAIGHT.rowOrder, bytesPerPixel: RGBA8_STRAIGHT.bytesPerPixel } } : undefined; }
  resolveTile(reference: RasterDataReference, tileX: number, tileY: number): RasterTileSource | undefined { const asset = this.#asset(reference); if (!asset) return undefined; const coordinate: RasterTileCoordinate = { x: tileX, y: tileY }; const tile = asset.resolveTile(coordinate); return { sourceId: asset.id, assetRevision: asset.revision, x: tile.x, y: tile.y, width: tile.width, height: tile.height, revision: tile.revision, allocated: tile.allocated, bytesPerRow: RASTER_TILE_SIZE * RGBA8_STRAIGHT.bytesPerPixel, format: { id: RGBA8_STRAIGHT.id, channels: RGBA8_STRAIGHT.channels, bitsPerChannel: 8, componentType: "unorm", alpha: RGBA8_STRAIGHT.alpha, rowOrder: RGBA8_STRAIGHT.rowOrder, bytesPerPixel: RGBA8_STRAIGHT.bytesPerPixel }, pixels: tile.pixels }; }
  enumerateAllocatedTiles(reference: RasterDataReference): readonly RasterTileSource[] | undefined { const asset = this.#asset(reference); return asset?.allocatedTiles().map(tile => ({ sourceId: asset.id, assetRevision: asset.revision, x: tile.x, y: tile.y, width: tile.width, height: tile.height, revision: tile.revision, allocated: true, bytesPerRow: RASTER_TILE_SIZE * RGBA8_STRAIGHT.bytesPerPixel, format: { id: RGBA8_STRAIGHT.id, channels: RGBA8_STRAIGHT.channels, bitsPerChannel: 8, componentType: "unorm", alpha: RGBA8_STRAIGHT.alpha, rowOrder: RGBA8_STRAIGHT.rowOrder, bytesPerPixel: RGBA8_STRAIGHT.bytesPerPixel } })); }
  subscribe(listener: (sourceId: string) => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  subscribeTiles(listener: (change: RasterTileChange) => void): () => void { this.#tileListeners.add(listener); return () => this.#tileListeners.delete(listener); }
  dispose(): void { this.#unsubscribeAsset(); this.#unsubscribeMutation(); this.#compatibility.clear(); this.#listeners.clear(); this.#tileListeners.clear(); }
  #asset(reference: RasterDataReference): RasterAsset | undefined { return reference.sourceId ? this.store.get(reference.sourceId) : undefined; }
}
