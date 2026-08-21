import { RASTER_TILE_SIZE, RasterStore, beginBrushStroke, type RoundBrushPreset } from "../src/core";
import { RasterStoreSourceResolver, RasterTileResourceCache } from "../src/renderer";
import { describe, expect, it } from "vitest";

const brush = (overrides: Partial<RoundBrushPreset> = {}): RoundBrushPreset => ({ diameter: 8, hardness: 1, opacity: 1, flow: 1, spacing: 0.25, color: { r: 255, g: 0, b: 0, a: 255 }, ...overrides });
const asset = (width = 64, height = 64) => { const store = new RasterStore(); store.create({ id: "paint", width, height }); return store; };

describe("platform-independent brush stroke engine", () => {
  it("places an initial anti-aliased round dab with deterministic hard and soft coverage", () => {
    const hard = asset(); const stroke = beginBrushStroke(hard, { assetId: "paint" }, brush({ diameter: 8, hardness: 1 })); stroke.addSample({ x: 16.5, y: 16.5, pressure: 1 }); const result = stroke.finish(); expect(result).toMatchObject({ sampleCount: 1, dabCount: 1, changed: true, revision: 1 }); expect(hard.get("paint")!.readPixel(16, 16)).toEqual([255, 0, 0, 255]); expect(hard.get("paint")!.readPixel(20, 16)[3]).toBeGreaterThan(0); expect(hard.get("paint")!.readPixel(21, 16)).toEqual([0, 0, 0, 0]);
    const soft = asset(); const softStroke = beginBrushStroke(soft, { assetId: "paint" }, brush({ diameter: 8, hardness: 0 })); softStroke.addSample({ x: 16.25, y: 16.75, pressure: 1 }); softStroke.finish(); expect(soft.get("paint")!.readPixel(16, 16)[3]).toBeGreaterThan(soft.get("paint")!.readPixel(19, 16)[3]); expect(soft.get("paint")!.readPixel(19, 16)[3]).toBeGreaterThan(0);
  });

  it("interpolates distance-based dabs consistently across sparse and dense samples", () => {
    const paint = (samples: readonly { x: number; y: number; pressure: number }[]) => { const store = asset(); const stroke = beginBrushStroke(store, { assetId: "paint" }, brush({ diameter: 4, spacing: 0.5 })); samples.forEach(sample => stroke.addSample(sample)); const result = stroke.finish(); return { bytes: Array.from(store.get("paint")!.resolveTile({ x: 0, y: 0 }).pixels!), result }; };
    const sparse = paint([{ x: 4, y: 16, pressure: 1 }, { x: 52, y: 16, pressure: 1 }]); const dense = paint(Array.from({ length: 25 }, (_, index) => ({ x: 4 + index * 2, y: 16, pressure: 1 }))); expect(dense.bytes).toEqual(sparse.bytes); expect(sparse.result.dabCount).toBe(25);
  });

  it("interpolates pressure and applies straight-alpha source-over blending", () => {
    const store = asset(); const stroke = beginBrushStroke(store, { assetId: "paint" }, brush({ diameter: 4, spacing: 1, opacity: 1, flow: 1, color: { r: 200, g: 100, b: 50, a: 128 }, pressure: { opacity: 1 } })); stroke.addSample({ x: 8.5, y: 8.5, pressure: 0 }); stroke.addSample({ x: 16.5, y: 8.5, pressure: 1 }); stroke.finish(); const target = store.get("paint")!; expect(target.readPixel(8, 8)).toEqual([0, 0, 0, 0]); expect(target.readPixel(16, 8)).toEqual([200, 100, 50, 128]);
    const repeat = beginBrushStroke(store, { assetId: "paint" }, brush({ diameter: 4, opacity: 0.5, flow: 1, color: { r: 0, g: 0, b: 255, a: 255 } })); repeat.addSample({ x: 16.5, y: 8.5, pressure: 1 }); repeat.finish(); expect(target.readPixel(16, 8)).toEqual([67, 33, 186, 192]);
  });

  it("clips ordinary outside samples, supports large dabs, and touches only needed sparse tiles", () => {
    const clipped = asset(10, 10); const edge = beginBrushStroke(clipped, { assetId: "paint" }, brush({ diameter: 20 })); edge.addSample({ x: -2, y: -2, pressure: 1 }); expect(edge.finish().changed).toBe(true); expect(clipped.get("paint")!.allocatedTileCount).toBe(1);
    const large = asset(1024, 1024); const wide = beginBrushStroke(large, { assetId: "paint" }, brush({ diameter: 600 })); wide.addSample({ x: 512, y: 512, pressure: 1 }); const result = wide.finish(); expect(result.dirtyTiles.length).toBeGreaterThan(4); expect(large.get("paint")!.allocatedTileCount).toBe(result.dirtyTiles.length);
    const sparse = asset(16_000, 16_000); const distant = beginBrushStroke(sparse, { assetId: "paint" }, brush({ diameter: 4 })); distant.addSample({ x: 12_000.5, y: 12_000.5, pressure: 1 }); distant.finish(); expect(sparse.get("paint")!.allocatedTileCount).toBe(1);
  });

  it("crosses tile boundaries as one transaction and publishes only affected tiles", () => {
    const store = asset(RASTER_TILE_SIZE * 2, RASTER_TILE_SIZE * 2); const events: number[] = []; store.subscribe(result => events.push(result.revision)); const stroke = beginBrushStroke(store, { assetId: "paint" }, brush({ diameter: 8 })); stroke.addSample({ x: 255.5, y: 255.5, pressure: 1 }); const result = stroke.finish(); expect(result.dirtyTiles.map(tile => [tile.x, tile.y])).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]); expect(events).toEqual([1]); expect(store.get("paint")!.revision).toBe(1);
  });

  it("cancels staged dabs and avoids no-op publications", () => {
    const store = asset(); const events: number[] = []; store.subscribe(result => events.push(result.revision)); const cancelled = beginBrushStroke(store, { assetId: "paint" }, brush()); cancelled.addSample({ x: 12, y: 12, pressure: 1 }); cancelled.addSample({ x: 24, y: 12, pressure: 1 }); expect(cancelled.cancel()).toMatchObject({ changed: false }); expect(store.get("paint")!.revision).toBe(0); expect(store.get("paint")!.allocatedTileCount).toBe(0); expect(events).toEqual([]);
    const transparent = beginBrushStroke(store, { assetId: "paint" }, brush({ opacity: 0 })); transparent.addSample({ x: 12, y: 12, pressure: 1 }); expect(transparent.finish()).toMatchObject({ changed: false, dirtyTiles: [] }); expect(store.get("paint")!.revision).toBe(0);
  });

  it("publishes stroke dirtiness through the existing tile-cache bridge", () => {
    const store = asset(RASTER_TILE_SIZE * 2, RASTER_TILE_SIZE); const resolver = new RasterStoreSourceResolver(store); let created = 0; const cache = new RasterTileResourceCache(resolver, source => ({ id: source.id, revision: ++created })); const stop = resolver.subscribeTiles(change => cache.invalidate(change.sourceId, change.tiles)); const reference = { kind: "raster-reference" as const, sourceId: "paint", storage: "tiled" as const };
    const first = beginBrushStroke(store, { assetId: "paint" }, brush({ diameter: 8 })); first.addSample({ x: 32, y: 32, pressure: 1 }); first.finish(); const initial = cache.visibleTiles(reference, { minX: 0, minY: 0, maxX: 1, maxY: 0 }); const resource = cache.get(initial[0]!);
    const update = beginBrushStroke(store, { assetId: "paint" }, brush({ diameter: 8 })); update.addSample({ x: 34, y: 32, pressure: 1 }); expect(update.finish().dirtyTiles.map(tile => [tile.x, tile.y])).toEqual([[0, 0]]); const refreshed = cache.visibleTiles(reference, { minX: 0, minY: 0, maxX: 1, maxY: 0 }); expect(cache.get(refreshed[0]!)).not.toBe(resource); expect(created).toBe(2); stop(); resolver.dispose(); cache.dispose();
  });
});
