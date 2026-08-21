import { documentToViewport, type RenderViewport } from "../../renderer";

export interface CropRectangle { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number; }
export interface CropDocumentSize { readonly width: number; readonly height: number; }
export type CropHandle = "north-west" | "north" | "north-east" | "east" | "south-east" | "south" | "south-west" | "west" | "move";
export interface CropPoint { readonly x: number; readonly y: number; }

const HANDLE_RADIUS = 10;
const MIN_PREVIEW_SIZE = 1;
export const cropHandleOrder: readonly Exclude<CropHandle, "move">[] = ["north-west", "north", "north-east", "east", "south-east", "south", "south-west", "west"];
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
export const fullDocumentCrop = (document: CropDocumentSize): CropRectangle => ({ left: 0, top: 0, right: document.width, bottom: document.height });
export const cropWidth = (rectangle: CropRectangle) => rectangle.right - rectangle.left;
export const cropHeight = (rectangle: CropRectangle) => rectangle.bottom - rectangle.top;

export function cropHandlePoints(rectangle: CropRectangle): readonly CropPoint[] {
  const centerX = (rectangle.left + rectangle.right) / 2, centerY = (rectangle.top + rectangle.bottom) / 2;
  return [{ x: rectangle.left, y: rectangle.top }, { x: centerX, y: rectangle.top }, { x: rectangle.right, y: rectangle.top }, { x: rectangle.right, y: centerY }, { x: rectangle.right, y: rectangle.bottom }, { x: centerX, y: rectangle.bottom }, { x: rectangle.left, y: rectangle.bottom }, { x: rectangle.left, y: centerY }];
}
export function hitCropHandle(rectangle: CropRectangle, viewportPoint: CropPoint, documentPoint: CropPoint, viewport: RenderViewport): CropHandle | undefined {
  const projected = cropHandlePoints(rectangle).map(point => documentToViewport(point, viewport));
  const priority = [0, 2, 4, 6, 1, 3, 5, 7];
  const index = priority.find(candidate => Math.hypot(projected[candidate]!.x - viewportPoint.x, projected[candidate]!.y - viewportPoint.y) <= HANDLE_RADIUS);
  if (index !== undefined) return cropHandleOrder[index];
  return documentPoint.x >= rectangle.left && documentPoint.x <= rectangle.right && documentPoint.y >= rectangle.top && documentPoint.y <= rectangle.bottom ? "move" : undefined;
}
export function moveCropRectangle(rectangle: CropRectangle, delta: CropPoint, document: CropDocumentSize): CropRectangle {
  if (![delta.x, delta.y].every(Number.isFinite)) throw new RangeError("Crop movement must be finite");
  const width = cropWidth(rectangle), height = cropHeight(rectangle); const left = clamp(rectangle.left + delta.x, 0, Math.max(0, document.width - width)); const top = clamp(rectangle.top + delta.y, 0, Math.max(0, document.height - height));
  return { left, top, right: left + width, bottom: top + height };
}
export function resizeCropRectangle(rectangle: CropRectangle, handle: CropHandle, point: CropPoint, document: CropDocumentSize): CropRectangle {
  if (![point.x, point.y, document.width, document.height].every(Number.isFinite)) throw new RangeError("Crop geometry must be finite");
  let { left, top, right, bottom } = rectangle;
  if (handle.includes("west")) left = clamp(point.x, 0, right - MIN_PREVIEW_SIZE);
  if (handle.includes("east")) right = clamp(point.x, left + MIN_PREVIEW_SIZE, document.width);
  if (handle.includes("north")) top = clamp(point.y, 0, bottom - MIN_PREVIEW_SIZE);
  if (handle.includes("south")) bottom = clamp(point.y, top + MIN_PREVIEW_SIZE, document.height);
  return { left, top, right, bottom };
}
export function snapCropRectangle(rectangle: CropRectangle, document: CropDocumentSize): CropRectangle {
  if (![rectangle.left, rectangle.top, rectangle.right, rectangle.bottom, document.width, document.height].every(Number.isFinite)) throw new RangeError("Crop geometry must be finite");
  const width = Math.floor(document.width), height = Math.floor(document.height); if (width < 1 || height < 1) throw new RangeError("Document dimensions must contain at least one pixel");
  let left = clamp(Math.round(Math.min(rectangle.left, rectangle.right)), 0, width); let right = clamp(Math.round(Math.max(rectangle.left, rectangle.right)), 0, width); let top = clamp(Math.round(Math.min(rectangle.top, rectangle.bottom)), 0, height); let bottom = clamp(Math.round(Math.max(rectangle.top, rectangle.bottom)), 0, height);
  if (right <= left) { if (left < width) right = left + 1; else left = right - 1; }
  if (bottom <= top) { if (top < height) bottom = top + 1; else top = bottom - 1; }
  return { left, top, right, bottom };
}
export function isFullDocumentCrop(rectangle: CropRectangle, document: CropDocumentSize): boolean { return rectangle.left === 0 && rectangle.top === 0 && rectangle.right === document.width && rectangle.bottom === document.height; }
