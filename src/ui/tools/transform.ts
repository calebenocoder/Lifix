import { SetTransformCommand, type Transform } from "../../core";
import { documentToViewport } from "../../renderer";
import type { ToolContext, ToolController, ToolPointerInput } from "./contracts";
import { moveTransform, previewDocumentTransform, rotateTransform, scaleTransform, transformedTargetBox, type Point, type TransformHandle, type TransformTarget } from "./transform-engine";

interface State { readonly target: TransformTarget; readonly handle: TransformHandle; readonly start: Point; transform: Transform; }
const HANDLE_RADIUS = 10;
const TRANSFORM_EPSILON = 1e-8;
const handles: readonly TransformHandle[] = ["north-west", "north", "north-east", "east", "south-east", "south", "south-west", "west"];
const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function viewportGeometry(target: TransformTarget, context: ToolContext): { points: readonly Point[]; rotate: Point } {
  const points = target.box.corners.map(point => documentToViewport(point, context.getViewport()));
  const top = midpoint(points[0]!, points[1]!); const pivot = documentToViewport(target.box.pivot, context.getViewport()); const dx = top.x - pivot.x, dy = top.y - pivot.y, length = Math.hypot(dx, dy) || 1;
  return { points: [points[0]!, midpoint(points[0]!, points[1]!), points[1]!, midpoint(points[1]!, points[2]!), points[2]!, midpoint(points[2]!, points[3]!), points[3]!, midpoint(points[3]!, points[0]!)], rotate: { x: top.x + dx / length * 28, y: top.y + dy / length * 28 } };
}
function inside(point: Point, corners: readonly Point[]): boolean {
  let sign = 0;
  for (let index = 0; index < corners.length; index += 1) { const a = corners[index]!, b = corners[(index + 1) % corners.length]!; const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x); if (Math.abs(cross) < 1e-8) continue; const next = Math.sign(cross); if (sign && sign !== next) return false; sign = next; }
  return true;
}
export function hitTransformHandle(target: TransformTarget, viewportPoint: Point, context: ToolContext): TransformHandle | undefined {
  const geometry = viewportGeometry(target, context);
  if (distance(viewportPoint, geometry.rotate) <= HANDLE_RADIUS + 2) return "rotate";
  const hitOrder = [0, 2, 4, 6, 1, 3, 5, 7];
  const index = hitOrder.find(candidate => distance(viewportPoint, geometry.points[candidate]!) <= HANDLE_RADIUS);
  if (index !== undefined) return handles[index];
  const corners = [geometry.points[0]!, geometry.points[2]!, geometry.points[4]!, geometry.points[6]!];
  return inside(viewportPoint, corners) ? "move" : undefined;
}
function equalTransform(first: Transform, second: Transform): boolean { return [first.position.x - second.position.x, first.position.y - second.position.y, first.scale.x - second.scale.x, first.scale.y - second.scale.y, first.rotation - second.rotation].every(value => Math.abs(value) <= TRANSFORM_EPSILON); }

/** Preview-first transform controller. Core receives exactly one SetTransformCommand on commit. */
export function createTransformToolController(): ToolController {
  let state: State | undefined;
  const currentTarget = (context: ToolContext) => { const id = context.getSessionSnapshot().selectedLayerId; return id ? context.getTransformTarget(id) : undefined; };
  const refreshBox = (context: ToolContext) => context.setTransformBox(currentTarget(context)?.box);
  const cancel = (context: ToolContext) => { state = undefined; context.cancelPreview(); refreshBox(context); };
  const update = (input: ToolPointerInput, context: ToolContext): Transform | undefined => {
    const current = state; if (!current) return undefined;
    const snapshot = context.getSessionSnapshot(); if (snapshot.documentRevision !== current.target.documentRevision || snapshot.selectedLayerId !== current.target.layerId) { cancel(context); return undefined; }
    const transform = current.handle === "move" ? moveTransform(current.target, current.start, input.document) : current.handle === "rotate" ? rotateTransform(current.target, current.start, input.document, input.modifiers.shift) : scaleTransform(current.target, current.handle, input.document, input.modifiers.shift);
    current.transform = transform;
    context.updatePreview({ kind: "transform-layer", toolId: "transform", layerId: current.target.layerId, transform });
    context.setRendererTransformPreview({ layerId: current.target.layerId, documentTransform: previewDocumentTransform(current.target, transform) });
    context.setTransformBox(transformedTargetBox(current.target, transform));
    return transform;
  };
  return {
    activate(context) { refreshBox(context); },
    sessionChanged(context) { const snapshot = context.getSessionSnapshot(); if (state && (snapshot.documentRevision !== state.target.documentRevision || snapshot.selectedLayerId !== state.target.layerId)) cancel(context); else if (!state) refreshBox(context); },
    pointerDown(input, context) {
      const target = currentTarget(context); if (!target) return false;
      const handle = hitTransformHandle(target, input.viewport, context); if (!handle) return false;
      state = { target, handle, start: input.document, transform: target.original };
      context.beginPreview({ kind: "transform-layer", toolId: "transform", layerId: target.layerId, transform: target.original });
      context.setRendererTransformPreview({ layerId: target.layerId, documentTransform: previewDocumentTransform(target, target.original) });
      return true;
    },
    pointerMove(input, context) { update(input, context); },
    pointerUp(input, context) {
      const current = state; const transform = update(input, context); if (!current || !transform) return;
      state = undefined;
      if (equalTransform(current.target.original, transform)) { context.completePreview(); refreshBox(context); return; }
      const result = context.commit(new SetTransformCommand(current.target.layerId, transform)); if (!result.ok) { context.setRendererTransformPreview(); refreshBox(context); throw new Error(result.error ?? "Transform command failed"); } refreshBox(context);
    },
    pointerCancel(context) { cancel(context); },
    keyDown(input, context) { if (input.key === "Escape" && state) { cancel(context); return true; } },
    deactivate(context) { if (state) cancel(context); context.setTransformBox(); },
  };
}
