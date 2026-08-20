import { CreateGroupCommand, CreateRasterLayerCommand, DeleteLayerCommand, RenameLayerCommand, SetPixelSelectionCommand, SetTransformCommand, createDocument, createRectangularPixelSelection } from "../src/core";
import { createViewport, type RenderLayerTransformPreview } from "../src/renderer";
import { createEditorSession } from "../src/ui/editor";
import { clientToDocument, clientToViewport, InteractionTransaction, isEditableTarget, modifiersFromEvent, toolRegistry, ToolInputRouter, ToolRegistry, type InteractionOverlay, type PointerCaptureHost, type ToolDefinition } from "../src/ui/tools";
import { describe, expect, it } from "vitest";

const viewport = createViewport(800, 600, 1.25, 2, 100, -40);
const rect = { left: 10, top: 20, width: 400, height: 300 };
function pointer(pointerId = 1, x = 210, y = 170) { return { pointerId, pointerType: "pen", buttons: 1, pressure: 0.5, tiltX: 10, tiltY: -5, clientX: x, clientY: y, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }; }
function host(): PointerCaptureHost & { captured: number[]; released: number[] } { return { captured: [], released: [], getBoundingClientRect: () => rect, setPointerCapture(id) { this.captured.push(id); }, releasePointerCapture(id) { this.released.push(id); }, hasPointerCapture: () => true }; }
function fixture(select = false) {
  const document = createDocument("tools", "Tools", 1200, 800); new CreateRasterLayerCommand("layer", "Layer").execute(document);
  let documentChanges = 0; const previews: (RenderLayerTransformPreview | undefined)[] = [];
  const session = createEditorSession(document, () => { documentChanges += 1; }); if (select) session.dispatch({ type: "select-layer", layerId: "layer" });
  const overlay = { update: () => undefined, clear: () => undefined } as unknown as InteractionOverlay;
  const router = new ToolInputRouter({ registry: toolRegistry, overlay, getViewport: () => viewport, getSessionSnapshot: () => session.snapshot, beginPreview: preview => session.beginInteractionPreview(preview), updatePreview: preview => session.updateInteractionPreview(preview), cancelPreview: () => session.cancelInteractionPreview(), completePreview: () => session.completeInteractionPreview(), setRendererTransformPreview: preview => previews.push(preview), executeDocumentCommand: command => session.executeDocumentCommand(command), onShortcutToolSelected: toolId => { session.dispatch({ type: "set-active-tool", toolId }); } });
  return { document, session, router, previews, documentChanges: () => documentChanges };
}

function marqueeFixture(nextViewport = createViewport(400, 300, 1, 1, 0, 0)) {
  const document = createDocument("marquee", "Marquee", 100, 80); new CreateRasterLayerCommand("layer", "Layer").execute(document);
  const changes: boolean[] = []; const session = createEditorSession(document, (_document, change) => { changes.push(change.affectsImageRendering); });
  session.dispatch({ type: "select-layer", layerId: "layer" });
  const overlay = { update: () => undefined, clear: () => undefined } as unknown as InteractionOverlay;
  const router = new ToolInputRouter({ registry: toolRegistry, overlay, getViewport: () => nextViewport, getSessionSnapshot: () => session.snapshot, beginPreview: preview => session.beginInteractionPreview(preview), updatePreview: preview => session.updateInteractionPreview(preview), cancelPreview: () => session.cancelInteractionPreview(), completePreview: () => session.completeInteractionPreview(), executeDocumentCommand: command => session.executeDocumentCommand(command) }, "marquee");
  const surface = { left: 10, top: 20, width: 200, height: 150 };
  const capture: PointerCaptureHost & { readonly captured: number[]; readonly released: number[] } = { captured: [], released: [], getBoundingClientRect: () => surface, setPointerCapture(id) { this.captured.push(id); }, releasePointerCapture(id) { this.released.push(id); }, hasPointerCapture: () => true };
  const atDocument = (pointerId: number, point: { readonly x: number; readonly y: number }) => pointer(pointerId, surface.left + (point.x * nextViewport.zoom + nextViewport.offsetX) * surface.width / nextViewport.width, surface.top + (point.y * nextViewport.zoom + nextViewport.offsetY) * surface.height / nextViewport.height);
  return { document, session, router, capture, changes, atDocument };
}

