import { RasterStore } from "../src/core";
import { RasterStoreSourceResolver, RasterTileResourceCache, tileKey } from "../src/renderer";
import { describe, expect, it } from "vitest";

const reference = (sourceId: string) => ({ kind: "raster-reference" as const, sourceId, storage: "tiled" as const });

describe("tiled renderer bridge", () => {
  it("uses asset + tile coordinate + tile revision identity and refreshes only changed tiles", () => {
    const store = new RasterStore(); store.create({ id: "asset", width: 600, height: 400 });
    const seed = store.beginMutation("asset"); seed.writePixel(1, 1, [255, 0, 0, 255]); seed.writePixel(257, 1, [0, 255, 0, 255]); seed.writePixel(513, 257, [0, 0, 255, 255]); seed.commit();
    const resolver = new RasterStoreSourceResolver(store); let created = 0; const destroyed: string[] = []; const cache = new RasterTileResourceCache(resolver, source => ({ id: source.id, created: ++created }), resource => destroyed.push(resource.id)); const unsubscribe = resolver.subscribeTiles(change => cache.invalidate(change.sourceId, change.tiles));
    const initial = cache.visibleTiles(reference("asset"), { minX: 0, minY: 0, maxX: 2, maxY: 1 }); expect(initial.map(tile => [tile.x, tile.y, tile.width, tile.height])).toEqual([[0, 0, 256, 256], [1, 0, 256, 256], [2, 1, 88, 144]]);
    const first = cache.get(initial[0]!); const middle = cache.get(initial[1]!); const edge = cache.get(initial[2]!); expect([first?.id, middle?.id, edge?.id]).toEqual([tileKey("asset", 0, 0), tileKey("asset", 1, 0), tileKey("asset", 2, 1)]);
    const mutation = store.beginMutation("asset"); mutation.writePixel(257, 2, [20, 30, 40, 255]); const result = mutation.commit()!; expect(result.dirtyTiles).toHaveLength(1);
    const refreshed = cache.visibleTiles(reference("asset"), { minX: 0, minY: 0, maxX: 2, maxY: 1 }); expect(cache.get(refreshed[0]!)).toBe(first); expect(cache.get(refreshed[2]!)).toBe(edge); expect(cache.get(refreshed[1]!)).not.toBe(middle); expect(created).toBe(4); expect(destroyed).toEqual([tileKey("asset", 1, 0)]);
    unsubscribe(); resolver.dispose(); cache.dispose();
  });

  it("uses sparse allocation metadata instead of scanning a 16K logical grid", () => {
    const store = new RasterStore(); store.create({ id: "sparse", width: 16_000, height: 16_000 }); const mutation = store.beginMutation("sparse"); mutation.writePixel(0, 0, [1, 1, 1, 255]); mutation.writePixel(8_000, 8_000, [2, 2, 2, 255]); mutation.writePixel(15_999, 15_999, [3, 3, 3, 255]); mutation.commit();
    const resolver = new RasterStoreSourceResolver(store); const cache = new RasterTileResourceCache(resolver, source => source); const visible = cache.visibleTiles(reference("sparse"), { minX: 61, minY: 61, maxX: 62, maxY: 62 }); expect(visible.map(tile => [tile.x, tile.y])).toEqual([[62, 62]]); expect(cache.get(visible[0]!)?.width).toBe(128); expect(cache.size).toBe(1); resolver.dispose(); cache.dispose();
  });

  it("leaves unallocated tiles transparent and does not create backend resources for them", () => {
    const store = new RasterStore(); store.create({ id: "empty", width: 512, height: 512 }); const resolver = new RasterStoreSourceResolver(store); let created = 0; const cache = new RasterTileResourceCache(resolver, () => ++created);
    expect(cache.visibleTiles(reference("empty"), { minX: 0, minY: 0, maxX: 1, maxY: 1 })).toEqual([]); expect(created).toBe(0); expect(resolver.resolveTile!(reference("empty"), 1, 1)).toMatchObject({ allocated: false, pixels: undefined }); resolver.dispose(); cache.dispose();
  });
});
