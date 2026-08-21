import { beginBrushStroke, type BrushStrokeSession } from "../../core";
import { transformPoint, type AffineTransform } from "../../renderer";
import type { ToolContext, ToolController, ToolPointerInput } from "./contracts";

interface BrushState { readonly layerId: string; readonly documentRevision: number; readonly targetAssetId: string; readonly worldInverse: AffineTransform; readonly stroke: BrushStrokeSession; readonly start: { readonly x: number; readonly y: number }; readonly diameter: number; }

/** UI/controller adapter only: it maps document points to a frozen raster target and leaves dabs to Core. */
export function createBrushToolController(): ToolController {
  let state: BrushState | undefined;
  const cancel = (context: ToolContext) => { if (state) state.stroke.cancel(); state = undefined; context.cancelPreview(); };
  const valid = (context: ToolContext, current: BrushState): boolean => { const snapshot = context.getSessionSnapshot(); return snapshot.documentRevision === current.documentRevision && snapshot.selectedLayerId === current.layerId && context.brush?.store.get(current.targetAssetId) !== undefined; };
  const add = (input: ToolPointerInput, context: ToolContext): void => { const current = state; if (!current) return; if (!valid(context, current)) { cancel(context); return; } const local = transformPoint(current.worldInverse, input.document); current.stroke.addSample({ x: local.x, y: local.y, pressure: input.pointerType === "mouse" && input.pressure <= 0 ? 1 : Math.max(0, Math.min(1, input.pressure || 1)), tiltX: input.tiltX, tiltY: input.tiltY, twist: input.twist }); context.updatePreview({ kind: "brush-stroke", toolId: "brush", start: current.start, current: input.document, diameter: current.diameter }); };
  return {
    sessionChanged(context) { if (state && !valid(context, state)) cancel(context); },
    pointerHover(input, context) { const target = context.brush?.resolveTarget(); const snapshot = context.getSessionSnapshot(); if (!target || !snapshot.selectedLayer || snapshot.selectedLayer.kind !== "raster" || !snapshot.selectedLayer.visible) { context.setBrushCursor(); return; } const diameter = snapshot.brushSettings.diameter * (Math.hypot(target.world.a, target.world.b) + Math.hypot(target.world.c, target.world.d)) / 2; context.setBrushCursor({ document: input.document, diameter }); },
    pointerDown(input, context) {
      const bridge = context.brush; const snapshot = context.getSessionSnapshot(); const target = bridge?.resolveTarget(); if (!bridge || !target || !snapshot.selectedLayer || snapshot.selectedLayer.kind !== "raster" || !snapshot.selectedLayer.visible) return false;
      const settings = snapshot.brushSettings; const stroke = beginBrushStroke(bridge.store, { assetId: target.assetId }, { diameter: settings.diameter, hardness: settings.hardness, opacity: settings.opacity, flow: settings.flow, spacing: settings.spacing, color: { ...snapshot.foregroundColor, a: 255 }, pressure: { opacity: 1 } }); state = { layerId: target.layerId, documentRevision: snapshot.documentRevision, targetAssetId: target.assetId, worldInverse: target.worldInverse, stroke, start: input.document, diameter: settings.diameter * (Math.hypot(target.world.a, target.world.b) + Math.hypot(target.world.c, target.world.d)) / 2 };
      context.beginPreview({ kind: "brush-stroke", toolId: "brush", start: input.document, current: input.document, diameter: state.diameter }); add(input, context); return true;
    },
    pointerMove(input, context) { add(input, context); },
    pointerUp(input, context) { const current = state; if (!current) return; add(input, context); if (state !== current) return; current.stroke.finish(); state = undefined; context.completePreview(); },
    pointerCancel(context) { cancel(context); },
    keyDown(input, context) { if (input.key === "Escape" && state) { cancel(context); return true; } },
    deactivate(context) { if (state) cancel(context); context.setBrushCursor(); },
  };
}
