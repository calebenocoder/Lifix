import { CreateRasterLayerCommand, SetPixelSelectionCommand, createDocument, createRectangularPixelSelection } from "../src/core";
import { createViewport, type RenderViewport } from "../src/renderer";
import { createEditorSession } from "../src/ui/editor";
import { fullDocumentCrop, moveCropRectangle, resizeCropRectangle, resolveTransformTarget, snapCropRectangle, toolRegistry, ToolInputRouter, type CropHandle, type InteractionOverlay, type PointerCaptureHost } from "../src/ui/tools";
import { describe, expect, it } from "vitest";

const modifiers = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
function fixture(viewport: RenderViewport = createViewport(200, 160)) {
  const document = createDocument("crop-tool", "Crop tool", 100, 80); new CreateRasterLayerCommand("layer", "Layer", { transform: { position: { x: 20, y: 15 }, scale: { x: 1, y: 1 }, rotation: 0 } }).execute(document); let commands = 0;
  const session = createEditorSession(document, () => { commands += 1; }); const overlay = { update() {}, clear() {}, setTransformBox() {} } as unknown as InteractionOverlay; const capture: PointerCaptureHost = { getBoundingClientRect: () => ({ left: 0, top: 0, width: viewport.width, height: viewport.height }), setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => true };
  const router = new ToolInputRouter({ registry: toolRegistry, overlay, getViewport: () => viewport, getSessionSnapshot: () => session.snapshot, beginPreview: preview => session.beginInteractionPreview(preview), updatePreview: preview => session.updateInteractionPreview(preview), cancelPreview: () => session.cancelInteractionPreview(), completePreview: () => session.completeInteractionPreview(), executeDocumentCommand: command => session.executeDocumentCommand(command) }, "crop");
  const pointer = (x: number, y: number, pointerId = 1) => ({ pointerId, pointerType: "mouse", buttons: 1, pressure: 0.5, tiltX: 0, tiltY: 0, clientX: x * viewport.zoom + viewport.offsetX, clientY: y * viewport.zoom + viewport.offsetY, ...modifiers });
  const key = (value: string) => router.keyDown({ key: value, ...modifiers, target: null });
  return { document, session, router, capture, pointer, key, commands: () => commands };
}

describe("crop geometry", () => {
  it("initializes to the complete document and moves within its bounds", () => {
    const document = { width: 100, height: 80 }; expect(fullDocumentCrop(document)).toEqual({ left: 0, top: 0, right: 100, bottom: 80 }); const rectangle = { left: 10, top: 10, right: 70, bottom: 50 };
    expect(moveCropRectangle(rectangle, { x: 50, y: 50 }, document)).toEqual({ left: 40, top: 40, right: 100, bottom: 80 }); expect(moveCropRectangle(rectangle, { x: -50, y: -50 }, document)).toEqual({ left: 0, top: 0, right: 60, bottom: 40 });
  });

  it.each<[CropHandle, { x: number; y: number }, object]>([
    ["north-west", { x: 5, y: 6 }, { left: 5, top: 6 }], ["north", { x: 40, y: 7 }, { top: 7 }], ["north-east", { x: 90, y: 8 }, { right: 90, top: 8 }], ["east", { x: 92, y: 30 }, { right: 92 }], ["south-east", { x: 93, y: 70 }, { right: 93, bottom: 70 }], ["south", { x: 40, y: 72 }, { bottom: 72 }], ["south-west", { x: 4, y: 73 }, { left: 4, bottom: 73 }], ["west", { x: 3, y: 30 }, { left: 3 }],
  ])("resizes the %s handle", (handle, point, expected) => { expect(resizeCropRectangle({ left: 10, top: 10, right: 80, bottom: 60 }, handle, point, { width: 100, height: 80 })).toMatchObject(expected); });

  it("constrains tiny previews and snaps edges deterministically to at least 1x1", () => {
    expect(resizeCropRectangle({ left: 10, top: 10, right: 20, bottom: 20 }, "north-west", { x: 30, y: 30 }, { width: 100, height: 80 })).toEqual({ left: 19, top: 19, right: 20, bottom: 20 });
    expect(snapCropRectangle({ left: 9.7, top: 7.7, right: 9.9, bottom: 7.9 }, { width: 10, height: 8 })).toEqual({ left: 9, top: 7, right: 10, bottom: 8 });
  });
});

