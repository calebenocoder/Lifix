import { CreateRasterLayerCommand, RenameLayerCommand, createDocument } from "../src/core";
import { createViewport } from "../src/renderer";
import { createEditorSession } from "../src/ui/editor";
import { clientToDocument, clientToViewport, InteractionTransaction, isEditableTarget, modifiersFromEvent, toolRegistry, ToolInputRouter, ToolRegistry, type InteractionOverlay, type PointerCaptureHost, type ToolDefinition } from "../src/ui/tools";
import { describe, expect, it } from "vitest";

const viewport = createViewport(800, 600, 1.25, 2, 100, -40);
const rect = { left: 10, top: 20, width: 400, height: 300 };
function pointer(pointerId = 1, x = 210, y = 170) { return { pointerId, pointerType: "pen", buttons: 1, pressure: 0.5, tiltX: 10, tiltY: -5, clientX: x, clientY: y, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false }; }
function host(): PointerCaptureHost & { captured: number[]; released: number[] } { return { captured: [], released: [], getBoundingClientRect: () => rect, setPointerCapture(id) { this.captured.push(id); }, releasePointerCapture(id) { this.released.push(id); }, hasPointerCapture: () => true }; }
function fixture() { const document = createDocument("tools", "Tools", 1200, 800); new CreateRasterLayerCommand("layer", "Layer").execute(document); let documentChanges = 0; const session = createEditorSession(document, () => { documentChanges += 1; }); const overlay = { update: () => undefined, clear: () => undefined } as unknown as InteractionOverlay; const router = new ToolInputRouter({ registry: toolRegistry, overlay, getViewport: () => viewport, getSessionSnapshot: () => session.snapshot, beginPreview: preview => session.beginInteractionPreview(preview), updatePreview: preview => session.updateInteractionPreview(preview), cancelPreview: () => session.cancelInteractionPreview(), completePreview: () => session.completeInteractionPreview(), executeDocumentCommand: command => session.executeDocumentCommand(command), onShortcutToolSelected: toolId => { session.dispatch({ type: "set-active-tool", toolId }); } }); return { document, session, router, documentChanges: () => documentChanges }; }

describe("tool registry and session ownership", () => {
  it("provides unique stable tool definitions and session-only active selection", () => {
    expect(toolRegistry.tools.map(tool => tool.id)).toEqual(["move", "marquee", "brush", "eraser", "crop", "text", "shape", "hand", "zoom"]);
    const duplicate = [toolRegistry.get("move"), toolRegistry.get("move")];
    expect(() => new ToolRegistry(duplicate)).toThrow("Duplicate tool ID");
    const { session, documentChanges } = fixture();
    session.dispatch({ type: "set-active-tool", toolId: "brush" });
    expect(session.snapshot.activeToolId).toBe("brush");
    expect(session.snapshot.documentRevision).toBe(0);
    expect(documentChanges()).toBe(0);
  });
});

