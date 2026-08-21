import { CropDocumentCommand, CreateRasterLayerCommand, RasterStore, SetTransformCommand, createDocument, RASTER_TILE_SIZE } from "../src/core";
import { RasterStoreSourceResolver } from "../src/renderer";
import { describe, expect, it } from "vitest";

describe("mutable tiled raster storage", () => {
  it("validates assets, supports multiple identities, and keeps 16K transparent rasters lazy", () => {
    const store = new RasterStore(); const first = store.create({ id: "first", width: 16_000, height: 16_000 }); store.create({ id: "second", width: 1, height: 1 });
    expect(first.info).toMatchObject({ tileSize: RASTER_TILE_SIZE, tileColumns: 63, tileRows: 63, allocatedTileCount: 0, allocatedBytes: 0, revision: 0 }); expect(store.assetCount).toBe(2); expect(store.allocatedBytes).toBe(0); expect(first.readPixel(15_999, 15_999)).toEqual([0, 0, 0, 0]);
    const transaction = store.beginMutation("first"); transaction.writePixel(15_999, 15_999, [1, 2, 3, 4]); const result = transaction.commit();
    expect(result).toMatchObject({ revision: 1, dirtyTiles: [{ x: 62, y: 62, width: 128, height: 128, previousRevision: 0, revision: 1 }] }); expect(first.readPixel(15_999, 15_999)).toEqual([1, 2, 3, 4]); expect(first.allocatedTileCount).toBe(1); expect(first.allocatedBytes).toBe(RASTER_TILE_SIZE * RASTER_TILE_SIZE * 4);
    expect(() => store.create({ id: "first", width: 1, height: 1 })).toThrow("already exists"); expect(() => store.create({ id: "bad", width: 1.5, height: 1 })).toThrow("safe integers"); expect(() => store.create({ id: "format", width: 1, height: 1, format: { id: "other" } as never })).toThrow("Unsupported");
  });

  it("maps tile boundaries and partial edge tiles deterministically", () => {
    const store = new RasterStore(); const asset = store.create({ id: "edges", width: 1000, height: 700 }); const mutation = store.beginMutation("edges");
    mutation.writePixel(0, 0, [1, 0, 0, 255]); mutation.writePixel(255, 0, [2, 0, 0, 255]); mutation.writePixel(256, 0, [3, 0, 0, 255]); mutation.writePixel(999, 699, [4, 0, 0, 255]); const result = mutation.commit()!;
    expect(result.dirtyTiles).toEqual([{ x: 0, y: 0, width: 256, height: 256, previousRevision: 0, revision: 1 }, { x: 1, y: 0, width: 256, height: 256, previousRevision: 0, revision: 1 }, { x: 3, y: 2, width: 232, height: 188, previousRevision: 0, revision: 1 }]); expect(result.dirtyBounds).toEqual({ left: 0, top: 0, right: 1000, bottom: 700 });
    expect(asset.tileInfo({ x: 3, y: 2 })).toMatchObject({ width: 232, height: 188, allocated: true, revision: 1 }); expect(asset.readPixel(0, 0)).toEqual([1, 0, 0, 255]); expect(asset.readPixel(255, 0)).toEqual([2, 0, 0, 255]); expect(asset.readPixel(256, 0)).toEqual([3, 0, 0, 255]); expect(asset.readPixel(999, 699)).toEqual([4, 0, 0, 255]);
    expect(() => asset.readPixel(1000, 0)).toThrow("within raster bounds"); expect(() => store.beginMutation("edges").writePixel(Number.NaN, 0, [0, 0, 0, 0])).toThrow("within raster bounds"); expect(() => asset.tileInfo({ x: 4, y: 0 })).toThrow("within raster bounds");
  });

  it("publishes one asset revision per atomic transaction, records before-state, and leaves rollbacks/no-ops unpublished", () => {
    const store = new RasterStore(); const asset = store.create({ id: "atomic", width: 300, height: 300 }); const published: number[] = []; store.subscribe(result => published.push(result.revision));
    const abandoned = store.beginMutation("atomic"); abandoned.writePixel(1, 1, [9, 9, 9, 9]); abandoned.rollback(); expect(asset.readPixel(1, 1)).toEqual([0, 0, 0, 0]); expect(asset.revision).toBe(0); expect(published).toEqual([]); expect(store.beginMutation("atomic").commit()).toBeUndefined();
    const first = store.beginMutation("atomic"); first.writePixel(1, 1, [10, 20, 30, 40]); first.writePixel(257, 257, [50, 60, 70, 80]); const committed = first.commit()!;
    expect(committed).toMatchObject({ previousRevision: 0, revision: 1, dirtyTiles: [{ x: 0, y: 0, previousRevision: 0, revision: 1 }, { x: 1, y: 1, previousRevision: 0, revision: 1 }], beforeTiles: [{ x: 0, y: 0, pixels: undefined }, { x: 1, y: 1, pixels: undefined }] }); expect(published).toEqual([1]);
    const second = store.beginMutation("atomic"); second.writePixel(1, 1, [1, 2, 3, 4]); const revised = second.commit()!; expect(revised).toMatchObject({ previousRevision: 1, revision: 2, dirtyTiles: [{ x: 0, y: 0, previousRevision: 1, revision: 2 }] }); const offset = (RASTER_TILE_SIZE + 1) * 4; expect(revised.beforeTiles[0]?.pixels?.slice(offset, offset + 4)).toEqual(new Uint8ClampedArray([10, 20, 30, 40])); expect(asset.readPixel(1, 1)).toEqual([1, 2, 3, 4]);
  });

  it("provides bulk/tile mutation without exposing persistent write access", () => {
    const store = new RasterStore(); const asset = store.create({ id: "bulk", width: 258, height: 2 }); const pixels = new Uint8ClampedArray(258 * 2 * 4); pixels.set([9, 8, 7, 6], (257 * 2 + 1) * 4);
    const mutation = store.beginMutation("bulk"); mutation.writePixels(0, 0, 258, 2, pixels); mutation.mutateTile({ x: 0, y: 0 }, tile => { expect(tile).toMatchObject({ width: 256, height: 2 }); tile.pixels[0] = 5; }); mutation.commit();
    expect(asset.readPixel(0, 0)).toEqual([5, 0, 0, 0]); expect(asset.readPixel(257, 1)).toEqual([9, 8, 7, 6]); expect(asset.allocatedTileCount).toBe(2);
  });

  it("resolves tiled assets for future renderers without materializing large assets, while keeping small-asset compatibility", () => {
    const store = new RasterStore(); store.create({ id: "small", width: 3, height: 2 }); store.create({ id: "large", width: 512, height: 256 }); const resolver = new RasterStoreSourceResolver(store); const updates: string[] = []; const stop = resolver.subscribe(id => updates.push(id));
    const mutation = store.beginMutation("small"); mutation.writePixel(2, 1, [12, 34, 56, 78]); mutation.commit(); const reference = (sourceId: string) => ({ kind: "raster-reference" as const, sourceId, storage: "tiled" as const });
    expect(resolver.resolve(reference("small"))).toMatchObject({ id: "small", revision: 1, width: 3, height: 2 }); expect(Array.from(resolver.resolve(reference("small"))!.pixels.slice(20, 24))).toEqual([12, 34, 56, 78]); expect(resolver.resolve(reference("large"))).toBeUndefined(); expect(resolver.describe!(reference("large"))).toMatchObject({ tileSize: 256, tileColumns: 2, tileRows: 1 }); expect(resolver.resolveTile!(reference("large"), 1, 0)).toMatchObject({ allocated: false, width: 256, height: 256, pixels: undefined });
    store.remove("small"); expect(updates).toEqual(["small", "small"]); stop(); resolver.dispose();
  });

  it("keeps Move, Transform, and Crop metadata-only for RasterStore-backed layers", () => {
    const store = new RasterStore(); const asset = store.create({ id: "editable", width: 300, height: 300 }); const seeded = store.beginMutation("editable"); seeded.writePixel(10, 10, [255, 0, 0, 255]); seeded.commit(); const revision = asset.revision;
    const document = createDocument("doc", "Document", 200, 200); new CreateRasterLayerCommand("layer", "Layer", {}, null, undefined, { kind: "raster-reference", sourceId: "editable", storage: "tiled" }).execute(document); new SetTransformCommand("layer", { position: { x: 20, y: 30 }, scale: { x: 2, y: 2 }, rotation: 15 }).execute(document); new CropDocumentCommand({ left: 10, top: 10, width: 100, height: 100 }).execute(document);
    expect(asset.revision).toBe(revision); expect(asset.readPixel(10, 10)).toEqual([255, 0, 0, 255]); expect(document.layerTree.find("layer")?.transform.position).toEqual({ x: 10, y: 20 });
  });
});