describe("Crop tool transaction", () => {
  it("starts with a full-document overlay, resizes, moves, and commits exactly once on Enter", () => {
    const { document, session, router, capture, pointer, key, commands } = fixture(); expect(session.interactionPreview).toMatchObject({ kind: "crop-document", rectangle: { left: 0, top: 0, right: 100, bottom: 80 } });
    expect(router.pointerDown(pointer(100, 80), capture)).toBe(true); router.pointerUp(pointer(80, 60), capture); expect(session.interactionPreview).toMatchObject({ rectangle: { left: 0, top: 0, right: 80, bottom: 60 } }); expect(commands()).toBe(0);
    expect(router.pointerDown(pointer(40, 30, 2), capture)).toBe(true); router.pointerUp(pointer(50, 35, 2), capture); expect(session.interactionPreview).toMatchObject({ rectangle: { left: 10, top: 5, right: 90, bottom: 65 } }); expect(document).toMatchObject({ width: 100, height: 80 });
    expect(key("Enter")).toBe(true); expect(commands()).toBe(1); expect(document).toMatchObject({ width: 80, height: 60 }); expect(document.layerTree.find("layer")?.transform.position).toEqual({ x: 10, y: 10 }); expect(session.interactionPreview).toMatchObject({ rectangle: { left: 0, top: 0, right: 80, bottom: 60 } });
  });

  it("cancels without mutation on Escape, pointer cancel, and tool switch", () => {
    const escape = fixture(); escape.router.pointerDown(escape.pointer(100, 80), escape.capture); escape.router.pointerUp(escape.pointer(70, 50), escape.capture); expect(escape.key("Escape")).toBe(true); expect(escape.commands()).toBe(0); expect(escape.document).toMatchObject({ width: 100, height: 80 }); expect(escape.session.interactionPreview).toBeUndefined();
    const pointerCancel = fixture(); pointerCancel.router.pointerDown(pointerCancel.pointer(100, 80), pointerCancel.capture); pointerCancel.router.pointerMove(pointerCancel.pointer(70, 50), pointerCancel.capture); pointerCancel.router.pointerCancel({ pointerId: 1 }); expect(pointerCancel.commands()).toBe(0); expect(pointerCancel.session.interactionPreview).toBeUndefined();
    const switched = fixture(); switched.router.pointerDown(switched.pointer(100, 80), switched.capture); switched.router.pointerUp(switched.pointer(70, 50), switched.capture); switched.router.setActiveTool("move"); expect(switched.commands()).toBe(0); expect(switched.session.interactionPreview).toBeUndefined();
  });

  it("does not execute a command for a full-document no-op", () => { const value = fixture(); expect(value.key("Enter")).toBe(true); expect(value.commands()).toBe(0); expect(value.document).toMatchObject({ width: 100, height: 80 }); });

  it("is independent of zoom, pan, and DPR", () => {
    for (const viewport of [createViewport(300, 220, 1, 0.25, 30, -10), createViewport(300, 220, 1.25, 1, -20, 15), createViewport(300, 220, 1.5, 4, 12, 8), createViewport(300, 220, 2, 1, 0, 0)]) { const value = fixture(viewport); value.router.pointerDown(value.pointer(100, 80), value.capture); value.router.pointerUp(value.pointer(80, 60), value.capture); value.key("Enter"); expect(value.document).toMatchObject({ width: 80, height: 60 }); }
  });

  it("adjusts an existing selection while preserving layer targeting", () => {
    const value = fixture(); value.session.dispatch({ type: "select-layer", layerId: "layer" }); value.session.executeDocumentCommand(new SetPixelSelectionCommand(createRectangularPixelSelection({ x: 20, y: 20 }, { x: 90, y: 70 }))); value.router.sessionChanged(); value.router.setActiveTool("move"); value.router.setActiveTool("crop"); value.router.pointerDown(value.pointer(0, 0), value.capture); value.router.pointerUp(value.pointer(10, 10), value.capture); value.router.pointerDown(value.pointer(100, 80, 2), value.capture); value.router.pointerUp(value.pointer(80, 60, 2), value.capture); value.key("Enter"); expect(value.session.snapshot.selectedLayerId).toBe("layer"); expect(value.document.pixelSelection).toEqual({ kind: "rectangle", left: 10, top: 10, right: 70, bottom: 50 });
  });

  it("keeps Move, Transform bounds, and Marquee in the cropped coordinate system", () => {
    const value = fixture(); value.session.dispatch({ type: "select-layer", layerId: "layer" }); value.router.pointerDown(value.pointer(0, 0), value.capture); value.router.pointerUp(value.pointer(10, 5), value.capture); value.router.pointerDown(value.pointer(100, 80, 2), value.capture); value.router.pointerUp(value.pointer(70, 55, 2), value.capture); value.key("Enter"); expect(value.document).toMatchObject({ width: 60, height: 50 }); expect(value.document.layerTree.find("layer")?.transform.position).toEqual({ x: 10, y: 10 });
    value.router.setActiveTool("move"); value.router.pointerDown(value.pointer(20, 20, 3), value.capture); value.router.pointerUp(value.pointer(25, 25, 3), value.capture); expect(value.document.layerTree.find("layer")?.transform.position).toEqual({ x: 15, y: 15 });
    const target = resolveTransformTarget(value.session.snapshot, "layer", () => ({ x: 0, y: 0, width: 10, height: 10 })); expect(target?.box.corners[0]).toEqual({ x: 15, y: 15 });
    value.router.setActiveTool("marquee"); value.router.pointerDown(value.pointer(50, 40, 4), value.capture); value.router.pointerUp(value.pointer(80, 70, 4), value.capture); expect(value.document.pixelSelection).toEqual({ kind: "rectangle", left: 50, top: 40, right: 60, bottom: 50 });
  });
});
