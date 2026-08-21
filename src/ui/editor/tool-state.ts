/** Stable session-owned tool identities. They are not serialized with a Document. */
export type ToolId = "move" | "transform" | "marquee" | "brush" | "eraser" | "crop" | "text" | "shape" | "hand" | "zoom";
export const toolIds: readonly ToolId[] = ["move", "transform", "marquee", "brush", "eraser", "crop", "text", "shape", "hand", "zoom"];

export interface InteractionPreviewPoint { readonly x: number; readonly y: number; }

/** Lightweight, transient interaction data. The renderer never receives this as RenderInput. */
export interface DiagnosticPointerPreview {
  readonly kind: "diagnostic-pointer";
  readonly toolId: ToolId;
  readonly start: InteractionPreviewPoint;
  readonly current: InteractionPreviewPoint;
}

/** Session-owned, transient Move state. The committed document transform remains unchanged until pointer up. */
export interface MoveLayerPreview {
  readonly kind: "move-layer";
  readonly toolId: "move";
  readonly layerId: string;
  readonly start: InteractionPreviewPoint;
  readonly current: InteractionPreviewPoint;
  readonly transform: Transform;
  readonly documentDelta: InteractionPreviewPoint;
}

/** Pointer-only document-space marquee. It never enters Core or serialization. */
export interface RectangularMarqueePreview {
  readonly kind: "rectangular-marquee";
  readonly toolId: "marquee";
  readonly start: InteractionPreviewPoint;
  readonly current: InteractionPreviewPoint;
}

export interface TransformLayerPreview {
  readonly kind: "transform-layer";
  readonly toolId: "transform";
  readonly layerId: string;
  readonly transform: Transform;
}

export interface CropDocumentPreview {
  readonly kind: "crop-document";
  readonly toolId: "crop";
  readonly rectangle: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number };
  readonly document: { readonly width: number; readonly height: number };
}

export type EditorInteractionPreview = DiagnosticPointerPreview | MoveLayerPreview | RectangularMarqueePreview | TransformLayerPreview | CropDocumentPreview;
import type { Transform } from "../../core";
