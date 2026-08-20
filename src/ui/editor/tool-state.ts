/** Stable session-owned tool identities. They are not serialized with a Document. */
export type ToolId = "move" | "marquee" | "brush" | "eraser" | "crop" | "text" | "shape" | "hand" | "zoom";
export const toolIds: readonly ToolId[] = ["move", "marquee", "brush", "eraser", "crop", "text", "shape", "hand", "zoom"];

export interface InteractionPreviewPoint { readonly x: number; readonly y: number; }

/** Lightweight, transient interaction data. The renderer never receives this as RenderInput. */
export interface DiagnosticPointerPreview {
  readonly kind: "diagnostic-pointer";
  readonly toolId: ToolId;
  readonly start: InteractionPreviewPoint;
  readonly current: InteractionPreviewPoint;
}

export type EditorInteractionPreview = DiagnosticPointerPreview;
