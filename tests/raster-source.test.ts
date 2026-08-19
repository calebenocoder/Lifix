import { describe, expect, it } from "vitest";
import { createDocument, createRasterLayer } from "../src/core";
import { calculateTextureUploadLayout, createRenderInput, createRgba8RasterSource, createSolidRasterSource, expectedRasterByteLength, InMemoryRasterSourceResolver, prepareTextureUpload, rasterUvForVertex, RasterResourceCache, RGBA8_UNORM, validateRasterSource } from "../src/renderer";

describe("raster source foundation", () => {
  it("validates arbitrary RGBA8 source dimensions and exact buffer length", () => {
    const source = createRgba8RasterSource("odd", 17, 9, new Uint8ClampedArray(17 * 9 * 4)); expect(source).toMatchObject({ id: "odd", revision: 0, width: 17, height: 9, format: { id: "rgba8unorm", alpha: "straight", rowOrder: "top-to-bottom" } }); expect(expectedRasterByteLength(17, 9)).toBe(612);
    expect(() => createRgba8RasterSource("bad", 3, 5, new Uint8ClampedArray(59))).toThrow("requires 60 bytes"); expect(() => createRgba8RasterSource("bad", 0, 1, new Uint8ClampedArray())).toThrow("positive safe integers");
  });

  it("rejects unsupported formats through a structured error", () => {
    const source = { id: "unsupported", revision: 0, width: 1, height: 1, pixels: new Uint8ClampedArray(4), format: { ...RGBA8_UNORM, id: "rgba16float", componentType: "float" as const } };
    try { validateRasterSource(source); throw new Error("expected validation failure"); } catch (error) { expect(error).toMatchObject({ code: "unsupported-format", sourceId: "unsupported" }); }
  });

  it("pads odd and non-square rows to WebGPU alignment without changing row order", () => {
    const pixels = new Uint8ClampedArray(3 * 5 * 4); for (let index = 0; index < pixels.length; index += 1) pixels[index] = index; const upload = prepareTextureUpload(createRgba8RasterSource("3x5", 3, 5, pixels), 256, "straight");
    expect(upload.layout).toEqual({ width: 3, height: 5, unpaddedBytesPerRow: 12, bytesPerRow: 256, rowsPerImage: 5, byteLength: 1280 }); expect(Array.from(upload.data.slice(0, 12))).toEqual(Array.from(pixels.slice(0, 12))); expect(Array.from(upload.data.slice(256, 268))).toEqual(Array.from(pixels.slice(12, 24)));
    expect(calculateTextureUploadLayout(256, 128)).toMatchObject({ unpaddedBytesPerRow: 1024, bytesPerRow: 1024, rowsPerImage: 128 });
  });

  it("reuses an already aligned source buffer without copying", () => {
    const source = createSolidRasterSource("aligned", 64, 2, [1, 2, 3, 4]); expect(prepareTextureUpload(source, 256, "straight").data).toBe(source.pixels);
  });

  it("premultiplies straight-alpha pixels for halo-safe GPU filtering", () => {
    const source = createRgba8RasterSource("alpha", 1, 1, new Uint8ClampedArray([255, 128, 64, 128])); const upload = prepareTextureUpload(source); expect(upload.alpha).toBe("premultiplied"); expect(Array.from(upload.data.slice(0, 4))).toEqual([128, 64, 32, 128]);
  });

  it("defines full-raster top-left UV coordinates without a vertical flip", () => {
    expect(rasterUvForVertex(0)).toEqual({ x: 0, y: 0, u: 0, v: 0 }); expect(rasterUvForVertex(5)).toEqual({ x: 1, y: 1, u: 1, v: 1 }); expect(() => rasterUvForVertex(6)).toThrow("between 0 and 5");
  });

  it("reuses, replaces, invalidates, and disposes cached resources by ID and revision", () => {
    const resolver = new InMemoryRasterSourceResolver([createSolidRasterSource("source", 1, 1, [1, 2, 3, 128])]); let created = 0; const destroyed: number[] = []; const cache = new RasterResourceCache(resolver, () => ++created, resource => destroyed.push(resource)); const reference = { kind: "raster-reference" as const, sourceId: "source", storage: "lazy" as const };
    expect(cache.get(reference)).toBe(1); expect(cache.get(reference)).toBe(1); resolver.set(createSolidRasterSource("source", 1, 1, [4, 5, 6, 128], 1)); expect(cache.get(reference)).toBe(2); expect(destroyed).toEqual([1]); cache.invalidate("source"); expect(destroyed).toEqual([1, 2]); expect(cache.size).toBe(0); expect(cache.get(reference)).toBe(3); cache.dispose(); expect(destroyed).toEqual([1, 2, 3]);
  });

  it("reports a missing source without throwing", () => {
    const cache = new RasterResourceCache(new InMemoryRasterSourceResolver(), source => source); expect(cache.get({ kind: "raster-reference", sourceId: "missing", storage: "lazy" })).toBeUndefined(); expect(cache.lastError).toMatchObject({ code: "missing-source", sourceId: "missing" });
  });

  it("releases resources no longer used by a completed render cycle", () => {
    const resolver = new InMemoryRasterSourceResolver([createSolidRasterSource("used", 1, 1, [0, 0, 0, 255]), createSolidRasterSource("removed", 1, 1, [0, 0, 0, 255])]); const destroyed: string[] = []; const cache = new RasterResourceCache(resolver, source => source.id, resource => destroyed.push(resource)); const reference = (sourceId: string) => ({ kind: "raster-reference" as const, sourceId, storage: "lazy" as const }); cache.get(reference("used")); cache.get(reference("removed")); cache.beginUsage(); cache.get(reference("used")); cache.endUsage(); expect(cache.size).toBe(1); expect(destroyed).toEqual(["removed"]);
  });

  it("keeps full pixel buffers outside the detached Core render snapshot", () => {
    const document = createDocument("doc", "Document", 10, 10); document.layerTree.add(createRasterLayer("layer", "Layer", {}, { kind: "raster-reference", sourceId: "large-source", storage: "lazy" })); const input = createRenderInput(document); expect(JSON.stringify(input)).not.toContain("pixels"); expect(input.layers.layer).toMatchObject({ raster: { sourceId: "large-source" } });
  });
});
