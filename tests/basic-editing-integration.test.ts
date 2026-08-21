import { ClearPixelSelectionCommand, CropDocumentCommand, CreateGroupCommand, CreateRasterLayerCommand, SetBlendModeCommand, SetOpacityCommand, SetPixelSelectionCommand, SetTransformCommand, SetVisibilityCommand, createDocument, createRectangularPixelSelection, deserializeProject, serializeDocument, type EditorCommand, type Document } from "../src/core";
import { createRenderInput } from "../src/renderer";
import { createEditorSession } from "../src/ui/editor";
import { describe, expect, it } from "vitest";

function documentFixture() {
  const document = createDocument("integration", "Integration", 200, 150);
  new CreateGroupCommand("group", "Group", { compositing: "isolated", opacity: 0.8, blendMode: "screen", transform: { position: { x: 30, y: 20 }, scale: { x: 1, y: 1 }, rotation: 0 } }).execute(document);
  new CreateRasterLayerCommand("child", "Child", { transform: { position: { x: 10, y: 5 }, scale: { x: 1, y: 1 }, rotation: 0 } }, "group", undefined, { kind: "raster-reference", sourceId: "stable-raster", storage: "tiled" }).execute(document);
  return document;
}

describe("basic editing integration", () => {
  it("preserves coordinate, selection, compositing, and raster identity through realistic cross-tool sequences and repeated crops", () => {
    const document = documentFixture(); const changes: boolean[] = []; const session = createEditorSession(document, (_document, change) => changes.push(change.affectsImageRendering)); session.dispatch({ type: "select-layer", layerId: "child" });
    session.executeDocumentCommand(new SetPixelSelectionCommand(createRectangularPixelSelection({ x: 40, y: 30 }, { x: 160, y: 120 })));
    session.executeDocumentCommand(new SetTransformCommand("child", { position: { x: 20, y: 15 }, scale: { x: 1.5, y: 0.75 }, rotation: 30 }));
    session.executeDocumentCommand(new SetTransformCommand("child", { position: { x: 25, y: 18 }, scale: { x: 1.5, y: 0.75 }, rotation: 30 }));
    session.executeDocumentCommand(new CropDocumentCommand({ left: 20, top: 10, width: 150, height: 120 }));
    session.executeDocumentCommand(new CropDocumentCommand({ left: 5, top: 5, width: 100, height: 90 }));
    expect(document.layerTree.find("group")).toMatchObject({ opacity: 0.8, blendMode: "screen", compositing: "isolated", transform: { position: { x: 5, y: 5 } } });
    expect(document.layerTree.find("child")).toMatchObject({ transform: { position: { x: 25, y: 18 }, scale: { x: 1.5, y: 0.75 }, rotation: 30 }, raster: { sourceId: "stable-raster", storage: "tiled" } });
    expect(document.pixelSelection).toEqual({ kind: "rectangle", left: 15, top: 15, right: 100, bottom: 90 });
    session.executeDocumentCommand(new SetPixelSelectionCommand(createRectangularPixelSelection({ x: 70, y: 60 }, { x: 140, y: 120 })));
    session.executeDocumentCommand(new SetTransformCommand("child", { position: { x: 30, y: 22 }, scale: { x: -1.2, y: 0.5 }, rotation: 45 }));
    session.dispatch({ type: "set-visibility", layerId: "child", visible: false }); session.dispatch({ type: "set-visibility", layerId: "child", visible: true });
    expect(document.pixelSelection).toEqual({ kind: "rectangle", left: 70, top: 60, right: 100, bottom: 90 }); expect(session.snapshot.selectedLayerId).toBe("child");
    const input = createRenderInput(document); expect(input).toMatchObject({ width: 100, height: 90, layers: { child: { visible: true, raster: { sourceId: "stable-raster" }, transform: { position: { x: 30, y: 22 }, scale: { x: -1.2, y: 0.5 }, rotation: 45 } } } });
    const serialized = serializeDocument(document); expect(serializeDocument(deserializeProject(serialized))).toEqual(serialized); expect(changes.filter(Boolean)).toHaveLength(7); expect(changes.filter(value => !value)).toHaveLength(2);
  });

  it("keeps command inputs/snapshots detached and representative property commands reversible", () => {
    const document = documentFixture(); const session = createEditorSession(document, () => undefined); session.dispatch({ type: "select-layer", layerId: "child" });
    const projected = session.snapshot.selectedLayer!; (projected.transform.position as { x: number }).x = 999; expect(document.layerTree.find("child")?.transform.position.x).toBe(10);
    const commands: EditorCommand<Document>[] = [new SetVisibilityCommand("child", false), new SetOpacityCommand("child", 0.4), new SetBlendModeCommand("child", "overlay"), new SetTransformCommand("child", { position: { x: 7, y: 8 }, scale: { x: 2, y: -1 }, rotation: 12 }), new SetPixelSelectionCommand(createRectangularPixelSelection({ x: 1, y: 2 }, { x: 30, y: 40 })), new ClearPixelSelectionCommand()];
    for (const command of commands) { const before = serializeDocument(document); command.execute(document); command.undo(document); expect(serializeDocument(document)).toEqual(before); }
  });
});
