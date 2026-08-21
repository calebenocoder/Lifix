import { CreateGroupCommand, CreateRasterLayerCommand, DeleteLayerCommand, createDocument } from "../src/core";
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

  it("reuses the detached document projection for selection and color-only changes", () => {
    const session = createEditorSession(fixture(), () => undefined);
    const documentView = session.snapshot.document;
    expect(session.snapshot).toBe(session.snapshot);
    session.dispatch({ type: "select-layer", layerId: "top" });
    expect(session.snapshot.document).toBe(documentView);
    session.dispatch({ type: "set-foreground-color", color: { r: 12, g: 34, b: 56 } });
    expect(session.snapshot.document).toBe(documentView);
    session.dispatch({ type: "toggle-group", layerId: "group" });
    expect(session.snapshot.document).not.toBe(documentView);
  });

  it("projects a larger hierarchy in deterministic topmost-first order", () => {
    const document = createDocument("large", "Large hierarchy", 100, 100);
    for (let index = 0; index < 60; index += 1) new CreateRasterLayerCommand(`layer-${index}`, `Layer ${index}`).execute(document);
    const layers = createEditorSession(document, () => undefined).snapshot.document.layers;
    expect(layers).toHaveLength(60);
    expect(layers[0].id).toBe("layer-59");
    expect(layers.at(-1)?.id).toBe("layer-0");
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

  it("suppresses repeated session and property values before the command/history boundary", () => {
    let changes = 0; const session = createEditorSession(fixture(), () => { changes += 1; });
    const initialSessionRevision = session.snapshot.sessionRevision;
    session.dispatch({ type: "select-layer", layerId: null }); session.dispatch({ type: "set-active-tool", toolId: "move" }); session.dispatch({ type: "set-foreground-color", color: session.snapshot.foregroundColor });
    session.dispatch({ type: "set-visibility", layerId: "top", visible: true }); session.dispatch({ type: "set-opacity", layerId: "top", opacity: 1 }); session.dispatch({ type: "set-blend-mode", layerId: "top", blendMode: "normal" }); session.dispatch({ type: "rename-layer", layerId: "top", name: "Top" }); session.dispatch({ type: "set-transform", layerId: "top", transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 } }); session.dispatch({ type: "set-group-compositing", layerId: "group", compositing: "pass-through" });
    expect(session.snapshot.sessionRevision).toBe(initialSessionRevision); expect(session.snapshot.documentRevision).toBe(0); expect(changes).toBe(0);
  });

  it("reconciles selection and expansion after a structural command", () => {
    const session = createEditorSession(fixture(), () => undefined);
    session.dispatch({ type: "select-layer", layerId: "child-top" });
    expect(session.executeDocumentCommand(new DeleteLayerCommand("group")).ok).toBe(true);
    expect(session.snapshot.selectedLayerId).toBeNull();
    expect(session.snapshot.selectedLayer).toBeUndefined();
    expect(session.snapshot.expandedGroupIds).not.toContain("group");
    expect(session.snapshot.document.layers.map(layer => layer.id)).toEqual(["top", "bottom"]);
  });

  it("replaces a document while preserving session colors and clearing stale hierarchy state", () => {
    const changes: string[] = [];
    const session = createEditorSession(fixture(), document => changes.push(document.id));
    session.dispatch({ type: "select-layer", layerId: "top" });
    session.dispatch({ type: "set-foreground-color", color: { r: 1, g: 2, b: 3 } });
    const replacement = createDocument("replacement", "Replacement", 640, 480);
    new CreateGroupCommand("replacement-group", "Replacement group").execute(replacement);
    expect(session.replaceDocument(replacement).ok).toBe(true);
    expect(changes).toEqual(["replacement"]);
    expect(session.snapshot.document.id).toBe("replacement");
    expect(session.snapshot.selectedLayerId).toBeNull();
    expect(session.snapshot.expandedGroupIds).toEqual(["replacement-group"]);
    expect(session.snapshot.foregroundColor).toEqual({ r: 1, g: 2, b: 3 });
  });

  it("keeps successful Core state visible when downstream synchronization reports an error", () => {
    const session = createEditorSession(fixture(), () => { throw new Error("renderer unavailable"); });
    const result = session.dispatch({ type: "rename-layer", layerId: "top", name: "Committed" });
    expect(result).toEqual({ ok: true, warning: "renderer unavailable" });
    expect(session.snapshot.selectedLayer).toBeUndefined();
    expect(session.snapshot.document.layers[0].name).toBe("Committed");
    expect(session.snapshot.documentRevision).toBe(1);
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
