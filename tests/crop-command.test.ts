import { CropDocumentCommand, CreateGroupCommand, CreateRasterLayerCommand, SetPixelSelectionCommand, createDocument, createRectangularPixelSelection, deserializeProject, serializeDocument } from "../src/core";
import { describe, expect, it } from "vitest";

describe("CropDocumentCommand", () => {
  it("changes canvas dimensions and translates each root exactly once", () => {
    const document = createDocument("crop", "Crop", 100, 80);
    new CreateRasterLayerCommand("root", "Root", { opacity: 0.75, blendMode: "multiply", transform: { position: { x: 30, y: 25 }, scale: { x: 2, y: 3 }, rotation: 12 } }, null, undefined, { kind: "raster-reference", sourceId: "pixels", storage: "lazy" }).execute(document);
    new CreateGroupCommand("group", "Group", { compositing: "isolated", transform: { position: { x: 12, y: 14 }, scale: { x: 1, y: 1 }, rotation: 0 } }).execute(document);
    new CreateGroupCommand("nested", "Nested", { transform: { position: { x: 7, y: 8 }, scale: { x: -1, y: 1 }, rotation: 5 } }, "group").execute(document);
    new CreateRasterLayerCommand("child", "Child", { transform: { position: { x: 3, y: 4 }, scale: { x: 1, y: 1 }, rotation: 0 } }, "nested", undefined, { kind: "raster-reference", sourceId: "child-pixels", storage: "tiled" }).execute(document);
    const childBefore = structuredClone(document.layerTree.find("child")!); const nestedBefore = structuredClone(document.layerTree.find("nested")!);
    new CropDocumentCommand({ left: 10, top: 20, width: 60, height: 40 }).execute(document);
    expect(document).toMatchObject({ width: 60, height: 40 });
    expect(document.layerTree.find("root")).toMatchObject({ opacity: 0.75, blendMode: "multiply", transform: { position: { x: 20, y: 5 }, scale: { x: 2, y: 3 }, rotation: 12 }, raster: { sourceId: "pixels" } });
    expect(document.layerTree.find("group")).toMatchObject({ compositing: "isolated", transform: { position: { x: 2, y: -6 } } });
    expect(document.layerTree.find("nested")).toEqual(nestedBefore); expect(document.layerTree.find("child")).toEqual(childBefore);
  });

  it("undo restores dimensions, root transforms, hierarchy, and pixel selection", () => {
    const document = createDocument("undo", "Undo", 100, 80); new CreateGroupCommand("group", "Group", { transform: { position: { x: 10, y: 20 }, scale: { x: 1, y: 1 }, rotation: 0 } }).execute(document); new CreateRasterLayerCommand("child", "Child", {}, "group").execute(document); new SetPixelSelectionCommand(createRectangularPixelSelection({ x: 20, y: 20 }, { x: 90, y: 70 })).execute(document);
    const before = serializeDocument(document); const command = new CropDocumentCommand({ left: 30, top: 10, width: 50, height: 40 }); command.execute(document); command.undo(document);
    expect(serializeDocument(document)).toEqual(before);
  });

  it("round-trips the cropped document without transient crop state", () => {
    const document = createDocument("serialized-crop", "Serialized Crop", 100, 80); new CreateRasterLayerCommand("layer", "Layer", { transform: { position: { x: 15, y: 12 }, scale: { x: 1, y: 1 }, rotation: 0 } }, null, undefined, { kind: "raster-reference", sourceId: "persistent-source", storage: "external" }).execute(document); new CropDocumentCommand({ left: 5, top: 7, width: 60, height: 40 }).execute(document); const project = serializeDocument(document);
    expect(project.document).toMatchObject({ width: 60, height: 40, layerTree: { layers: { layer: { transform: { position: { x: 10, y: 5 } }, raster: { sourceId: "persistent-source" } } } } });
    expect(serializeDocument(deserializeProject(project))).toEqual(project);
  });

  it.each([
    [{ left: 10, top: 10, width: 50, height: 40 }, { kind: "rectangle", left: 10, top: 10, right: 50, bottom: 30 }],
    [{ left: 30, top: 20, width: 40, height: 30 }, { kind: "rectangle", left: 0, top: 0, right: 30, bottom: 20 }],
    [{ left: 70, top: 50, width: 20, height: 20 }, null],
  ])("translates and clips existing pixel selection", (crop, expected) => {
    const document = createDocument("selection", "Selection", 100, 80); new SetPixelSelectionCommand(createRectangularPixelSelection({ x: 20, y: 20 }, { x: 60, y: 40 })).execute(document); new CropDocumentCommand(crop).execute(document); expect(document.pixelSelection).toEqual(expected);
  });

  it("preserves a null selection and accepts full-canvas and 1x1 crops", () => {
    const full = createDocument("full", "Full", 10, 8); new CropDocumentCommand({ left: 0, top: 0, width: 10, height: 8 }).execute(full); expect(full).toMatchObject({ width: 10, height: 8, pixelSelection: null });
    const tiny = createDocument("tiny", "Tiny", 10, 8); new CropDocumentCommand({ left: 9, top: 7, width: 1, height: 1 }).execute(tiny); expect(tiny).toMatchObject({ width: 1, height: 1, pixelSelection: null });
  });

  it.each([
    { left: -1, top: 0, width: 1, height: 1 }, { left: 0, top: 0, width: 0, height: 1 }, { left: 0, top: 0, width: 11, height: 1 }, { left: 0.5, top: 0, width: 1, height: 1 }, { left: 0, top: Number.NaN, width: 1, height: 1 },
  ])("rejects invalid bounds atomically", bounds => {
    const document = createDocument("invalid", "Invalid", 10, 8); new CreateRasterLayerCommand("layer", "Layer", { transform: { position: { x: 2, y: 3 }, scale: { x: 1, y: 1 }, rotation: 0 } }).execute(document); const before = serializeDocument(document);
    expect(() => new CropDocumentCommand(bounds).execute(document)).toThrow(); expect(serializeDocument(document)).toEqual(before);
  });

  it("rejects invalid current document dimensions before mutation", () => {
    const document = createDocument("invalid-document", "Invalid document", 10, 8); document.width = Number.NaN; const layerTree = document.layerTree.snapshot();
    expect(() => new CropDocumentCommand({ left: 0, top: 0, width: 1, height: 1 }).execute(document)).toThrow("Document dimensions must be positive integer pixels");
    expect(document.layerTree.snapshot()).toEqual(layerTree); expect(Number.isNaN(document.width)).toBe(true); expect(document.height).toBe(8);
  });
});
