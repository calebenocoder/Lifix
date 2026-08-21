import { CropDocumentCommand } from "../../core";
import type { ToolContext, ToolController, ToolPointerInput } from "./contracts";
import { cropHeight, cropWidth, fullDocumentCrop, hitCropHandle, isFullDocumentCrop, moveCropRectangle, resizeCropRectangle, snapCropRectangle, type CropHandle, type CropPoint, type CropRectangle } from "./crop-engine";

interface CropGesture { readonly handle: CropHandle; readonly start: CropPoint; readonly original: CropRectangle; }
interface CropState { rectangle: CropRectangle; readonly documentRevision: number; gesture?: CropGesture; }

export function createCropToolController(): ToolController {
  let state: CropState | undefined; let committing = false;
  const preview = (context: ToolContext) => { if (state) context.updatePreview({ kind: "crop-document", toolId: "crop", rectangle: state.rectangle, document: { width: context.getSessionSnapshot().document.width, height: context.getSessionSnapshot().document.height } }); };
  const start = (context: ToolContext) => { const snapshot = context.getSessionSnapshot(); state = { rectangle: fullDocumentCrop(snapshot.document), documentRevision: snapshot.documentRevision }; context.beginPreview({ kind: "crop-document", toolId: "crop", rectangle: state.rectangle, document: { width: snapshot.document.width, height: snapshot.document.height } }); };
  const cancel = (context: ToolContext) => { state = undefined; context.cancelPreview(); };
  const update = (input: ToolPointerInput, context: ToolContext) => {
    const current = state, gesture = current?.gesture; if (!current || !gesture) return;
    const snapshot = context.getSessionSnapshot(); if (snapshot.documentRevision !== current.documentRevision) { cancel(context); return; }
    current.rectangle = gesture.handle === "move" ? moveCropRectangle(gesture.original, { x: input.document.x - gesture.start.x, y: input.document.y - gesture.start.y }, snapshot.document) : resizeCropRectangle(gesture.original, gesture.handle, input.document, snapshot.document); preview(context);
  };
  const commit = (context: ToolContext) => {
    const current = state; if (!current || current.gesture) return false; const snapshot = context.getSessionSnapshot(); if (snapshot.documentRevision !== current.documentRevision) { cancel(context); return true; }
    const rectangle = snapCropRectangle(current.rectangle, snapshot.document);
    if (isFullDocumentCrop(rectangle, snapshot.document)) { context.completePreview(); start(context); return true; }
    committing = true; const result = context.commit(new CropDocumentCommand({ left: rectangle.left, top: rectangle.top, width: cropWidth(rectangle), height: cropHeight(rectangle) })); committing = false;
    if (!result.ok) { state = undefined; throw new Error(result.error ?? "Crop document command failed"); }
    start(context); return true;
  };
  return {
    activate(context) { start(context); },
    sessionChanged(context) { if (!committing && state && context.getSessionSnapshot().documentRevision !== state.documentRevision) cancel(context); },
    pointerDown(input, context) { const current = state; if (!current || current.gesture) return false; const handle = hitCropHandle(current.rectangle, input.viewport, input.document, context.getViewport()); if (!handle) return false; current.gesture = { handle, start: input.document, original: current.rectangle }; return true; },
    pointerMove(input, context) { update(input, context); },
    pointerUp(input, context) { update(input, context); if (state) state.gesture = undefined; },
    pointerCancel(context) { cancel(context); },
    keyDown(input, context) { if (input.key === "Escape" && state) { cancel(context); return true; } if (input.key === "Enter") return commit(context); },
    deactivate(context) { if (state) cancel(context); },
  };
}