describe("tool registry and session ownership", () => {
  it("provides unique stable tool definitions and session-only active selection", () => {
    expect(toolRegistry.tools.map(tool => tool.id)).toEqual(["move", "transform", "marquee", "brush", "eraser", "crop", "text", "shape", "hand", "zoom"]);
    expect(() => new ToolRegistry([toolRegistry.get("move"), toolRegistry.get("move")])).toThrow("Duplicate tool ID");
    const { session, documentChanges } = fixture(); session.dispatch({ type: "set-active-tool", toolId: "brush" });
    expect(session.snapshot.activeToolId).toBe("brush"); expect(session.snapshot.documentRevision).toBe(0); expect(documentChanges()).toBe(0);
  });
});

describe("tool coordinates and keyboard semantics", () => {
  it("converts client coordinates through logical viewport space without DPR contamination", () => {
    expect(clientToViewport({ x: 210, y: 170 }, rect, viewport)).toEqual({ x: 400, y: 300 }); expect(clientToDocument({ x: 210, y: 170 }, rect, viewport)).toEqual({ x: 150, y: 170 });
    for (const point of [{ x: 0, y: 0 }, { x: 333.5, y: -20.25 }, { x: 1200, y: 800 }]) { const viewportPoint = { x: point.x * viewport.zoom + viewport.offsetX, y: point.y * viewport.zoom + viewport.offsetY }; expect(clientToDocument({ x: rect.left + viewportPoint.x * rect.width / viewport.width, y: rect.top + viewportPoint.y * rect.height / viewport.height }, rect, viewport)).toEqual(point); }
  });
  it("centralizes modifiers and suppresses shortcuts in editable controls", () => {
    expect(modifiersFromEvent({ shiftKey: true, altKey: true, ctrlKey: false, metaKey: true })).toEqual({ shift: true, alt: true, control: false, meta: true }); expect(isEditableTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    const { router, session } = fixture(); expect(router.keyDown({ key: "b", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, target: { tagName: "INPUT" } as unknown as EventTarget })).toBe(false); expect(router.keyDown({ key: "b", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, target: null })).toBe(true); expect(session.snapshot.activeToolId).toBe("brush");
  });
});

describe("Move tool", () => {
  it("moves the selected layer with preview-only pointer samples and one commit", () => {
    const { document, session, router, previews, documentChanges } = fixture(true); const capture = host();
    expect(router.pointerDown(pointer(), capture)).toBe(true); router.pointerMove(pointer(1, 310, 220), capture);
    expect(session.interactionPreview).toMatchObject({ kind: "move-layer", layerId: "layer", documentDelta: { x: 100, y: 50 }, transform: { position: { x: 100, y: 50 } } });
    expect(document.layerTree.find("layer")!.transform.position).toEqual({ x: 0, y: 0 }); expect(session.snapshot.selectedLayer!.transform.position).toEqual({ x: 0, y: 0 }); expect(documentChanges()).toBe(0); expect(previews).toEqual([{ layerId: "layer", documentTransform: { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 } }, { layerId: "layer", documentTransform: { a: 1, b: 0, c: 0, d: 1, e: 100, f: 50 } }]);
    router.pointerUp(pointer(1, 310, 220), capture);
    expect(capture.released).toEqual([1]); expect(document.layerTree.find("layer")!.transform.position).toEqual({ x: 100, y: 50 }); expect(documentChanges()).toBe(1); expect(session.snapshot.documentRevision).toBe(1); expect(session.interactionPreview).toBeUndefined(); expect(previews.at(-1)).toBeUndefined();
  });
  it("uses document deltas independently from zoom, pan, and fractional DPR", () => {
    const { document, router } = fixture(true); const capture = host(); router.pointerDown(pointer(), capture); router.pointerUp(pointer(1, 230, 170), capture);
    expect(document.layerTree.find("layer")!.transform.position).toEqual({ x: 20, y: 0 });
  });
  it("converts document movement into parent-local translation for rotated, scaled, and mirrored groups", () => {
    const document = createDocument("nested", "Nested", 100, 100); new CreateGroupCommand("parent", "Parent", { transform: { position: { x: 10, y: 20 }, scale: { x: 2, y: 1 }, rotation: 90 } }).execute(document); new CreateRasterLayerCommand("child", "Child", { transform: { position: { x: 3, y: 4 }, scale: { x: 1, y: 1 }, rotation: 0 } }, "parent").execute(document);
    const session = createEditorSession(document, () => undefined); session.dispatch({ type: "select-layer", layerId: "child" }); const overlay = { update: () => undefined, clear: () => undefined } as unknown as InteractionOverlay; const router = new ToolInputRouter({ registry: toolRegistry, overlay, getViewport: () => createViewport(100, 100), getSessionSnapshot: () => session.snapshot, beginPreview: value => session.beginInteractionPreview(value), updatePreview: value => session.updateInteractionPreview(value), cancelPreview: () => session.cancelInteractionPreview(), completePreview: () => session.completeInteractionPreview(), executeDocumentCommand: command => session.executeDocumentCommand(command) }); const capture = { ...host(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) };
    router.pointerDown(pointer(1, 10, 10), capture); router.pointerUp(pointer(1, 30, 20), capture); expect(document.layerTree.find("child")!.transform.position.x).toBeCloseTo(8); expect(document.layerTree.find("child")!.transform.position.y).toBeCloseTo(-16);
    session.executeDocumentCommand(new SetTransformCommand("parent", { position: { x: 0, y: 0 }, scale: { x: -2, y: 0.5 }, rotation: 0 })); session.dispatch({ type: "set-transform", layerId: "child", transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 } }); router.pointerDown(pointer(2, 10, 10), capture); router.pointerUp(pointer(2, 30, 20), capture); expect(document.layerTree.find("child")!.transform.position).toEqual({ x: -10, y: 20 });
    session.dispatch({ type: "select-layer", layerId: "parent" }); router.pointerDown(pointer(3, 10, 10), capture); router.pointerUp(pointer(3, 30, 20), capture); expect(document.layerTree.find("parent")!.transform.position).toEqual({ x: 20, y: 10 }); expect(document.layerTree.find("child")!.transform.position).toEqual({ x: -10, y: 20 });
  });
  it("rejects a non-invertible parent without mutating the document", () => {
    const document = createDocument("singular", "Singular", 100, 100); new CreateGroupCommand("parent", "Parent", { transform: { position: { x: 0, y: 0 }, scale: { x: 0, y: 1 }, rotation: 0 } }).execute(document); new CreateRasterLayerCommand("child", "Child", {}, "parent").execute(document); const session = createEditorSession(document, () => undefined); session.dispatch({ type: "select-layer", layerId: "child" }); const router = new ToolInputRouter({ registry: toolRegistry, overlay: { update: () => undefined, clear: () => undefined } as unknown as InteractionOverlay, getViewport: () => createViewport(100, 100), getSessionSnapshot: () => session.snapshot, beginPreview: value => session.beginInteractionPreview(value), updatePreview: value => session.updateInteractionPreview(value), cancelPreview: () => session.cancelInteractionPreview(), completePreview: () => session.completeInteractionPreview(), executeDocumentCommand: command => session.executeDocumentCommand(command) }); expect(router.pointerDown(pointer(), host())).toBe(false); expect(document.layerTree.find("child")!.transform.position).toEqual({ x: 0, y: 0 });
  });
  it("makes no command for no-op, cancellation, replacement, or a deleted target", () => {
    const { document, session, router, documentChanges } = fixture(true); const capture = host(); router.pointerDown(pointer(), capture); router.pointerUp(pointer(), capture); expect(documentChanges()).toBe(0);
    router.pointerDown(pointer(2), capture); expect(router.keyDown({ key: "Escape", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, target: null })).toBe(true); expect(capture.released).toContain(2); router.pointerDown(pointer(3), capture); router.pointerCancel({ pointerId: 3 }); expect(capture.released).toContain(3); router.pointerDown(pointer(4), capture); router.setActiveTool("brush"); expect(capture.released).toContain(4); router.setActiveTool("move"); const stopReplacement = session.onDocumentWillReplace(() => router.documentReplaced()); router.pointerDown(pointer(5), capture); session.replaceDocument(createDocument("replacement", "Replacement", 100, 100)); stopReplacement(); expect(capture.released).toContain(5);
    const fresh = fixture(true); fresh.router.pointerDown(pointer(6), capture); fresh.session.executeDocumentCommand(new DeleteLayerCommand("layer")); fresh.router.pointerUp(pointer(6, 260, 170), capture); expect(fresh.documentChanges()).toBe(1); expect(fresh.session.interactionPreview).toBeUndefined(); expect(document.layerTree.find("layer")!.transform.position).toEqual({ x: 0, y: 0 });
  });
});

