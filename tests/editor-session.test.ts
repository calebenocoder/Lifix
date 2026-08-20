import { CreateGroupCommand, CreateRasterLayerCommand, createDocument } from "../src/core";
import { colorToHex, createEditorSession, parseHexColor } from "../src/ui/editor";
import { createRenderInput, type RenderInput } from "../src/renderer";
import { describe, expect, it } from "vitest";

function fixture() {
  const document = createDocument("document", "Panel document", 1200, 800);
  new CreateRasterLayerCommand("bottom", "Bottom").execute(document);
  new CreateGroupCommand("group", "Artwork").execute(document);
  new CreateRasterLayerCommand("child-bottom", "Child bottom", {}, "group").execute(document);
  new CreateRasterLayerCommand("child-top", "Child top", {}, "group").execute(document);
  new CreateRasterLayerCommand("top", "Top").execute(document);
  return document;
}

describe("editor session projection", () => {
  it("projects detached, topmost-first hierarchy while preserving nested Core order", () => {
    const document = fixture();
    const session = createEditorSession(document, () => undefined);
    expect(session.snapshot.document.layers.map(layer => layer.id)).toEqual(["top", "group", "bottom"]);
    expect(session.snapshot.document.layers[1].children.map(layer => layer.id)).toEqual(["child-top", "child-bottom"]);
    expect(document.layerTree.rootLayerIds).toEqual(["bottom", "group", "top"]);
    const group = document.layerTree.find("group");
    expect(group?.kind).toBe("group");
    expect(group?.kind === "group" ? group.childLayerIds : []).toEqual(["child-bottom", "child-top"]);
  });

  it("keeps selection and expansion in session state without notifying rendering", () => {
    const document = fixture();
    let documentChanges = 0;
    const session = createEditorSession(document, () => { documentChanges += 1; });
    expect(session.dispatch({ type: "select-layer", layerId: "child-top" }).ok).toBe(true);
    expect(session.snapshot.selectedLayer?.name).toBe("Child top");
    expect(session.dispatch({ type: "toggle-group", layerId: "group" }).ok).toBe(true);
    expect(session.snapshot.document.layers[1].expanded).toBe(false);
    expect(session.snapshot.documentRevision).toBe(0);
    expect(documentChanges).toBe(0);
  });
});

describe("editor session command bridge", () => {
  it("executes document commands, publishes detached snapshots, and rebuilds render input once per change", () => {
    const document = fixture();
    const inputs: RenderInput[] = [];
    const session = createEditorSession(document, changed => inputs.push(createRenderInput(changed)));
    expect(session.dispatch({ type: "set-visibility", layerId: "top", visible: false }).ok).toBe(true);
    expect(session.dispatch({ type: "set-opacity", layerId: "top", opacity: 0.4 }).ok).toBe(true);
    expect(session.dispatch({ type: "set-blend-mode", layerId: "top", blendMode: "screen" }).ok).toBe(true);
    expect(session.dispatch({ type: "rename-layer", layerId: "top", name: "Renamed" }).ok).toBe(true);
    expect(session.dispatch({ type: "set-transform", layerId: "top", transform: { position: { x: 12, y: -8 }, scale: { x: 2, y: 0.5 }, rotation: 30 } }).ok).toBe(true);
    expect(session.dispatch({ type: "set-group-compositing", layerId: "group", compositing: "isolated" }).ok).toBe(true);
    expect(inputs).toHaveLength(6);
    expect(inputs.at(-1)?.layers.top).toMatchObject({ name: "Renamed", visible: false, opacity: 0.4, blendMode: "screen", transform: { position: { x: 12, y: -8 }, scale: { x: 2, y: 0.5 }, rotation: 30 } });
    expect(inputs.at(-1)?.layers.group).toMatchObject({ kind: "group", compositing: "isolated" });
    expect(session.snapshot.documentRevision).toBe(6);
  });

  it("rejects invalid properties without changing document revision or notifying rendering", () => {
    const session = createEditorSession(fixture(), () => { throw new Error("must not notify"); });
    expect(session.dispatch({ type: "set-opacity", layerId: "top", opacity: 2 })).toMatchObject({ ok: false, error: "Layer opacity must be between 0 and 1" });
    expect(session.dispatch({ type: "rename-layer", layerId: "top", name: "  " }).ok).toBe(false);
    expect(session.dispatch({ type: "select-layer", layerId: "missing" }).ok).toBe(false);
    expect(session.snapshot.documentRevision).toBe(0);
  });
});

describe("editor color session", () => {
  it("stores foreground/background RGB state without creating document changes", () => {
    let documentChanges = 0;
    const session = createEditorSession(fixture(), () => { documentChanges += 1; });
    session.dispatch({ type: "set-foreground-color", color: { r: 17, g: 34, b: 51 } });
    session.dispatch({ type: "set-background-color", color: { r: 238, g: 221, b: 204 } });
    expect(colorToHex(session.snapshot.foregroundColor)).toBe("#112233");
    expect(parseHexColor("#EEDDCC")).toEqual(session.snapshot.backgroundColor);
    expect(session.snapshot.documentRevision).toBe(0);
    expect(documentChanges).toBe(0);
  });
});
