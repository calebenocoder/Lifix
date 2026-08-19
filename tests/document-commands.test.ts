import { describe, expect, it } from "vitest";
import { AddLayerToGroupCommand, CreateGroupCommand, CreateRasterLayerCommand, DeleteLayerCommand, MoveLayerCommand, RemoveLayerFromGroupCommand, RenameLayerCommand, ReorderLayerCommand, SetBlendModeCommand, SetGroupCompositingModeCommand, SetOpacityCommand, SetVisibilityCommand, createDocument } from "../src/core";

describe("document commands", () => {
  it("creates layers and groups and can undo creation", () => {
    const document = createDocument("doc", "Document", 100, 100);
    const command = new CreateRasterLayerCommand("pixels", "Pixels");
    command.execute(document);
    expect(document.layerTree.find("pixels")?.kind).toBe("raster");
    command.undo(document);
    expect(document.layerTree.find("pixels")).toBeUndefined();
  });

  it("executes a deterministic nested command sequence", () => {
    const document = createDocument("doc", "Document", 100, 100);
    new CreateGroupCommand("a", "A").execute(document);
    new CreateGroupCommand("b", "B", {}, "a").execute(document);
    new CreateRasterLayerCommand("pixels", "Pixels").execute(document);
    new AddLayerToGroupCommand("pixels", "a").execute(document);
    new RenameLayerCommand("pixels", "Artwork").execute(document);
    new MoveLayerCommand("pixels", "b").execute(document);
    new SetVisibilityCommand("pixels", false).execute(document);
    new SetOpacityCommand("pixels", 0.5).execute(document);
    new SetBlendModeCommand("pixels", "screen").execute(document);
    new SetGroupCompositingModeCommand("b", "isolated").execute(document);
    expect(document.layerTree.traverse().map(layer => layer.id)).toEqual(["a", "b", "pixels"]);
    expect(document.layerTree.find("pixels")).toMatchObject({ name: "Artwork", visible: false, opacity: 0.5, blendMode: "screen", parentId: "b" });
    expect(document.layerTree.find("b")).toMatchObject({ kind: "group", compositing: "isolated" });
  });

  it("reorders, removes from groups, deletes, and restores a deleted subtree", () => {
    const document = createDocument("doc", "Document", 100, 100);
    new CreateGroupCommand("group").execute(document);
    new CreateRasterLayerCommand("one", "One", {}, "group").execute(document);
    new CreateRasterLayerCommand("two", "Two", {}, "group").execute(document);
    new ReorderLayerCommand("two", 0).execute(document);
    const group = document.layerTree.find("group");
    expect(group?.kind).toBe("group");
    if (group?.kind !== "group") throw new Error("Expected group layer");
    expect(group.childLayerIds).toEqual(["two", "one"]);
    new RemoveLayerFromGroupCommand("one").execute(document);
    expect(document.layerTree.find("one")?.parentId).toBeNull();
    const deleteGroup = new DeleteLayerCommand("group");
    deleteGroup.execute(document);
    expect(document.layerTree.find("two")).toBeUndefined();
    deleteGroup.undo(document);
    expect(document.layerTree.find("two")?.parentId).toBe("group");
  });

  it("rejects invalid IDs, hierarchy, opacity, blend modes, and circular moves", () => {
    const document = createDocument("doc", "Document", 100, 100);
    new CreateGroupCommand("outer").execute(document);
    new CreateGroupCommand("inner", "Inner", {}, "outer").execute(document);
    expect(() => new MoveLayerCommand("missing", null).execute(document)).toThrow("Unknown layer");
    expect(() => new MoveLayerCommand("outer", "inner").execute(document)).toThrow("ancestor");
    expect(() => new CreateRasterLayerCommand("bad", "Bad", {}, "missing").execute(document)).toThrow("Parent must be a group");
    expect(() => new SetOpacityCommand("outer", 2).execute(document)).toThrow("opacity");
    expect(() => new SetBlendModeCommand("outer", "invalid" as never).execute(document)).toThrow("Unsupported");
    expect(() => new SetGroupCompositingModeCommand("outer", "invalid" as never).execute(document)).toThrow("Unsupported"); new CreateRasterLayerCommand("leaf").execute(document); expect(() => new SetGroupCompositingModeCommand("leaf", "isolated").execute(document)).toThrow("group");
    expect(() => new RemoveLayerFromGroupCommand("outer").execute(document)).toThrow("not in a group");
  });
});
