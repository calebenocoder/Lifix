import { CreateGroupCommand, CreateRasterLayerCommand, DeleteLayerCommand, createDocument } from "../src/core";
import { createViewport, transformPoint, type RenderLayerTransformPreview } from "../src/renderer";
import { createEditorSession } from "../src/ui/editor";
import { moveTransform, previewDocumentTransform, resolveTransformTarget, rotateTransform, scaleTransform, toolRegistry, ToolInputRouter, transformedTargetBox, type InteractionOverlay, type PointerCaptureHost } from "../src/ui/tools";
import { describe, expect, it } from "vitest";

const bounds = () => ({ x: 0, y: 0, width: 100, height: 50 });
function selectedDocument() {
  const document = createDocument("transform", "Transform", 800, 600);
  new CreateRasterLayerCommand("layer", "Layer", {}, null, undefined, { kind: "raster-reference", sourceId: "source", storage: "lazy" }).execute(document);
  const session = createEditorSession(document, () => undefined); session.dispatch({ type: "select-layer", layerId: "layer" });
  return { document, session, target: resolveTransformTarget(session.snapshot, "layer", bounds)! };
}

describe("transform geometry", () => {
  it("scales corners around the opposite anchor and constrains aspect ratio", () => {
    const { target } = selectedDocument();
    const scaled = scaleTransform(target, "south-east", { x: 200, y: 75 }, false);
    expect(scaled.scale).toEqual({ x: 2, y: 1.5 }); expect(scaled.position).toEqual({ x: 0, y: 0 });
    expect(scaleTransform(target, "south-east", { x: 200, y: 75 }, true).scale).toEqual({ x: 2, y: 2 });
  });

  it("supports edge scaling, negative scale crossing, and a non-singular zero guard", () => {
    const { target } = selectedDocument();
    expect(scaleTransform(target, "east", { x: 150, y: 25 }).scale).toEqual({ x: 1.5, y: 1 });
    expect(scaleTransform(target, "east", { x: -50, y: 25 }).scale.x).toBe(-0.5);
    expect(Math.abs(scaleTransform(target, "east", { x: 0, y: 25 }).scale.x)).toBe(0.0001);
  });

  it("rotates around the layer center, handles angle wrap, and snaps to 15 degrees", () => {
    const { target } = selectedDocument();
    const rotated = rotateTransform(target, { x: 50, y: -25 }, { x: 100, y: 25 });
    expect(rotated.rotation).toBeCloseTo(90); expect(transformPoint(previewDocumentTransform(target, rotated), target.box.pivot)).toEqual(target.box.pivot);
    expect(rotateTransform(target, { x: 50, y: -25 }, { x: 98, y: 10 }, true).rotation % 15).toBe(0);
  });

  it("moves in parent-local space and composes nested transforms", () => {
    const document = createDocument("nested", "Nested", 800, 600);
    new CreateGroupCommand("parent", "Parent", { transform: { position: { x: 20, y: 30 }, scale: { x: 2, y: 1 }, rotation: 90 } }).execute(document);
    new CreateRasterLayerCommand("child", "Child", {}, "parent", undefined, { kind: "raster-reference", sourceId: "source", storage: "lazy" }).execute(document);
    const session = createEditorSession(document, () => undefined); session.dispatch({ type: "select-layer", layerId: "child" }); const target = resolveTransformTarget(session.snapshot, "child", bounds)!;
    const moved = moveTransform(target, { x: 0, y: 0 }, { x: 20, y: 10 });
    expect(moved.position.x).toBeCloseTo(5); expect(moved.position.y).toBeCloseTo(-20);
    expect(transformedTargetBox(target, moved).corners[0]).toEqual({ x: 40, y: 40 });
  });

  it("uses conservative descendant bounds for groups and rejects hidden or singular targets", () => {
    const document = createDocument("groups", "Groups", 800, 600); new CreateGroupCommand("group", "Group").execute(document);
    new CreateRasterLayerCommand("first", "First", {}, "group", undefined, { kind: "raster-reference", sourceId: "a", storage: "lazy" }).execute(document);
    new CreateRasterLayerCommand("second", "Second", { transform: { position: { x: 150, y: 25 }, scale: { x: 0.5, y: 2 }, rotation: 0 } }, "group", undefined, { kind: "raster-reference", sourceId: "b", storage: "lazy" }).execute(document);
    const session = createEditorSession(document, () => undefined); session.dispatch({ type: "select-layer", layerId: "group" });
    expect(resolveTransformTarget(session.snapshot, "group", bounds)?.localBounds).toEqual({ x: 0, y: 0, width: 200, height: 125 });
    session.dispatch({ type: "set-visibility", layerId: "group", visible: false }); expect(resolveTransformTarget(session.snapshot, "group", bounds)).toBeUndefined();
  });
});

