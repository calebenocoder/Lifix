import type { Transform } from "../../core";
import { affineFromTransform, identityAffine, invertAffine, multiplyAffine, transformPoint, transformVector, type AffineTransform } from "../../renderer";
import type { EditorLayerView, EditorSessionSnapshot } from "../editor";

export interface TransformRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface TransformBoxGeometry { readonly corners: readonly [Point, Point, Point, Point]; readonly pivot: Point; }
export interface Point { readonly x: number; readonly y: number; }
export type TransformHandle = "north-west" | "north" | "north-east" | "east" | "south-east" | "south" | "south-west" | "west" | "rotate" | "move";
export interface TransformTarget {
  readonly layerId: string;
  readonly original: Transform;
  readonly localBounds: TransformRect;
  readonly parentWorld: AffineTransform;
  readonly parentInverse: AffineTransform;
  readonly originalWorld: AffineTransform;
  readonly originalWorldInverse: AffineTransform;
  readonly box: TransformBoxGeometry;
  readonly documentRevision: number;
}
export type RasterBoundsProvider = (layer: EditorLayerView) => TransformRect | undefined;

const MIN_SCALE = 1e-4;
const finiteTransform = (value: Transform) => [value.position.x, value.position.y, value.scale.x, value.scale.y, value.rotation].every(Number.isFinite);
export const cloneTransform = (value: Transform): Transform => ({ position: { ...value.position }, scale: { ...value.scale }, rotation: value.rotation });

