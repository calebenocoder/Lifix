import { describe, expect, it } from "vitest";
import { createDocument, createGroupLayer, createRasterLayer } from "../src/core";
import { calculateRenderNodeBounds, createRenderInput, createRenderPlan, createSolidRasterSource, InMemoryRasterSourceResolver, RasterResourceCache, transformPoint } from "../src/renderer";

const raster = (id: string, options = {}) => createRasterLayer(id, id, options, { kind: "raster-reference", sourceId: id, storage: "lazy" });

describe("render plan", () => {
  it("preserves root stacking order from bottom to top", () => {
    const document = createDocument("doc", "Document", 100, 100); document.layerTree.add(raster("bottom")); document.layerTree.add(raster("middle")); document.layerTree.add(raster("top"));
    expect(createRenderPlan(createRenderInput(document)).layers.map(layer => layer.layerId)).toEqual(["bottom", "middle", "top"]);
  });

  it("preserves transforms while isolating nested group opacity exactly once", () => {
    const document = createDocument("doc", "Document", 100, 100); document.layerTree.add(createGroupLayer("group", "Group", { opacity: 0.5, transform: { position: { x: 10, y: 20 }, scale: { x: 2, y: 2 }, rotation: 0 } })); document.layerTree.add(createGroupLayer("nested", "Nested", { opacity: 0.5, transform: { position: { x: 5, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 } }), "group"); document.layerTree.add(raster("leaf", { opacity: 0.5, transform: { position: { x: 4, y: 3 }, scale: { x: 1, y: 1 }, rotation: 0 } }), "nested");
    const plan = createRenderPlan(createRenderInput(document)); const layer = plan.layers[0]; const outer = plan.nodes[0];
    expect(layer.opacity).toBe(0.5); expect(layer.transform).toMatchObject({ a: 2, d: 2, e: 28, f: 26 }); expect(outer).toMatchObject({ kind: "group", mode: "isolated", opacity: 0.5, children: [{ kind: "group", mode: "isolated", opacity: 0.5 }] });
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

  it("composes nested rotation, non-uniform scale, and negative child scale", () => {
    const document = createDocument("doc", "Document", 100, 100); document.layerTree.add(createGroupLayer("group", "Group", { transform: { position: { x: 10, y: 20 }, scale: { x: 2, y: 1 }, rotation: 90 } })); document.layerTree.add(raster("mirrored", { transform: { position: { x: 3, y: 4 }, scale: { x: -1, y: 2 }, rotation: 0 } }), "group"); const transform = createRenderPlan(createRenderInput(document)).layers[0].transform;
    expect(transformPoint(transform, { x: 0, y: 0 })).toEqual({ x: 6, y: 26 }); expect(transformPoint(transform, { x: 1, y: 1 }).x).toBeCloseTo(4); expect(transformPoint(transform, { x: 1, y: 1 }).y).toBeCloseTo(24);
  });

  it("keeps all Core blend modes explicit in the compositing tree", () => {
    const document = createDocument("doc", "Document", 100, 100); document.layerTree.add(raster("multiply", { blendMode: "multiply" }));
    expect(createRenderPlan(createRenderInput(document))).toMatchObject({ nodes: [{ kind: "raster", layerId: "multiply", blendMode: "multiply" }], skipped: [] });
  });

  it("distinguishes pass-through, requested isolation, and isolation forced by group properties", () => { const document = createDocument("doc", "Document", 100, 100); document.layerTree.add(createGroupLayer("pass", "Pass")); document.layerTree.add(raster("pass-child"), "pass"); document.layerTree.add(createGroupLayer("isolated", "Isolated", { compositing: "isolated" })); document.layerTree.add(raster("isolated-child"), "isolated"); document.layerTree.add(createGroupLayer("opacity", "Opacity", { opacity: 0.5 })); document.layerTree.add(raster("opacity-child"), "opacity"); document.layerTree.add(createGroupLayer("blend", "Blend", { blendMode: "screen" })); document.layerTree.add(raster("blend-child"), "blend"); expect(createRenderPlan(createRenderInput(document)).nodes).toMatchObject([{ layerId: "pass", requestedMode: "pass-through", mode: "pass-through" }, { layerId: "isolated", requestedMode: "isolated", mode: "isolated" }, { layerId: "opacity", requestedMode: "pass-through", mode: "isolated", opacity: 0.5 }, { layerId: "blend", requestedMode: "pass-through", mode: "isolated", blendMode: "screen" }]); });

  it("keeps nested pass-through and isolated groups deterministic", () => { const document = createDocument("doc", "Document", 100, 100); document.layerTree.add(createGroupLayer("pass-parent", "Pass parent")); document.layerTree.add(createGroupLayer("isolated-child", "Isolated child", { compositing: "isolated" }), "pass-parent"); document.layerTree.add(raster("first", { blendMode: "multiply" }), "isolated-child"); document.layerTree.add(createGroupLayer("isolated-parent", "Isolated parent", { compositing: "isolated" })); document.layerTree.add(createGroupLayer("pass-child", "Pass child"), "isolated-parent"); document.layerTree.add(raster("second", { blendMode: "screen" }), "pass-child"); const plan = createRenderPlan(createRenderInput(document)); expect(plan.nodes).toMatchObject([{ layerId: "pass-parent", mode: "pass-through", children: [{ layerId: "isolated-child", mode: "isolated", children: [{ layerId: "first", blendMode: "multiply" }] }] }, { layerId: "isolated-parent", mode: "isolated", children: [{ layerId: "pass-child", mode: "pass-through", children: [{ layerId: "second", blendMode: "screen" }] }] }]); expect(plan.layers.map(layer => layer.layerId)).toEqual(["first", "second"]); });

  it("calculates conservative transformed bounds for isolated groups", () => { const document = createDocument("doc", "Document", 100, 100); document.layerTree.add(createGroupLayer("group", "Group", { compositing: "isolated", transform: { position: { x: 20, y: 30 }, scale: { x: 1, y: 1 }, rotation: 0 } })); document.layerTree.add(raster("rotated", { transform: { position: { x: 10, y: 0 }, scale: { x: 2, y: 1 }, rotation: 90 } }), "group"); const node = createRenderPlan(createRenderInput(document)).nodes[0]; expect(calculateRenderNodeBounds(node, () => ({ width: 10, height: 20 }))).toMatchObject({ x: 10, y: 30, width: 20, height: 20 }); });

  it("reuses raster resources by source identity and refreshes on revision", () => {
    const resolver = new InMemoryRasterSourceResolver([createSolidRasterSource("source", 10, 10, [1, 2, 3, 255])]); let created = 0; const cache = new RasterResourceCache(resolver, source => ({ source, sequence: ++created })); const reference = { kind: "raster-reference" as const, sourceId: "source", storage: "lazy" as const };
    expect(cache.get(reference)).toMatchObject({ sequence: 1 }); expect(cache.get(reference)).toMatchObject({ sequence: 1 }); resolver.set(createSolidRasterSource("source", 10, 10, [1, 2, 3, 255], 1)); expect(cache.get(reference)).toMatchObject({ sequence: 2 }); cache.invalidate("source"); expect(cache.get(reference)).toMatchObject({ sequence: 3 });
  });
});
