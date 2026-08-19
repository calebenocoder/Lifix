import type { BlendMode, GroupCompositingMode, RasterDataReference, Transform } from "../core";
import type { RasterResourceErrorCode } from "./raster-source";

/** Immutable renderer-facing data. The renderer never receives a mutable Document. */
export interface RenderInput { readonly documentId: string; readonly width: number; readonly height: number; readonly rootLayerIds: readonly string[]; readonly layers: Readonly<Record<string, RenderLayer>>; }
export interface RenderLayerBase { readonly id: string; readonly name: string; readonly visible: boolean; readonly opacity: number; readonly blendMode: BlendMode; readonly transform: Transform; readonly parentId: string | null; }
export interface RenderRasterLayer extends RenderLayerBase { readonly kind: "raster"; readonly raster: RasterDataReference; }
export interface RenderGroupLayer extends RenderLayerBase { readonly kind: "group"; readonly compositing: GroupCompositingMode; readonly childLayerIds: readonly string[]; }
export type RenderLayer = RenderRasterLayer | RenderGroupLayer;
/** Viewport state belongs to the renderer, never to a Document. */
export interface RenderViewport { readonly width: number; readonly height: number; readonly devicePixelRatio: number; readonly zoom: number; readonly offsetX: number; readonly offsetY: number; }
export interface PhysicalSurfaceSize { readonly width: number; readonly height: number; }
export interface DirtyRegion { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface RenderOptions { readonly dirtyRegion?: DirtyRegion; }
export type RenderBackendKind = "webgpu" | "canvas2d";
export type RendererStatus = "idle" | "initializing" | "ready" | "fallback" | "unavailable" | "disposed";
export type RendererErrorCode = "surface-unavailable" | "webgpu-unavailable" | "webgpu-initialization-failed" | "fallback-unavailable" | "render-failed";
export interface RendererError { readonly code: RendererErrorCode; readonly message: string; readonly cause?: unknown; }
export interface RendererIssue { readonly code: RasterResourceErrorCode; readonly message: string; readonly layerId: string; readonly sourceId?: string; readonly cause?: unknown; }
export interface RendererStatusDetail { readonly status: RendererStatus; readonly backend?: RenderBackendKind; readonly error?: RendererError; readonly issues?: readonly RendererIssue[]; }
export interface Renderer { readonly status: RendererStatus; readonly detail: RendererStatusDetail; readonly viewport: RenderViewport; attach(surface: HTMLCanvasElement): void; initialize(): Promise<void>; resize(viewport: RenderViewport): void; setZoom(zoom: number): void; zoomBy(factor: number, point?: { x: number; y: number }): void; zoomAt(point: { x: number; y: number }, zoom: number): void; setPan(offset: { x: number; y: number }): void; panBy(delta: { x: number; y: number }): void; fitDocument(input: RenderInput, padding?: number): void; fitWidth(input: RenderInput, padding?: number): void; actualSize(input: RenderInput): void; render(input?: RenderInput, options?: RenderOptions): Promise<void>; invalidate(): void; dispose(): void; }
export interface RenderCache { invalidate(documentId: string, dirtyRegion?: DirtyRegion): void; clear(): void; }