describe("tool coordinates and keyboard semantics", () => {
  it("converts client coordinates through logical viewport space without DPR contamination", () => {
    expect(clientToViewport({ x: 210, y: 170 }, rect, viewport)).toEqual({ x: 400, y: 300 });
    expect(clientToDocument({ x: 210, y: 170 }, rect, viewport)).toEqual({ x: 150, y: 170 });
    for (const point of [{ x: 0, y: 0 }, { x: 333.5, y: -20.25 }, { x: 1200, y: 800 }]) {
      const viewportPoint = { x: point.x * viewport.zoom + viewport.offsetX, y: point.y * viewport.zoom + viewport.offsetY };
      expect(clientToDocument({ x: rect.left + viewportPoint.x * rect.width / viewport.width, y: rect.top + viewportPoint.y * rect.height / viewport.height }, rect, viewport)).toEqual(point);
    }
  });

  it("centralizes modifiers and suppresses shortcuts in editable controls", () => {
    expect(modifiersFromEvent({ shiftKey: true, altKey: true, ctrlKey: false, metaKey: true })).toEqual({ shift: true, alt: true, control: false, meta: true });
    expect(isEditableTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    const { router, session } = fixture();
    expect(router.keyDown({ key: "b", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, target: { tagName: "INPUT" } as unknown as EventTarget })).toBe(false);
    expect(router.activeToolId).toBe("move");
    expect(router.keyDown({ key: "b", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, target: null })).toBe(true);
    expect(router.activeToolId).toBe("brush");
    expect(session.snapshot.activeToolId).toBe("brush");
  });
});

describe("input router transaction lifecycle", () => {
  it("captures one pointer, updates transient preview, and never creates a render input", () => {
    const { session, router, documentChanges } = fixture(); const capture = host();
    expect(router.pointerDown(pointer(), capture)).toBe(true);
    expect(capture.captured).toEqual([1]);
    expect(session.snapshot.interactionActive).toBe(true);
    expect(session.interactionPreview).toMatchObject({ kind: "diagnostic-pointer", start: { x: 150, y: 170 } });
    router.pointerMove(pointer(1, 310, 220), capture);
    expect(session.interactionPreview).toMatchObject({ current: { x: 250, y: 220 } });
    expect(documentChanges()).toBe(0);
    router.pointerUp(pointer(1, 310, 220), capture);
    expect(capture.released).toEqual([1]);
    expect(session.snapshot.interactionActive).toBe(false);
    expect(session.interactionPreview).toBeUndefined();
    expect(documentChanges()).toBe(0);
  });

  it("cancels on Escape, tool switch, document replacement, and disposal", () => {
    const { session, router } = fixture(); const capture = host();
    router.pointerDown(pointer(), capture); expect(router.keyDown({ key: "Escape", shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, target: null })).toBe(true);
    expect(session.interactionPreview).toBeUndefined(); expect(capture.released).toEqual([1]);
    router.setActiveTool("brush"); router.setActiveTool("move"); router.pointerDown(pointer(2), capture); router.setActiveTool("hand"); expect(capture.released).toContain(2);
    router.setActiveTool("move"); const stopReplacement = session.onDocumentWillReplace(() => router.documentReplaced()); router.pointerDown(pointer(3), capture); session.replaceDocument(createDocument("replacement", "Replacement", 100, 100)); stopReplacement(); expect(capture.released).toContain(3);
    router.pointerDown(pointer(4), capture); router.dispose(); expect(capture.released).toContain(4);
  });

  it("keeps transaction preview separate and commits document changes through the command boundary", () => {
    const events: string[] = [];
    const transaction = new InteractionTransaction<string>({ begin: value => events.push(`begin:${value}`), update: value => events.push(`update:${value}`), finish: () => events.push("finish") });
    transaction.begin("a"); transaction.update("b"); expect(transaction.commit()).toBe(true); expect(transaction.cancel()).toBe(false);
    expect(events).toEqual(["begin:a", "update:b", "finish"]);
    const commitTool: ToolDefinition = { ...toolRegistry.get("move"), createController: () => ({ pointerDown: () => true, pointerUp: (_input, context) => { context.commit(new RenameLayerCommand("layer", "Committed by tool")); } }) };
    const registry = new ToolRegistry([commitTool, ...toolRegistry.tools.filter(tool => tool.id !== "move")]);
    const document = createDocument("commit", "Commit", 100, 100); new CreateRasterLayerCommand("layer", "Layer").execute(document); let renderInputs = 0; const session = createEditorSession(document, () => { renderInputs += 1; }); const overlay = { update: () => undefined, clear: () => undefined } as unknown as InteractionOverlay;
    const router = new ToolInputRouter({ registry, overlay, getViewport: () => viewport, getSessionSnapshot: () => session.snapshot, beginPreview: preview => session.beginInteractionPreview(preview), updatePreview: preview => session.updateInteractionPreview(preview), cancelPreview: () => session.cancelInteractionPreview(), completePreview: () => session.completeInteractionPreview(), executeDocumentCommand: command => session.executeDocumentCommand(command) }); const capture = host();
    router.pointerDown(pointer(), capture); router.pointerUp(pointer(), capture);
    expect(session.snapshot.document.layers[0].name).toBe("Committed by tool");
    expect(renderInputs).toBe(1);
  });

  it("isolates controller failures by clearing preview and pointer capture", () => {
    const faulty: ToolDefinition = { ...toolRegistry.get("move"), createController: () => ({ pointerDown: () => true, pointerMove: () => { throw new Error("pointer failure"); } }) };
    const registry = new ToolRegistry([faulty, ...toolRegistry.tools.filter(tool => tool.id !== "move")]);
    const { session } = fixture(); const overlay = { update: () => undefined, clear: () => undefined } as unknown as InteractionOverlay;
    const router = new ToolInputRouter({ registry, overlay, getViewport: () => viewport, getSessionSnapshot: () => session.snapshot, beginPreview: preview => session.beginInteractionPreview(preview), updatePreview: preview => session.updateInteractionPreview(preview), cancelPreview: () => session.cancelInteractionPreview(), completePreview: () => session.completeInteractionPreview(), executeDocumentCommand: command => session.executeDocumentCommand(command) }); const capture = host();
    router.pointerDown(pointer(), capture); router.pointerMove(pointer(1, 240, 200), capture);
    expect(router.lastError).toMatchObject({ phase: "pointer", message: "pointer failure" });
    expect(capture.released).toEqual([1]);
    expect(session.interactionPreview).toBeUndefined();
  });
});
