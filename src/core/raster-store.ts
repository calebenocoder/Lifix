/** Platform-independent mutable RGBA8 raster storage. Pixels are straight-alpha, top-to-bottom, encoded sRGB-like bytes. */
export const RASTER_TILE_SIZE = 256;
export const RGBA8_STRAIGHT = { id: "rgba8unorm", channels: "rgba", bytesPerPixel: 4, alpha: "straight", rowOrder: "top-to-bottom" } as const;
export type RasterAssetId = string;
export type RasterPixel = readonly [number, number, number, number];
export interface RasterTileCoordinate { readonly x: number; readonly y: number; }
export interface RasterAssetDescriptor { readonly id: RasterAssetId; readonly width: number; readonly height: number; readonly format?: typeof RGBA8_STRAIGHT; }
export interface RasterAssetInfo { readonly id: RasterAssetId; readonly width: number; readonly height: number; readonly format: typeof RGBA8_STRAIGHT; readonly tileSize: number; readonly tileColumns: number; readonly tileRows: number; readonly revision: number; readonly allocatedTileCount: number; readonly allocatedBytes: number; }
export interface RasterTileInfo extends RasterTileCoordinate { readonly width: number; readonly height: number; readonly revision: number; readonly allocated: boolean; }
export interface RasterReadableTile extends RasterTileInfo { readonly pixels?: Uint8ClampedArray; }
export interface RasterDirtyTile extends RasterTileCoordinate { readonly width: number; readonly height: number; readonly previousRevision: number; readonly revision: number; }
export interface RasterDirtyBounds { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number; }
export interface RasterTileBeforeState extends RasterTileCoordinate { readonly width: number; readonly height: number; readonly revision: number; readonly pixels?: Uint8ClampedArray; }
export interface RasterMutationResult { readonly assetId: RasterAssetId; readonly previousRevision: number; readonly revision: number; readonly dirtyTiles: readonly RasterDirtyTile[]; readonly dirtyBounds: RasterDirtyBounds; readonly beforeTiles: readonly RasterTileBeforeState[]; }

interface StoredTile { readonly pixels: Uint8ClampedArray; revision: number; }
interface WorkingTile { readonly coordinate: RasterTileCoordinate; readonly pixels: Uint8ClampedArray; readonly before?: RasterTileBeforeState; readonly previousRevision: number; }

function key(coordinate: RasterTileCoordinate): string { return `${coordinate.x},${coordinate.y}`; }
function assertPixel(pixel: readonly number[]): void { if (pixel.length !== 4 || pixel.some(value => !Number.isInteger(value) || value < 0 || value > 255)) throw new RangeError("RGBA pixels must contain four integer channels between 0 and 255"); }
function assertCoordinate(coordinate: RasterTileCoordinate): void { if (!Number.isSafeInteger(coordinate.x) || !Number.isSafeInteger(coordinate.y) || coordinate.x < 0 || coordinate.y < 0) throw new RangeError("Tile coordinates must be non-negative safe integers"); }
function union(first: RasterDirtyBounds | undefined, left: number, top: number, right: number, bottom: number): RasterDirtyBounds { return first ? { left: Math.min(first.left, left), top: Math.min(first.top, top), right: Math.max(first.right, right), bottom: Math.max(first.bottom, bottom) } : { left, top, right, bottom }; }

