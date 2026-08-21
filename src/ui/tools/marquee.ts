import { ClearPixelSelectionCommand, clipPixelSelectionToDocument, createRectangularPixelSelection, SetPixelSelectionCommand } from "../../core";
import type { ToolContext, ToolController, ToolPointerInput } from "./contracts";

interface MarqueeState { readonly start: { readonly x: number; readonly y: number }; readonly documentRevision: number; }
const MINIMUM_DOCUMENT_SIZE = 1e-6;
function sameSelection(first: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number } | null, second: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }): boolean { return Boolean(first && first.left === second.left && first.top === second.top && first.right === second.right && first.bottom === second.bottom); }

/** Rectangle-only Replace mode. Future add/subtract/intersect and masks remain Core evolution work. */
export function createRectangularMarqueeController(): ToolController {
  let state: MarqueeState | undefined;
  const cancel = (context: ToolContext) => { state = undefined; context.cancelPreview(); };
  const update = (input: ToolPointerInput, context: ToolContext): { readonly start: { readonly x: number; readonly y: number }; readonly current: { readonly x: number; readonly y: number } } | undefined => {
    const current = state; if (!current) return undefined;
    if (context.getSessionSnapshot().documentRevision !== current.documentRevision || !Number.isFinite(input.document.x) || !Number.isFinite(input.document.y)) { cancel(context); return undefined; }
    context.updatePreview({ kind: "rectangular-marquee", toolId: "marquee", start: current.start, current: input.document });
    return { start: current.start, current: input.document };
  };
  return {
    sessionChanged(context) { if (state && context.getSessionSnapshot().documentRevision !== state.documentRevision) cancel(context); },
    pointerDown(input, context) {
      if (![input.document.x, input.document.y].every(Number.isFinite)) return false;
      state = { start: input.document, documentRevision: context.getSessionSnapshot().documentRevision };
      context.beginPreview({ kind: "rectangular-marquee", toolId: "marquee", start: input.document, current: input.document });
      return true;
    },
    pointerMove(input, context) { update(input, context); },
    pointerUp(input, context) {
      const preview = update(input, context); const active = state; state = undefined;
      if (!preview || !active) return;
      const raw = createRectangularPixelSelection(preview.start, preview.current);
      const width = raw.right - raw.left; const height = raw.bottom - raw.top;
      const snapshot = context.getSessionSnapshot();
      if (width <= MINIMUM_DOCUMENT_SIZE || height <= MINIMUM_DOCUMENT_SIZE) { if (snapshot.pixelSelection) { const result = context.commit(new ClearPixelSelectionCommand()); if (!result.ok) throw new Error(result.error ?? "Clear pixel selection failed"); } else context.completePreview(); return; }
      const clipped = clipPixelSelectionToDocument(raw, snapshot.document);
      if (!clipped) { if (snapshot.pixelSelection) { const result = context.commit(new ClearPixelSelectionCommand()); if (!result.ok) throw new Error(result.error ?? "Clear pixel selection failed"); } else context.completePreview(); return; }
      if (sameSelection(snapshot.pixelSelection, clipped)) { context.completePreview(); return; }
      const result = context.commit(new SetPixelSelectionCommand(clipped));
      if (!result.ok) throw new Error(result.error ?? "Set pixel selection failed");
    },
    pointerCancel(context) { cancel(context); },
    deactivate(context) { if (state) cancel(context); },
  };
}
