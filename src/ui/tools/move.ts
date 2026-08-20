import { SetTransformCommand, type Transform } from "../../core";
import { affineFromTransform, identityAffine, invertAffine, multiplyAffine, transformVector, type AffineTransform } from "../../renderer";
import type { EditorLayerView, EditorSessionSnapshot } from "../editor";
import type { ToolContext, ToolController, ToolPointerInput } from "./contracts";

interface MoveState {
  readonly layerId: string;
  readonly original: Transform;
  readonly start: { readonly x: number; readonly y: number };
  readonly parentInverse: AffineTransform;
  readonly documentRevision: number;
}

const POSITION_EPSILON = 1e-9;

function cloneTransform(transform: Transform): Transform { return { position: { ...transform.position }, scale: { ...transform.scale }, rotation: transform.rotation }; }
function finiteTransform(transform: Transform): boolean { return [transform.position.x, transform.position.y, transform.scale.x, transform.scale.y, transform.rotation].every(Number.isFinite); }
function layerMap(snapshot: EditorSessionSnapshot): ReadonlyMap<string, EditorLayerView> {
  const map = new Map<string, EditorLayerView>();
  const visit = (layer: EditorLayerView) => { map.set(layer.id, layer); layer.children.forEach(visit); };
  snapshot.document.layers.forEach(visit);
  return map;
}
/** Eligibility is intentionally narrow today so future locks can extend this one boundary. */
function isEligible(layer: EditorLayerView, layers: ReadonlyMap<string, EditorLayerView>): boolean {
  if (!layer.visible) return false;
  let parentId = layer.parentId;
  while (parentId) { const parent = layers.get(parentId); if (!parent || !parent.visible) return false; parentId = parent.parentId; }
  return finiteTransform(layer.transform);
}
function parentWorldAffine(layer: EditorLayerView, layers: ReadonlyMap<string, EditorLayerView>): AffineTransform | undefined {
  const chain: EditorLayerView[] = [];
  let parentId = layer.parentId;
  while (parentId) { const parent = layers.get(parentId); if (!parent || !finiteTransform(parent.transform)) return undefined; chain.push(parent); parentId = parent.parentId; }
  return chain.reverse().reduce((world, parent) => multiplyAffine(world, affineFromTransform(parent.transform)), identityAffine());
}
function positionChanged(first: Transform, second: Transform): boolean { return Math.abs(first.position.x - second.position.x) > POSITION_EPSILON || Math.abs(first.position.y - second.position.y) > POSITION_EPSILON; }

/**
 * Canonical first editing tool: selected-layer-only, preview-first Move.
 * The renderer receives a document-space translation while this controller keeps the parent-local
 * transform that will be committed through the Core command boundary on pointer up.
 */
export function createMoveToolController(): ToolController {
  let state: MoveState | undefined;
  const cancel = (context: ToolContext) => { state = undefined; context.cancelPreview(); };
  const update = (input: ToolPointerInput, context: ToolContext): Transform | undefined => {
    const current = state;
    if (!current) return undefined;
    const snapshot = context.getSessionSnapshot();
    if (snapshot.documentRevision !== current.documentRevision || snapshot.selectedLayerId !== current.layerId) { cancel(context); return undefined; }
    const documentDelta = { x: input.document.x - current.start.x, y: input.document.y - current.start.y };
    if (![documentDelta.x, documentDelta.y].every(Number.isFinite)) { cancel(context); return undefined; }
    const localDelta = transformVector(current.parentInverse, documentDelta);
    const transform: Transform = { position: { x: current.original.position.x + localDelta.x, y: current.original.position.y + localDelta.y }, scale: { ...current.original.scale }, rotation: current.original.rotation };
    if (!finiteTransform(transform)) { cancel(context); return undefined; }
    context.updatePreview({ kind: "move-layer", toolId: "move", layerId: current.layerId, start: current.start, current: input.document, transform, documentDelta });
    context.setRendererTransformPreview({ layerId: current.layerId, documentDelta });
    return transform;
  };
  return {
    pointerDown(input, context) {
      const snapshot = context.getSessionSnapshot();
      const selectedLayerId = snapshot.selectedLayerId;
      if (!selectedLayerId) return false;
      const layers = layerMap(snapshot); const target = layers.get(selectedLayerId);
      if (!target || !isEligible(target, layers)) return false;
      const parentWorld = target.parentId === null ? identityAffine() : parentWorldAffine(target, layers);
      if (!parentWorld) return false;
      const parentInverse = invertAffine(parentWorld);
      if (!parentInverse) return false;
      state = { layerId: target.id, original: cloneTransform(target.transform), start: input.document, parentInverse, documentRevision: snapshot.documentRevision };
      context.beginPreview({ kind: "move-layer", toolId: "move", layerId: target.id, start: input.document, current: input.document, transform: state.original, documentDelta: { x: 0, y: 0 } });
      context.setRendererTransformPreview({ layerId: target.id, documentDelta: { x: 0, y: 0 } });
      return true;
    },
    pointerMove(input, context) { update(input, context); },
    pointerUp(input, context) {
      const current = state; const transform = update(input, context);
      if (!current || !transform) return;
      state = undefined;
      if (!positionChanged(current.original, transform)) { context.completePreview(); return; }
      const result = context.commit(new SetTransformCommand(current.layerId, transform));
      if (!result.ok) throw new Error(result.error ?? "Move command failed");
    },
    pointerCancel(context) { cancel(context); },
    keyDown(input, context) { if (input.key === "Escape" && state) { cancel(context); return true; } },
    deactivate(context) { if (state) cancel(context); },
  };
}
