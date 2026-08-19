import type { RenderInput, RenderViewport } from "./contracts";

export interface ViewportPoint { readonly x: number; readonly y: number; }
export interface ViewportRect { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface DocumentSize { readonly width: number; readonly height: number; }
export const MIN_ZOOM = 0.01;
export const MAX_ZOOM = 64;

/** `offsetX/Y` is the logical viewport position of document-space origin (0, 0). */
export function clampZoom(zoom: number): number { if (!Number.isFinite(zoom)) throw new RangeError("Zoom must be finite"); return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)); }
export function documentToViewport(point: ViewportPoint, viewport: RenderViewport): ViewportPoint { return { x: point.x * viewport.zoom + viewport.offsetX, y: point.y * viewport.zoom + viewport.offsetY }; }
export function viewportToDocument(point: ViewportPoint, viewport: RenderViewport): ViewportPoint { return { x: (point.x - viewport.offsetX) / viewport.zoom, y: (point.y - viewport.offsetY) / viewport.zoom }; }
export function physicalSurfaceSize(viewport: RenderViewport): { width: number; height: number } { return { width: Math.max(1, Math.round(viewport.width * viewport.devicePixelRatio)), height: Math.max(1, Math.round(viewport.height * viewport.devicePixelRatio)) }; }
export function documentBounds(document: DocumentSize, viewport: RenderViewport): ViewportRect { const origin = documentToViewport({ x: 0, y: 0 }, viewport); return { x: origin.x, y: origin.y, width: document.width * viewport.zoom, height: document.height * viewport.zoom }; }
export function withZoom(viewport: RenderViewport, zoom: number): RenderViewport { return { ...viewport, zoom: clampZoom(zoom) }; }
export function zoomAround(viewport: RenderViewport, point: ViewportPoint, zoom: number): RenderViewport { const documentPoint = viewportToDocument(point, viewport); const nextZoom = clampZoom(zoom); return { ...viewport, zoom: nextZoom, offsetX: point.x - documentPoint.x * nextZoom, offsetY: point.y - documentPoint.y * nextZoom }; }
export function panTo(viewport: RenderViewport, offset: ViewportPoint): RenderViewport { return { ...viewport, offsetX: offset.x, offsetY: offset.y }; }
export function panBy(viewport: RenderViewport, delta: ViewportPoint): RenderViewport { return panTo(viewport, { x: viewport.offsetX + delta.x, y: viewport.offsetY + delta.y }); }
export function fitDocument(document: DocumentSize, viewport: RenderViewport, padding = 32): RenderViewport { const inset = Math.max(0, padding) * 2; const zoom = clampZoom(Math.min(Math.max(1, viewport.width - inset) / document.width, Math.max(1, viewport.height - inset) / document.height)); return centerDocument(document, { ...viewport, zoom }); }
export function fitWidth(document: DocumentSize, viewport: RenderViewport, padding = 32): RenderViewport { const zoom = clampZoom(Math.max(1, viewport.width - Math.max(0, padding) * 2) / document.width); return centerDocument(document, { ...viewport, zoom }); }
export function actualSize(document: DocumentSize, viewport: RenderViewport): RenderViewport { return centerDocument(document, { ...viewport, zoom: 1 }); }
export function centerDocument(document: DocumentSize, viewport: RenderViewport): RenderViewport { return { ...viewport, offsetX: (viewport.width - document.width * viewport.zoom) / 2, offsetY: (viewport.height - document.height * viewport.zoom) / 2 }; }
export function inputSize(input: RenderInput): DocumentSize { return { width: input.width, height: input.height }; }
