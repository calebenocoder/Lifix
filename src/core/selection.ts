import type { Document } from "./document";

/**
 * Current geometric selection model. Future variants can add coverage-mask and path-backed
 * selections without changing the distinction between document pixel selection and layer targeting.
 */
export interface RectangularPixelSelection { readonly kind: "rectangle"; readonly left: number; readonly top: number; readonly right: number; readonly bottom: number; }
export type PixelSelection = RectangularPixelSelection;
export interface PixelSelectionBounds { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number; }

function finite(value: number, label: string): number { if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`); return value; }
/** Normalizes arbitrary drag corners into the stable [left, right] × [top, bottom] representation. */
export function createRectangularPixelSelection(first: { readonly x: number; readonly y: number }, second: { readonly x: number; readonly y: number }): RectangularPixelSelection {
  const x1 = finite(first.x, "Selection x"); const y1 = finite(first.y, "Selection y"); const x2 = finite(second.x, "Selection x"); const y2 = finite(second.y, "Selection y");
  return { kind: "rectangle", left: Math.min(x1, x2), top: Math.min(y1, y2), right: Math.max(x1, x2), bottom: Math.max(y1, y2) };
}
export function clonePixelSelection(selection: PixelSelection | null | undefined): PixelSelection | null { return selection ? { ...selection } : null; }
export function pixelSelectionBounds(selection: PixelSelection | null | undefined): PixelSelectionBounds | undefined { return selection ? { left: selection.left, top: selection.top, right: selection.right, bottom: selection.bottom } : undefined; }
export function hasPixelSelection(document: Pick<Document, "pixelSelection">): boolean { return document.pixelSelection !== null; }
export function getPixelSelection(document: Pick<Document, "pixelSelection">): PixelSelection | undefined { return document.pixelSelection ? clonePixelSelection(document.pixelSelection) ?? undefined : undefined; }
export function getPixelSelectionBounds(document: Pick<Document, "pixelSelection">): PixelSelectionBounds | undefined { return pixelSelectionBounds(document.pixelSelection); }
/** Clips a selection to document geometry [0,width] × [0,height]; an empty intersection is no selection. */
export function clipPixelSelectionToDocument(selection: PixelSelection, document: Pick<Document, "width" | "height">): PixelSelection | null {
  if (!Number.isFinite(document.width) || !Number.isFinite(document.height) || document.width <= 0 || document.height <= 0) throw new RangeError("Document dimensions must be positive finite values");
  validatePixelSelection(selection);
  const left = Math.max(0, selection.left); const top = Math.max(0, selection.top); const right = Math.min(document.width, selection.right); const bottom = Math.min(document.height, selection.bottom);
  return right > left && bottom > top ? { kind: "rectangle", left, top, right, bottom } : null;
}
export function validatePixelSelection(selection: PixelSelection): void {
  if (selection.kind !== "rectangle") throw new Error("Unsupported pixel selection kind");
  [selection.left, selection.top, selection.right, selection.bottom].forEach(value => finite(value, "Pixel selection coordinate"));
  if (selection.left > selection.right || selection.top > selection.bottom) throw new RangeError("Pixel selection bounds must be normalized");
}
/** Core-owned mutation helper used exclusively by selection commands. */
export function setPixelSelection(document: Document, selection: PixelSelection | null): void { document.pixelSelection = selection ? clipPixelSelectionToDocument(selection, document) : null; }