describe("Rectangular Marquee tool", () => {
  it("keeps drag geometry transient and commits one normalized document selection", () => {
    const { document, session, router, capture, changes, atDocument } = marqueeFixture();
    expect(router.pointerDown(atDocument(1, { x: 70, y: 55 }), capture)).toBe(true);
    router.pointerMove(atDocument(1, { x: 10, y: 15 }), capture);
    expect(session.interactionPreview).toMatchObject({ kind: "rectangular-marquee", start: { x: 70, y: 55 }, current: { x: 10, y: 15 } });
    expect(document.pixelSelection).toBeNull();
    router.pointerUp(atDocument(1, { x: 10, y: 15 }), capture);
    expect(document.pixelSelection).toEqual({ kind: "rectangle", left: 10, top: 15, right: 70, bottom: 55 });
    expect(session.snapshot.selectedLayerId).toBe("layer");
    expect(session.snapshot.documentRevision).toBe(1);
    expect(session.interactionPreview).toBeUndefined();
    expect(changes).toEqual([false]);
  });

  it("uses document coordinates consistently across zoom, pan, and fractional DPR", () => {
    for (const candidate of [createViewport(400, 300, 1, 1, 0, 0), createViewport(400, 300, 1.25, 2, 40, -30), createViewport(400, 300, 1.5, 0.5, -12.5, 19.25)]) {
      const { document, router, capture, atDocument } = marqueeFixture(candidate);
      router.pointerDown(atDocument(1, { x: 12.5, y: 10.25 }), capture);
      router.pointerUp(atDocument(1, { x: 75.75, y: 62.5 }), capture);
      expect(document.pixelSelection).toEqual({ kind: "rectangle", left: 12.5, top: 10.25, right: 75.75, bottom: 62.5 });
    }
  });

  it("clips at document bounds, clears on click, and cancels without changing committed selection", () => {
    const { document, session, router, capture, changes, atDocument } = marqueeFixture();
    router.pointerDown(atDocument(1, { x: -20, y: 20 }), capture);
    router.pointerUp(atDocument(1, { x: 40, y: 120 }), capture);
    expect(document.pixelSelection).toEqual({ kind: "rectangle", left: 0, top: 20, right: 40, bottom: 80 });
    router.pointerDown(atDocument(2, { x: 20, y: 20 }), capture);
    expect(router.keyDown({ key: "Escape", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, target: null })).toBe(true);
    expect(document.pixelSelection).toEqual({ kind: "rectangle", left: 0, top: 20, right: 40, bottom: 80 });
    router.pointerDown(atDocument(3, { x: 10, y: 10 }), capture);
    router.setActiveTool("move");
    expect(document.pixelSelection).toEqual({ kind: "rectangle", left: 0, top: 20, right: 40, bottom: 80 });
    router.setActiveTool("marquee");
    router.pointerDown(atDocument(4, { x: 20, y: 20 }), capture);
    router.pointerUp(atDocument(4, { x: 20, y: 20 }), capture);
    expect(document.pixelSelection).toBeNull();
    expect(changes).toEqual([false, false]);
    expect(session.snapshot.selectedLayerId).toBe("layer");
  });

  it("cancels for document replacement and retains the replacement document selection", () => {
    const { session, router, capture, atDocument } = marqueeFixture();
    const replacement = createDocument("replacement", "Replacement", 100, 80);
    new SetPixelSelectionCommand(createRectangularPixelSelection({ x: 2, y: 3 }, { x: 20, y: 30 })).execute(replacement);
    const stop = session.onDocumentWillReplace(() => router.documentReplaced());
    router.pointerDown(atDocument(1, { x: 10, y: 10 }), capture);
    session.replaceDocument(replacement);
    stop();
    expect(capture.released).toEqual([1]);
    expect(session.snapshot.pixelSelection).toEqual({ kind: "rectangle", left: 2, top: 3, right: 20, bottom: 30 });
    expect(session.interactionPreview).toBeUndefined();
  });
});

