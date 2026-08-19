import { describe, expect, it } from "vitest";
import { createDocument, createGroupLayer, createRasterLayer, identityTransform } from "../src/core";

describe("document model", () => {
  it("creates a document with dimensions, color, resolution, metadata, and an empty tree", () => {
    const document = createDocument("doc-1", "Untitled", 1920, 1080, { metadata: { author: "test" } });
    expect(document.width).toBe(1920);
    expect(document.height).toBe(1080);
    expect(document.color.profile).toBe("srgb");
    expect(document.resolution.x).toBe(72);
    expect(document.metadata.author).toBe("test");
    expect(document.layerTree.rootLayerIds).toEqual([]);
    expect(JSON.parse(JSON.stringify(document)).layerTree.layers).toEqual({});
  });

  it("creates raster layers with structural defaults and future raster storage", () => {
    const layer = createRasterLayer("layer-1", "Pixels");
    expect(layer.kind).toBe("raster");
    expect(layer.visible).toBe(true);
    expect(layer.opacity).toBe(1);
    expect(layer.blendMode).toBe("normal");
    expect(layer.transform).toEqual(identityTransform());
    expect(layer.raster.storage).toBe("tiled");
  });

  it("supports nested groups, lookup, parent lookup, traversal, removal, and reordering", () => {
    const tree = createDocument("doc-1", "Tree", 100, 100).layerTree;
    const groupA = createGroupLayer("group-a", "A");
    const groupB = createGroupLayer("group-b", "B");
    const layer1 = createRasterLayer("layer-1", "One");
    const layer2 = createRasterLayer("layer-2", "Two");
    tree.add(groupA);
    tree.add(groupB, groupA.id);
    tree.add(layer1, groupA.id);
    tree.add(layer2, groupB.id);

    expect(tree.find("layer-2")).toBe(layer2);
    expect(tree.findParent("layer-2")).toBe(groupB);
    expect(tree.traverse().map(layer => layer.id)).toEqual(["group-a", "group-b", "layer-2", "layer-1"]);

    tree.reorder("layer-1", 0);
    expect(groupA.childLayerIds).toEqual(["layer-1", "group-b"]);
    tree.move("layer-1", groupB.id);
    expect(tree.findParent("layer-1")).toBe(groupB);
    expect(groupB.childLayerIds).toEqual(["layer-2", "layer-1"]);
    tree.remove("group-b");
    expect(tree.find("layer-1")).toBeUndefined();
    expect(tree.find("layer-2")).toBeUndefined();
  });

  it("preserves visibility, opacity, transform, and blend mode state", () => {
    const layer = createRasterLayer("layer-1", "Styled", { visible: false, opacity: 0.4, blendMode: "multiply", transform: { position: { x: 10, y: 20 }, scale: { x: 2, y: 3 }, rotation: 45 } });
    expect(layer.visible).toBe(false);
    expect(layer.opacity).toBe(0.4);
    expect(layer.blendMode).toBe("multiply");
    expect(layer.transform.rotation).toBe(45);
  });
});
