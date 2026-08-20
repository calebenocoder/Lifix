import type { EditorCommand, Document } from "../../core";
import type { RenderLayerTransformPreview, RenderViewport } from "../../renderer";
import type { IconName } from "../icons";
import type { EditorActionResult, EditorInteractionPreview, EditorSessionSnapshot, ToolId } from "../editor";

export type ToolCursor = "default" | "move" | "crosshair" | "text" | "grab" | "grabbing" | "zoom-in" | "zoom-out";
export interface ToolShortcut { readonly key: string; readonly shift?: boolean; }
export interface ToolMetadata { readonly id: ToolId; readonly label: string; readonly icon: IconName; readonly cursor: ToolCursor; readonly shortcut?: ToolShortcut; }
export interface ModifierState { readonly shift: boolean; readonly alt: boolean; readonly control: boolean; readonly meta: boolean; }
export interface ToolPointerInput {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly buttons: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly viewport: { readonly x: number; readonly y: number };
  readonly document: { readonly x: number; readonly y: number };
  readonly modifiers: ModifierState;
}
export interface ToolKeyboardInput { readonly key: string; readonly modifiers: ModifierState; }

/** Controlled boundary: tools receive snapshots and callbacks, never a mutable Document or GPU object. */
export interface ToolContext {
  readonly getSessionSnapshot: () => EditorSessionSnapshot;
  readonly getViewport: () => RenderViewport;
  readonly beginPreview: (preview: EditorInteractionPreview) => void;
  readonly updatePreview: (preview: EditorInteractionPreview) => void;
  readonly cancelPreview: () => void;
  readonly completePreview: () => void;
  readonly setRendererTransformPreview: (preview?: RenderLayerTransformPreview) => void;
  readonly commit: (command: EditorCommand<Document>) => EditorActionResult;
}

export interface ToolController {
  activate?(context: ToolContext): void;
  deactivate?(context: ToolContext): void;
  pointerDown?(input: ToolPointerInput, context: ToolContext): boolean | void;
  pointerMove?(input: ToolPointerInput, context: ToolContext): void;
  pointerUp?(input: ToolPointerInput, context: ToolContext): void;
  pointerCancel?(context: ToolContext): void;
  keyDown?(input: ToolKeyboardInput, context: ToolContext): boolean | void;
  keyUp?(input: ToolKeyboardInput, context: ToolContext): void;
  dispose?(): void;
}

export interface ToolRuntimeError { readonly phase: "activate" | "deactivate" | "pointer" | "keyboard" | "dispose"; readonly message: string; readonly cause?: unknown; }

export interface ToolDefinition extends ToolMetadata { readonly createController: () => ToolController; }