describe("input router transaction lifecycle", () => {
  it("keeps transaction preview separate and commits document changes through the command boundary", () => {
    const events: string[] = []; const transaction = new InteractionTransaction<string>({ begin: value => events.push(`begin:${value}`), update: value => events.push(`update:${value}`), finish: () => events.push("finish") }); transaction.begin("a"); transaction.update("b"); expect(transaction.commit()).toBe(true); expect(transaction.cancel()).toBe(false); expect(events).toEqual(["begin:a", "update:b", "finish"]);
    const commitTool: ToolDefinition = { ...toolRegistry.get("move"), createController: () => ({ pointerDown: () => true, pointerUp: (_input, context) => { context.commit(new RenameLayerCommand("layer", "Committed by tool")); } }) }; const registry = new ToolRegistry([commitTool, ...toolRegistry.tools.filter(tool => tool.id !== "move")]); const document = createDocument("commit", "Commit", 100, 100); new CreateRasterLayerCommand("layer", "Layer").execute(document); let renderInputs = 0; const session = createEditorSession(document, () => { renderInputs += 1; }); const router = new ToolInputRouter({ registry, overlay: { update: () => undefined, clear: () => undefined } as unknown as InteractionOverlay, getViewport: () => viewport, getSessionSnapshot: () => session.snapshot, beginPreview: preview => session.beginInteractionPreview(preview), updatePreview: preview => session.updateInteractionPreview(preview), cancelPreview: () => session.cancelInteractionPreview(), completePreview: () => session.completeInteractionPreview(), executeDocumentCommand: command => session.executeDocumentCommand(command) }); const capture = host(); router.pointerDown(pointer(), capture); router.pointerUp(pointer(), capture); expect(session.snapshot.document.layers[0].name).toBe("Committed by tool"); expect(renderInputs).toBe(1);
  });
  it("isolates controller failures by clearing preview and pointer capture", () => {
    const faulty: ToolDefinition = { ...toolRegistry.get("move"), createController: () => ({ pointerDown: () => true, pointerMove: () => { throw new Error("pointer failure"); } }) }; const registry = new ToolRegistry([faulty, ...toolRegistry.tools.filter(tool => tool.id !== "move")]); const { session } = fixture(); const router = new ToolInputRouter({ registry, overlay: { update: () => undefined, clear: () => undefined } as unknown as InteractionOverlay, getViewport: () => viewport, getSessionSnapshot: () => session.snapshot, beginPreview: preview => session.beginInteractionPreview(preview), updatePreview: preview => session.updateInteractionPreview(preview), cancelPreview: () => session.cancelInteractionPreview(), completePreview: () => session.completeInteractionPreview(), executeDocumentCommand: command => session.executeDocumentCommand(command) }); const capture = host(); router.pointerDown(pointer(), capture); router.pointerMove(pointer(1, 240, 200), capture); expect(router.lastError).toMatchObject({ phase: "pointer", message: "pointer failure" }); expect(capture.released).toEqual([1]); expect(session.interactionPreview).toBeUndefined();
  });
});