describe("Transform tool transaction", () => {
  it("keeps pointer samples transient and commits one SetTransformCommand on release", () => {
    const document = createDocument("tool", "Tool", 800, 600); new CreateRasterLayerCommand("layer", "Layer", {}, null, undefined, { kind: "raster-reference", sourceId: "source", storage: "lazy" }).execute(document);
    let changes = 0; const previews: (RenderLayerTransformPreview | undefined)[] = []; const session = createEditorSession(document, () => { changes += 1; }); session.dispatch({ type: "select-layer", layerId: "layer" });
    const overlay = { update() {}, clear() {}, setTransformBox() {} } as unknown as InteractionOverlay; const viewport = createViewport(300, 200); const capture: PointerCaptureHost = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 200 }), setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => true };
    const router = new ToolInputRouter({ registry: toolRegistry, overlay, getViewport: () => viewport, getSessionSnapshot: () => session.snapshot, beginPreview: value => session.beginInteractionPreview(value), updatePreview: value => session.updateInteractionPreview(value), cancelPreview: () => session.cancelInteractionPreview(), completePreview: () => session.completeInteractionPreview(), executeDocumentCommand: command => session.executeDocumentCommand(command), setRendererTransformPreview: value => previews.push(value), getTransformTarget: id => resolveTransformTarget(session.snapshot, id, bounds) }, "transform");
    const pointer = (x: number, y: number) => ({ pointerId: 1, pointerType: "mouse", buttons: 1, pressure: 0.5, tiltX: 0, tiltY: 0, clientX: x, clientY: y, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    expect(router.pointerDown(pointer(100, 50), capture)).toBe(true); router.pointerMove(pointer(150, 75), capture);
    expect(document.layerTree.find("layer")!.transform.scale).toEqual({ x: 1, y: 1 }); expect(session.interactionPreview).toMatchObject({ kind: "transform-layer", transform: { scale: { x: 1.5, y: 1.5 } } }); expect(changes).toBe(0);
    router.pointerUp(pointer(150, 75), capture); expect(document.layerTree.find("layer")!.transform.scale).toEqual({ x: 1.5, y: 1.5 }); expect(changes).toBe(1); expect(previews.at(-1)).toBeUndefined();
  });

  it("produces the same Core transform across zoom, pan, and fractional DPR", () => {
    for (const viewport of [createViewport(400, 300, 1, 0.25, 23, -17), createViewport(400, 300, 1.25, 1, -30, 40), createViewport(400, 300, 1.5, 4, 12, -8), createViewport(400, 300, 2, 1, 0, 0)]) {
      const document = createDocument("viewport", "Viewport", 800, 600); new CreateRasterLayerCommand("layer", "Layer", {}, null, undefined, { kind: "raster-reference", sourceId: "source", storage: "lazy" }).execute(document); const session = createEditorSession(document, () => undefined); session.dispatch({ type: "select-layer", layerId: "layer" });
      const overlay = { update() {}, clear() {}, setTransformBox() {} } as unknown as InteractionOverlay; const capture: PointerCaptureHost = { getBoundingClientRect: () => ({ left: 0, top: 0, width: viewport.width, height: viewport.height }), setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => true };
      const router = new ToolInputRouter({ registry: toolRegistry, overlay, getViewport: () => viewport, getSessionSnapshot: () => session.snapshot, beginPreview: value => session.beginInteractionPreview(value), updatePreview: value => session.updateInteractionPreview(value), cancelPreview: () => session.cancelInteractionPreview(), completePreview: () => session.completeInteractionPreview(), executeDocumentCommand: command => session.executeDocumentCommand(command), getTransformTarget: id => resolveTransformTarget(session.snapshot, id, bounds) }, "transform");
      const at = (x: number, y: number) => ({ pointerId: 1, pointerType: "mouse", buttons: 1, pressure: 0.5, tiltX: 0, tiltY: 0, clientX: x * viewport.zoom + viewport.offsetX, clientY: y * viewport.zoom + viewport.offsetY, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
      expect(router.pointerDown(at(100, 50), capture)).toBe(true); router.pointerUp(at(150, 75), capture); expect(document.layerTree.find("layer")!.transform.scale).toEqual({ x: 1.5, y: 1.5 });
    }
  });

  it("cancels without a command on Escape, pointer cancellation, tool switch, replacement, and stale target", () => {
    const create = () => { const document = createDocument("cancel", "Cancel", 800, 600); new CreateRasterLayerCommand("layer", "Layer", {}, null, undefined, { kind: "raster-reference", sourceId: "source", storage: "lazy" }).execute(document); let changes = 0; const session = createEditorSession(document, () => { changes += 1; }); session.dispatch({ type: "select-layer", layerId: "layer" }); const overlay = { update() {}, clear() {}, setTransformBox() {} } as unknown as InteractionOverlay; const router = new ToolInputRouter({ registry: toolRegistry, overlay, getViewport: () => createViewport(300, 200), getSessionSnapshot: () => session.snapshot, beginPreview: value => session.beginInteractionPreview(value), updatePreview: value => session.updateInteractionPreview(value), cancelPreview: () => session.cancelInteractionPreview(), completePreview: () => session.completeInteractionPreview(), executeDocumentCommand: command => session.executeDocumentCommand(command), getTransformTarget: id => resolveTransformTarget(session.snapshot, id, bounds) }, "transform"); return { document, session, router, changes: () => changes }; };
    const capture: PointerCaptureHost = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 200 }), setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => true }; const event = (x = 100, y = 50, id = 1) => ({ pointerId: id, pointerType: "mouse", buttons: 1, pressure: 0.5, tiltX: 0, tiltY: 0, clientX: x, clientY: y, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false });
    const escape = create(); escape.router.pointerDown(event(), capture); escape.router.pointerMove(event(150, 75), capture); expect(escape.router.keyDown({ key: "Escape", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, target: null })).toBe(true); expect(escape.changes()).toBe(0);
    const cancelled = create(); cancelled.router.pointerDown(event(), capture); cancelled.router.pointerCancel({ pointerId: 1 }); expect(cancelled.changes()).toBe(0);
    const switched = create(); switched.router.pointerDown(event(), capture); switched.router.setActiveTool("move"); expect(switched.changes()).toBe(0);
    const replaced = create(); replaced.router.pointerDown(event(), capture); replaced.router.documentReplaced(); expect(replaced.changes()).toBe(0);
    const stale = create(); stale.router.pointerDown(event(), capture); stale.session.executeDocumentCommand(new DeleteLayerCommand("layer")); stale.router.sessionChanged(); stale.router.pointerUp(event(150, 75), capture); expect(stale.changes()).toBe(1);
    const noop = create(); noop.router.pointerDown(event(), capture); noop.router.pointerUp(event(), capture); expect(noop.changes()).toBe(0);
  });
});
