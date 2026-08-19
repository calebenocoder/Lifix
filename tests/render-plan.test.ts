import { describe, expect, it } from "vitest";
import { createDocument, createGroupLayer, createRasterLayer } from "../src/core";
import { createRenderInput, createRenderPlan, createSolidRasterSource, InMemoryRasterSourceResolver, RasterResourceCache } from "../src/renderer";

const raster = (id: string, options = {}) => createRasterLayer(id, id, options, { kind: "raster-reference", sourceId: id, storage: "lazy" });

describe("render plan", () => {
  it("preserves root stacking order from bottom to top", () => {
    const document = createDocument("doc", "Document", 100, 100); document.layerTree.add(raster("bottom")); document.layerTree.add(raster("middle")); document.layerTree.add(raster("top"));
    expect(createRenderPlan(createRenderInput(document)).layers.map(layer => layer.layerId)).toEqual(["bottom", "middle", "top"]);
  });

  it("resolves nested groups with inherited transform and opacity", () => {
    const document = createDocument("doc", "Document", 100, 100); document.layerTree.add(createGroupLayer("group", "Group", { opacity: 0.5, transform: { position: { x: 10, y: 20 }, scale: { x: 2, y: 2 }, rotation: 0 } })); document.layerTree.add(createGroupLayer("nested", "Nested", { opacity: 0.5, transform: { position: { x: 5, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 } }), "group"); document.layerTree.add(raster("leaf", { opacity: 0.5, transform: { position: { x: 4, y: 3 }, scale: { x: 1, y: 1 }, rotation: 0 } }), "nested");
    const layer = createRenderPlan(createRenderInput(document)).layers[0];
    expect(layer.opacity).toBe(0.125); expect(layer.transform).toMatchObject({ a: 2, d: 2, e: 28, f: 26 });
  });

  it("suppresses hidden groups and hidden layers while retaining deterministic skipped reasons", () => {
    const document = createDocument("doc", "Document", 100, 100); document.layerTree.add(createGroupLayer("hidden-group", "Group", { visible: false })); document.layerTree.add(raster("inside"), "hidden-group"); document.layerTree.add(raster("hidden-layer", { visible: false })); document.layerTree.add(raster("transparent", { opacity: 0 }));
    const plan = createRenderPlan(createRenderInput(document));
    expect(plan.layers).toEqual([]); expect(plan.skipped).toEqual([{ layerId: "inside", reason: "hidden" }, { layerId: "hidden-layer", reason: "hidden" }, { layerId: "transparent", reason: "transparent" }]);
  });

  it("maps position, scale, and rotation into one shared affine transform", () => {
    const document = createDocument("doc", "Document", 100, 100); document.layerTree.add(raster("rotated", { transform: { position: { x: 10, y: 20 }, scale: { x: 2, y: 3 }, rotation: 90 } }));
    const transform = createRenderPlan(createRenderInput(document)).layers[0].transform; expect(transform.a).toBeCloseTo(0); expect(transform.b).toBeCloseTo(2); expect(transform.c).toBeCloseTo(-3); expect(transform.d).toBeCloseTo(0); expect(transform.e).toBe(10); expect(transform.f).toBe(20);
  });

  it("keeps unsupported blend modes explicit instead of treating them as normal", () => {
    const document = createDocument("doc", "Document", 100, 100); document.layerTree.add(raster("multiply", { blendMode: "multiply" }));
    expect(createRenderPlan(createRenderInput(document))).toMatchObject({ layers: [], skipped: [{ layerId: "multiply", reason: "unsupported-blend-mode" }] });
  });

  it("reuses raster resources by source identity and refreshes on revision", () => {
    const resolver = new InMemoryRasterSourceResolver([createSolidRasterSource("source", 10, 10, [1, 2, 3, 255])]); let created = 0; const cache = new RasterResourceCache(resolver, source => ({ source, sequence: ++created })); const reference = { kind: "raster-reference" as const, sourceId: "source", storage: "lazy" as const };
    expect(cache.get(reference)).toMatchObject({ sequence: 1 }); expect(cache.get(reference)).toMatchObject({ sequence: 1 }); resolver.set(createSolidRasterSource("source", 10, 10, [1, 2, 3, 255], 1)); expect(cache.get(reference)).toMatchObject({ sequence: 2 }); cache.invalidate("source"); expect(cache.get(reference)).toMatchObject({ sequence: 3 });
  });
});
