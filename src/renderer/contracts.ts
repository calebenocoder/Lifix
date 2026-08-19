import type { Document } from "../core";

/** Rendering abstraction; concrete WebGPU/native backends belong behind this contract. */
export interface RenderViewport { width: number; height: number; devicePixelRatio: number; }
export interface RenderOptions { viewport: RenderViewport; dirtyRegion?: { x: number; y: number; width: number; height: number }; }
export interface Renderer { initialize(): Promise<void>; render(document: Document, options: RenderOptions): Promise<void>; dispose(): void; }
export interface RenderCache { invalidate(documentId: string): void; clear(): void; }