function createLayerMap(snapshot: EditorSessionSnapshot): ReadonlyMap<string, EditorLayerView> {
  const map = new Map<string, EditorLayerView>();
  const visit = (layer: EditorLayerView) => { map.set(layer.id, layer); layer.children.forEach(visit); };
  snapshot.document.layers.forEach(visit);
  return map;
}
function eligible(layer: EditorLayerView, layers: ReadonlyMap<string, EditorLayerView>): boolean {
  if (!layer.visible || !finiteTransform(layer.transform)) return false;
  let parentId = layer.parentId;
  while (parentId) { const parent = layers.get(parentId); if (!parent?.visible || !finiteTransform(parent.transform)) return false; parentId = parent.parentId; }
  return true;
}
function parentWorld(layer: EditorLayerView, layers: ReadonlyMap<string, EditorLayerView>): AffineTransform | undefined {
  const chain: EditorLayerView[] = [];
  let parentId = layer.parentId;
  while (parentId) { const parent = layers.get(parentId); if (!parent) return undefined; chain.push(parent); parentId = parent.parentId; }
  return chain.reverse().reduce((value, parent) => multiplyAffine(value, affineFromTransform(parent.transform)), identityAffine());
}
function boundsFromPoints(points: readonly Point[]): TransformRect | undefined {
  if (!points.length || points.some(point => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return undefined;
  const xs = points.map(point => point.x); const ys = points.map(point => point.y);
  const x = Math.min(...xs); const y = Math.min(...ys); const right = Math.max(...xs); const bottom = Math.max(...ys);
  return { x, y, width: right - x, height: bottom - y };
}
function rectPoints(rect: TransformRect): readonly [Point, Point, Point, Point] { return [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }]; }
function localBounds(layer: EditorLayerView, rasterBounds: RasterBoundsProvider): TransformRect | undefined {
  if (layer.kind === "raster") return rasterBounds(layer);
  const points: Point[] = [];
  for (const child of layer.children) {
    if (!child.visible) continue;
    const bounds = localBounds(child, rasterBounds);
    if (!bounds) continue;
    const transform = affineFromTransform(child.transform);
    points.push(...rectPoints(bounds).map(point => transformPoint(transform, point)));
  }
  return boundsFromPoints(points);
}
export function transformBox(transform: AffineTransform, bounds: TransformRect): TransformBoxGeometry {
  const corners = rectPoints(bounds).map(point => transformPoint(transform, point)) as unknown as readonly [Point, Point, Point, Point];
  return { corners, pivot: transformPoint(transform, { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }) };
}
export function resolveTransformTarget(snapshot: EditorSessionSnapshot, layerId: string, rasterBounds: RasterBoundsProvider): TransformTarget | undefined {
  const layers = createLayerMap(snapshot); const layer = layers.get(layerId);
  if (!layer || !eligible(layer, layers)) return undefined;
  const bounds = localBounds(layer, rasterBounds);
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return undefined;
  const parent = parentWorld(layer, layers); if (!parent) return undefined;
  const parentInverse = invertAffine(parent); if (!parentInverse) return undefined;
  const world = multiplyAffine(parent, affineFromTransform(layer.transform)); const worldInverse = invertAffine(world); if (!worldInverse) return undefined;
  return { layerId, original: cloneTransform(layer.transform), localBounds: bounds, parentWorld: parent, parentInverse, originalWorld: world, originalWorldInverse: worldInverse, box: transformBox(world, bounds), documentRevision: snapshot.documentRevision };
}

function safeFactor(value: number): number { if (!Number.isFinite(value)) return 1; return Math.abs(value) < MIN_SCALE ? (value < 0 ? -MIN_SCALE : MIN_SCALE) : value; }
function handlePoints(bounds: TransformRect, handle: TransformHandle): { handle: Point; anchor: Point; x: boolean; y: boolean } {
  const left = bounds.x, right = bounds.x + bounds.width, top = bounds.y, bottom = bounds.y + bounds.height, cx = (left + right) / 2, cy = (top + bottom) / 2;
  const table: Record<Exclude<TransformHandle, "rotate" | "move">, { handle: Point; anchor: Point; x: boolean; y: boolean }> = {
    "north-west": { handle: { x: left, y: top }, anchor: { x: right, y: bottom }, x: true, y: true }, north: { handle: { x: cx, y: top }, anchor: { x: cx, y: bottom }, x: false, y: true }, "north-east": { handle: { x: right, y: top }, anchor: { x: left, y: bottom }, x: true, y: true }, east: { handle: { x: right, y: cy }, anchor: { x: left, y: cy }, x: true, y: false }, "south-east": { handle: { x: right, y: bottom }, anchor: { x: left, y: top }, x: true, y: true }, south: { handle: { x: cx, y: bottom }, anchor: { x: cx, y: top }, x: false, y: true }, "south-west": { handle: { x: left, y: bottom }, anchor: { x: right, y: top }, x: true, y: true }, west: { handle: { x: left, y: cy }, anchor: { x: right, y: cy }, x: true, y: false },
  };
  return table[handle as Exclude<TransformHandle, "rotate" | "move">];
}
function preserveLocalPivot(original: Transform, candidate: Transform, pivot: Point): Transform {
  const before = transformPoint(affineFromTransform(original), pivot); const after = transformPoint(affineFromTransform(candidate), pivot);
  return { ...candidate, position: { x: candidate.position.x + before.x - after.x, y: candidate.position.y + before.y - after.y } };
}
export function scaleTransform(target: TransformTarget, handle: TransformHandle, documentPoint: Point, preserveAspect = false): Transform {
  const definition = handlePoints(target.localBounds, handle); const local = transformPoint(target.originalWorldInverse, documentPoint);
  let fx = definition.x ? (local.x - definition.anchor.x) / (definition.handle.x - definition.anchor.x) : 1;
  let fy = definition.y ? (local.y - definition.anchor.y) / (definition.handle.y - definition.anchor.y) : 1;
  if (preserveAspect && definition.x && definition.y) { const factor = Math.abs(fx) >= Math.abs(fy) ? fx : fy; fx = factor; fy = factor; }
  fx = safeFactor(fx); fy = safeFactor(fy);
  const candidate: Transform = { position: { ...target.original.position }, scale: { x: target.original.scale.x * fx, y: target.original.scale.y * fy }, rotation: target.original.rotation };
  return preserveLocalPivot(target.original, candidate, definition.anchor);
}
function normalizeAngle(value: number): number { let result = value % 360; if (result > 180) result -= 360; if (result < -180) result += 360; return result; }
export function rotateTransform(target: TransformTarget, startDocumentPoint: Point, documentPoint: Point, snap = false): Transform {
  const pivotLocal = { x: target.localBounds.x + target.localBounds.width / 2, y: target.localBounds.y + target.localBounds.height / 2 };
  const pivot = transformPoint(affineFromTransform(target.original), pivotLocal); const start = transformPoint(target.parentInverse, startDocumentPoint); const current = transformPoint(target.parentInverse, documentPoint);
  const delta = normalizeAngle((Math.atan2(current.y - pivot.y, current.x - pivot.x) - Math.atan2(start.y - pivot.y, start.x - pivot.x)) * 180 / Math.PI);
  const rotation = snap ? Math.round((target.original.rotation + delta) / 15) * 15 : target.original.rotation + delta;
  return preserveLocalPivot(target.original, { position: { ...target.original.position }, scale: { ...target.original.scale }, rotation }, pivotLocal);
}
export function moveTransform(target: TransformTarget, startDocumentPoint: Point, documentPoint: Point): Transform {
  const delta = transformVector(target.parentInverse, { x: documentPoint.x - startDocumentPoint.x, y: documentPoint.y - startDocumentPoint.y });
  return { position: { x: target.original.position.x + delta.x, y: target.original.position.y + delta.y }, scale: { ...target.original.scale }, rotation: target.original.rotation };
}
export function previewDocumentTransform(target: TransformTarget, transform: Transform): AffineTransform {
  return multiplyAffine(multiplyAffine(target.parentWorld, affineFromTransform(transform)), target.originalWorldInverse);
}
export function transformedTargetBox(target: TransformTarget, transform: Transform): TransformBoxGeometry { return transformBox(multiplyAffine(target.parentWorld, affineFromTransform(transform)), target.localBounds); }
