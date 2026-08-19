import { AddLayerToGroupCommand, CreateGroupCommand, CreateRasterLayerCommand, SetBlendModeCommand, SetOpacityCommand, SetVisibilityCommand, createDocument, deserializeProject, serializeDocument } from "../src/core";
import { describe, expect, it } from "vitest";

describe("native project serialization", () => {
  it("round-trips an empty document", () => {
    const original = createDocument("empty", "Empty", 800, 600, { metadata: { author: "Calebe" } });
    const project = serializeDocument(original);
    expect(project.formatVersion).toBe(1);
    expect(serializeDocument(deserializeProject(project))).toEqual(project);
  });

  it("preserves nested hierarchy and layer state", () => {
    const original = createDocument("doc", "Artwork", 1920, 1080, { resolution: { x: 300, y: 300, unit: "ppi" }, color: { model: "rgb", profile: "srgb", bitDepth: 16, alpha: true } });
    new CreateGroupCommand("folder", "Folder").execute(original);
    new CreateGroupCommand("nested", "Nested", {}, "folder").execute(original);
    new CreateRasterLayerCommand("pixels", "Pixels", { transform: { position: { x: 12, y: -4 }, scale: { x: 2, y: 0.5 }, rotation: 15 } }, "nested", undefined, { kind: "raster-reference", storage: "lazy", sourceId: "pixels-001" }).execute(original);
    new SetVisibilityCommand("pixels", false).execute(original);
    new SetOpacityCommand("pixels", 0.25).execute(original);
    new SetBlendModeCommand("pixels", "overlay").execute(original);
    const project = serializeDocument(original);
    const restored = deserializeProject(JSON.parse(JSON.stringify(project)));
    expect(serializeDocument(restored)).toEqual(project);
    expect(restored.layerTree.find("pixels")).toMatchObject({ parentId: "nested", visible: false, opacity: 0.25, blendMode: "overlay" });
  });

  it.each([
    [{ formatVersion: 2 }, "Unsupported project format version"],
    [{ formatVersion: 1, document: { id: "doc", name: "Bad", width: 0, height: 1 } }, "Document width"],
    [{ formatVersion: 1, document: { id: "doc", name: "Bad", width: 1, height: 1, resolution: { x: 72, y: 72, unit: "ppi" }, color: { model: "rgb", profile: "srgb", bitDepth: 8, alpha: true }, metadata: {}, layerTree: { rootLayerIds: ["missing"], layers: {} } } }, "Layer reference does not exist"],
  ])("rejects malformed project data", (input, message) => {
    expect(() => deserializeProject(input)).toThrow(message);
  });

  it("rejects invalid layer relationships and properties", () => {
    const project = serializeDocument(createDocument("doc", "Bad", 1, 1));
    const invalidOpacity = structuredClone(project) as { document: { layerTree: { rootLayerIds: string[]; layers: Record<string, unknown> } } };
    invalidOpacity.document.layerTree.rootLayerIds.push("layer");
    invalidOpacity.document.layerTree.layers.layer = { id: "layer", name: "Layer", kind: "raster", parentId: null, visible: true, opacity: 2, blendMode: "normal", transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 }, raster: { kind: "raster-reference", storage: "tiled" } };
    expect(() => deserializeProject(invalidOpacity)).toThrow("opacity");
    const invalidParent = structuredClone(project) as { document: { layerTree: { rootLayerIds: string[]; layers: Record<string, unknown> } } };
    invalidParent.document.layerTree.rootLayerIds.push("layer");
    invalidParent.document.layerTree.layers.layer = { id: "layer", name: "Layer", kind: "group", parentId: "other", visible: true, opacity: 1, blendMode: "normal", transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 }, childLayerIds: [] };
    expect(() => deserializeProject(invalidParent)).toThrow("Invalid parent relationship");
  });
});
