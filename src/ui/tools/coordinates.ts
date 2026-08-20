import { viewportToDocument, type RenderViewport } from "../../renderer";

export interface ClientPoint { readonly x: number; readonly y: number; }
export interface SurfaceRect { readonly left: number; readonly top: number; readonly width: number; readonly height: number; }
export interface ViewportPoint { readonly x: number; readonly y: number; }

/** Converts CSS/client pixels to logical viewport coordinates. DPR remains renderer-only. */
export function clientToViewport(point: ClientPoint, rect: SurfaceRect, viewport: Pick<RenderViewport, "width" | "height">): ViewportPoint {
  if (rect.width <= 0 || rect.height <= 0) throw new RangeError("Surface rectangle must have positive dimensions");
  return { x: (point.x - rect.left) * viewport.width / rect.width, y: (point.y - rect.top) * viewport.height / rect.height };
}
export function clientToDocument(point: ClientPoint, rect: SurfaceRect, viewport: RenderViewport): ViewportPoint { return viewportToDocument(clientToViewport(point, rect, viewport), viewport); }