/** A single logical raster asset. Tile buffers are always full-sized; edge tiles expose smaller logical dimensions. */
export class RasterAsset {
  readonly #tiles = new Map<string, StoredTile>();
  #revision = 0;
  constructor(readonly id: RasterAssetId, readonly width: number, readonly height: number, readonly format: typeof RGBA8_STRAIGHT = RGBA8_STRAIGHT) { if (!id.trim()) throw new Error("Raster asset ID is required"); if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new RangeError("Raster asset dimensions must be positive safe integers"); if (format.id !== RGBA8_STRAIGHT.id || format.channels !== RGBA8_STRAIGHT.channels || format.bytesPerPixel !== RGBA8_STRAIGHT.bytesPerPixel || format.alpha !== RGBA8_STRAIGHT.alpha || format.rowOrder !== RGBA8_STRAIGHT.rowOrder) throw new Error("Unsupported raster pixel format"); }
  get tileSize(): number { return RASTER_TILE_SIZE; }
  get tileColumns(): number { return Math.ceil(this.width / RASTER_TILE_SIZE); }
  get tileRows(): number { return Math.ceil(this.height / RASTER_TILE_SIZE); }
  get revision(): number { return this.#revision; }
  get allocatedTileCount(): number { return this.#tiles.size; }
  get allocatedBytes(): number { return this.#tiles.size * RASTER_TILE_SIZE * RASTER_TILE_SIZE * this.format.bytesPerPixel; }
  get info(): RasterAssetInfo { return { id: this.id, width: this.width, height: this.height, format: this.format, tileSize: RASTER_TILE_SIZE, tileColumns: this.tileColumns, tileRows: this.tileRows, revision: this.revision, allocatedTileCount: this.allocatedTileCount, allocatedBytes: this.allocatedBytes }; }
  tileInfo(coordinate: RasterTileCoordinate): RasterTileInfo { this.#assertTile(coordinate); const stored = this.#tiles.get(key(coordinate)); const width = Math.min(RASTER_TILE_SIZE, this.width - coordinate.x * RASTER_TILE_SIZE); const height = Math.min(RASTER_TILE_SIZE, this.height - coordinate.y * RASTER_TILE_SIZE); return { ...coordinate, width, height, revision: stored?.revision ?? 0, allocated: Boolean(stored) }; }
  /** Read-only storage boundary for render resolvers. Consumers must never mutate the returned typed array. */
  resolveTile(coordinate: RasterTileCoordinate): RasterReadableTile { const info = this.tileInfo(coordinate); return { ...info, pixels: this.#tiles.get(key(coordinate))?.pixels }; }
  readPixel(x: number, y: number): RasterPixel { this.assertPixelCoordinate(x, y); const coordinate = { x: Math.floor(x / RASTER_TILE_SIZE), y: Math.floor(y / RASTER_TILE_SIZE) }; const stored = this.#tiles.get(key(coordinate)); if (!stored) return [0, 0, 0, 0]; const localX = x % RASTER_TILE_SIZE, localY = y % RASTER_TILE_SIZE, offset = (localY * RASTER_TILE_SIZE + localX) * 4; return [stored.pixels[offset]!, stored.pixels[offset + 1]!, stored.pixels[offset + 2]!, stored.pixels[offset + 3]!]; }
  /** @internal Bounds hook shared by transaction operations without allocating pixel objects. */
  assertPixelCoordinate(x: number, y: number): void { if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0 || x >= this.width || y >= this.height) throw new RangeError("Pixel coordinates must be safe integers within raster bounds"); }
  #assertTile(coordinate: RasterTileCoordinate): void { assertCoordinate(coordinate); if (coordinate.x >= this.tileColumns || coordinate.y >= this.tileRows) throw new RangeError("Tile coordinates must be within raster bounds"); }
  /** @internal Transaction-only commit hook; callers use RasterMutationTransaction. */
  commitWorkingTiles(working: ReadonlyMap<string, WorkingTile>, bounds: RasterDirtyBounds | undefined): RasterMutationResult | undefined {
    if (working.size === 0 || !bounds) return undefined;
    const previousRevision = this.#revision; const revision = previousRevision + 1; const dirtyTiles: RasterDirtyTile[] = []; const beforeTiles: RasterTileBeforeState[] = [];
    [...working.values()].sort((a, b) => a.coordinate.y - b.coordinate.y || a.coordinate.x - b.coordinate.x).forEach(tile => { const info = this.tileInfo(tile.coordinate); this.#tiles.set(key(tile.coordinate), { pixels: tile.pixels, revision: tile.previousRevision + 1 }); dirtyTiles.push({ x: tile.coordinate.x, y: tile.coordinate.y, width: info.width, height: info.height, previousRevision: tile.previousRevision, revision: tile.previousRevision + 1 }); if (tile.before) beforeTiles.push(tile.before); });
    this.#revision = revision; return { assetId: this.id, previousRevision, revision, dirtyTiles, dirtyBounds: bounds, beforeTiles };
  }
  /** @internal Transaction-only working-tile hook; callers use RasterMutationTransaction. */
  createWorkingTile(coordinate: RasterTileCoordinate): WorkingTile { this.#assertTile(coordinate); const stored = this.#tiles.get(key(coordinate)); const before = { ...this.tileInfo(coordinate), revision: stored?.revision ?? 0, pixels: stored ? new Uint8ClampedArray(stored.pixels) : undefined }; return { coordinate, pixels: stored ? new Uint8ClampedArray(stored.pixels) : new Uint8ClampedArray(RASTER_TILE_SIZE * RASTER_TILE_SIZE * this.format.bytesPerPixel), before, previousRevision: stored?.revision ?? 0 }; }
}

/** Atomic tile mutation. Working tiles are private until commit; rollback/abandoning never advances revisions. */
export class RasterMutationTransaction {
  readonly #working = new Map<string, WorkingTile>();
  #bounds?: RasterDirtyBounds;
  #closed = false;
  constructor(readonly asset: RasterAsset, private readonly onCommit?: (result: RasterMutationResult) => void) {}
  readPixel(x: number, y: number): RasterPixel { this.#assertOpen(); this.#assertPixelCoordinate(x, y); const coordinate = { x: Math.floor(x / RASTER_TILE_SIZE), y: Math.floor(y / RASTER_TILE_SIZE) }; const working = this.#working.get(key(coordinate)); if (!working) return this.asset.readPixel(x, y); const offset = ((y % RASTER_TILE_SIZE) * RASTER_TILE_SIZE + (x % RASTER_TILE_SIZE)) * 4; return [working.pixels[offset]!, working.pixels[offset + 1]!, working.pixels[offset + 2]!, working.pixels[offset + 3]!]; }
  writePixel(x: number, y: number, pixel: RasterPixel): void { this.#assertOpen(); this.#assertPixelCoordinate(x, y); assertPixel(pixel); const tile = this.#touch({ x: Math.floor(x / RASTER_TILE_SIZE), y: Math.floor(y / RASTER_TILE_SIZE) }); const offset = ((y % RASTER_TILE_SIZE) * RASTER_TILE_SIZE + (x % RASTER_TILE_SIZE)) * 4; tile.pixels.set(pixel, offset); this.#bounds = union(this.#bounds, x, y, x + 1, y + 1); }
  /** Bulk row-major RGBA8 copy; it may span tiles without allocating untouched tiles. */
  writePixels(left: number, top: number, width: number, height: number, pixels: Uint8ClampedArray): void {
    this.#assertOpen(); if (![left, top, width, height].every(Number.isSafeInteger) || left < 0 || top < 0 || width < 1 || height < 1 || left + width > this.asset.width || top + height > this.asset.height) throw new RangeError("Bulk pixel bounds must be positive integers within raster bounds"); if (pixels.byteLength !== width * height * RGBA8_STRAIGHT.bytesPerPixel) throw new RangeError("Bulk RGBA8 buffer length does not match bounds");
    for (let row = 0; row < height; row += 1) {
      let sourceX = 0;
      while (sourceX < width) {
        const targetX = left + sourceX, targetY = top + row; const coordinate = { x: Math.floor(targetX / RASTER_TILE_SIZE), y: Math.floor(targetY / RASTER_TILE_SIZE) }; const tile = this.#touch(coordinate); const localX = targetX % RASTER_TILE_SIZE, localY = targetY % RASTER_TILE_SIZE; const count = Math.min(width - sourceX, RASTER_TILE_SIZE - localX); const sourceOffset = (row * width + sourceX) * RGBA8_STRAIGHT.bytesPerPixel; const targetOffset = (localY * RASTER_TILE_SIZE + localX) * RGBA8_STRAIGHT.bytesPerPixel;
        tile.pixels.set(pixels.subarray(sourceOffset, sourceOffset + count * RGBA8_STRAIGHT.bytesPerPixel), targetOffset); sourceX += count;
      }
    }
    this.#bounds = union(this.#bounds, left, top, left + width, top + height);
  }
  /** Controlled tile access: the callback receives transaction-private, full-size tile storage. */
  mutateTile(coordinate: RasterTileCoordinate, mutate: (tile: { readonly width: number; readonly height: number; readonly pixels: Uint8ClampedArray }) => void): void { this.#assertOpen(); const tile = this.#touch(coordinate); const info = this.asset.tileInfo(coordinate); mutate({ width: info.width, height: info.height, pixels: tile.pixels }); this.#bounds = union(this.#bounds, coordinate.x * RASTER_TILE_SIZE, coordinate.y * RASTER_TILE_SIZE, coordinate.x * RASTER_TILE_SIZE + info.width, coordinate.y * RASTER_TILE_SIZE + info.height); }
  commit(): RasterMutationResult | undefined { this.#assertOpen(); this.#closed = true; const result = this.asset.commitWorkingTiles(this.#working, this.#bounds); if (result) this.onCommit?.(result); return result; }
  rollback(): void { this.#closed = true; this.#working.clear(); this.#bounds = undefined; }
  #touch(coordinate: RasterTileCoordinate): WorkingTile { const id = key(coordinate); let tile = this.#working.get(id); if (!tile) { tile = this.asset.createWorkingTile(coordinate); this.#working.set(id, tile); } return tile; }
  #assertOpen(): void { if (this.#closed) throw new Error("Raster mutation transaction is closed"); }
  #assertPixelCoordinate(x: number, y: number): void { this.asset.assertPixelCoordinate(x, y); }
}

/** Multi-asset owner. Removal is explicit; documents retain only lightweight asset IDs and must be reconciled by their owner. */
export class RasterStore {
  readonly #assets = new Map<RasterAssetId, RasterAsset>();
  readonly #listeners = new Set<(result: RasterMutationResult) => void>();
  readonly #assetListeners = new Set<(assetId: RasterAssetId) => void>();
  create(descriptor: RasterAssetDescriptor): RasterAsset { if (!descriptor.id.trim()) throw new Error("Raster asset ID is required"); if (this.#assets.has(descriptor.id)) throw new Error(`Raster asset already exists: ${descriptor.id}`); if (!Number.isSafeInteger(descriptor.width) || !Number.isSafeInteger(descriptor.height) || descriptor.width < 1 || descriptor.height < 1) throw new RangeError("Raster asset dimensions must be positive safe integers"); if (descriptor.format && (descriptor.format.id !== RGBA8_STRAIGHT.id || descriptor.format.channels !== RGBA8_STRAIGHT.channels || descriptor.format.bytesPerPixel !== RGBA8_STRAIGHT.bytesPerPixel || descriptor.format.alpha !== RGBA8_STRAIGHT.alpha || descriptor.format.rowOrder !== RGBA8_STRAIGHT.rowOrder)) throw new Error("Unsupported raster pixel format"); const asset = new RasterAsset(descriptor.id, descriptor.width, descriptor.height, descriptor.format ?? RGBA8_STRAIGHT); this.#assets.set(asset.id, asset); return asset; }
  get(id: RasterAssetId): RasterAsset | undefined { return this.#assets.get(id); }
  remove(id: RasterAssetId): RasterAsset | undefined { const asset = this.#assets.get(id); if (asset) { this.#assets.delete(id); this.#assetListeners.forEach(listener => listener(id)); } return asset; }
  beginMutation(id: RasterAssetId): RasterMutationTransaction { const asset = this.get(id); if (!asset) throw new Error(`Unknown raster asset: ${id}`); return new RasterMutationTransaction(asset, result => { this.#listeners.forEach(listener => listener(result)); this.#assetListeners.forEach(listener => listener(result.assetId)); }); }
  subscribe(listener: (result: RasterMutationResult) => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }
  subscribeAssetChanges(listener: (assetId: RasterAssetId) => void): () => void { this.#assetListeners.add(listener); return () => this.#assetListeners.delete(listener); }
  get assetCount(): number { return this.#assets.size; }
  get allocatedBytes(): number { return [...this.#assets.values()].reduce((total, asset) => total + asset.allocatedBytes, 0); }
  dispose(): void { const ids = [...this.#assets.keys()]; this.#assets.clear(); ids.forEach(id => this.#assetListeners.forEach(listener => listener(id))); this.#listeners.clear(); this.#assetListeners.clear(); }
}
