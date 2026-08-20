import type { Document, EditorCommand } from "../../core";
import type { RenderLayerTransformPreview, RenderViewport } from "../../renderer";
import type { EditorActionResult, EditorInteractionPreview, EditorSessionSnapshot, ToolId } from "../editor";
import { clientToDocument, clientToViewport, type SurfaceRect } from "./coordinates";
import type { ModifierState, ToolContext, ToolController, ToolKeyboardInput, ToolPointerInput, ToolRuntimeError } from "./contracts";
import { InteractionOverlay } from "./overlay";
import { ToolRegistry } from "./registry";
import { InteractionTransaction } from "./transaction";

export interface PointerEventLike {
  readonly pointerId: number;
  readonly pointerType: string;
  readonly buttons: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}
export interface KeyboardEventLike { readonly key: string; readonly shiftKey: boolean; readonly altKey: boolean; readonly ctrlKey: boolean; readonly metaKey: boolean; readonly target?: EventTarget | null; readonly defaultPrevented?: boolean; }
export interface PointerCaptureHost { readonly getBoundingClientRect: () => SurfaceRect; setPointerCapture(pointerId: number): void; releasePointerCapture(pointerId: number): void; hasPointerCapture?(pointerId: number): boolean; }

export interface ToolInputRouterDependencies {
  readonly registry: ToolRegistry;
  readonly overlay: InteractionOverlay;
  readonly getViewport: () => RenderViewport;
  readonly getSessionSnapshot: () => EditorSessionSnapshot;
  readonly beginPreview: (preview: EditorInteractionPreview) => void;
  readonly updatePreview: (preview: EditorInteractionPreview) => void;
  readonly cancelPreview: () => void;
  readonly completePreview: () => void;
  readonly executeDocumentCommand: (command: EditorCommand<Document>) => EditorActionResult;
  /** Renderer-only transient preview; no RenderInput is created for pointer samples. */
  readonly setRendererTransformPreview?: (preview?: RenderLayerTransformPreview) => void;
  /** Synchronizes a shortcut-driven controller change with session-owned active tool state. */
  readonly onShortcutToolSelected?: (toolId: ToolId) => void;
  readonly onError?: (error: ToolRuntimeError) => void;
}

export function modifiersFromEvent(event: Pick<KeyboardEventLike, "shiftKey" | "altKey" | "ctrlKey" | "metaKey">): ModifierState { return { shift: event.shiftKey, alt: event.altKey, control: event.ctrlKey, meta: event.metaKey }; }
export function isEditableTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as { readonly isContentEditable?: boolean; readonly tagName?: string };
  return Boolean(element.isContentEditable) || element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT";
}

/** One active pointer router. It owns capture and controller lifecycle, never Document mutation. */
export class ToolInputRouter {
  #activeToolId: ToolId;
  #controller!: ToolController;
  #pointerId?: number;
  #captureHost?: PointerCaptureHost;
  #disposed = false;
  #lastError?: ToolRuntimeError;
  readonly #context: ToolContext;
  readonly #transaction: InteractionTransaction<EditorInteractionPreview>;

  constructor(private readonly dependencies: ToolInputRouterDependencies, initialToolId: ToolId = "move") {
    this.#activeToolId = initialToolId;
    this.#controller = this.dependencies.registry.get(initialToolId).createController();
    this.#transaction = new InteractionTransaction<EditorInteractionPreview>({
      begin: preview => { dependencies.beginPreview(preview); dependencies.overlay.update(preview, dependencies.getViewport()); },
      update: preview => { dependencies.updatePreview(preview); dependencies.overlay.update(preview, dependencies.getViewport()); },
      finish: () => { dependencies.completePreview(); dependencies.setRendererTransformPreview?.(); dependencies.overlay.clear(); },
    });
    this.#context = {
      getSessionSnapshot: dependencies.getSessionSnapshot,
      getViewport: dependencies.getViewport,
      beginPreview: preview => this.#transaction.begin(preview),
      updatePreview: preview => this.#transaction.update(preview),
      cancelPreview: () => { if (!this.#transaction.cancel()) { dependencies.cancelPreview(); dependencies.setRendererTransformPreview?.(); dependencies.overlay.clear(); } },
      completePreview: () => { this.#transaction.commit(); },
      setRendererTransformPreview: preview => dependencies.setRendererTransformPreview?.(preview),
      commit: command => { const result = dependencies.executeDocumentCommand(command); this.#transaction.commit(); return result; },
    };
    this.#controller.activate?.(this.#context);
  }

  get activeToolId(): ToolId { return this.#activeToolId; }
  get interactionActive(): boolean { return this.#pointerId !== undefined; }
  get lastError(): ToolRuntimeError | undefined { return this.#lastError; }
  setActiveTool(toolId: ToolId): void {
    if (this.#disposed || toolId === this.#activeToolId) return;
    this.cancelInteraction();
    this.#invoke("deactivate", () => this.#controller.deactivate?.(this.#context));
    this.#invoke("dispose", () => this.#controller.dispose?.());
    this.#activeToolId = toolId;
    this.#controller = this.dependencies.registry.get(toolId).createController();
    this.#controller.activate?.(this.#context);
  }
  pointerDown(event: PointerEventLike, host: PointerCaptureHost): boolean {
    if (this.#disposed || this.#pointerId !== undefined) return false;
    const accepted = this.#invoke("pointer", () => this.#controller.pointerDown?.(this.#pointer(event, host), this.#context));
    if (!accepted) return false;
    this.#pointerId = event.pointerId;
    this.#captureHost = host;
    host.setPointerCapture(event.pointerId);
    return true;
  }
  pointerMove(event: PointerEventLike, host: PointerCaptureHost): void { if (event.pointerId === this.#pointerId && !this.#disposed) this.#invoke("pointer", () => this.#controller.pointerMove?.(this.#pointer(event, host), this.#context)); }
  pointerUp(event: PointerEventLike, host: PointerCaptureHost): void {
    if (event.pointerId !== this.#pointerId || this.#disposed) return;
    this.#invoke("pointer", () => this.#controller.pointerUp?.(this.#pointer(event, host), this.#context));
    this.#releasePointerCapture();
  }
  pointerCancel(event?: Pick<PointerEventLike, "pointerId">): void { if (event && event.pointerId !== this.#pointerId) return; this.cancelInteraction(); }
  keyDown(event: KeyboardEventLike): boolean {
    if (this.#disposed || isEditableTarget(event.target)) return false;
    const input: ToolKeyboardInput = { key: event.key, modifiers: modifiersFromEvent(event) };
    if (event.key === "Escape" && this.#pointerId !== undefined) { this.cancelInteraction(); return true; }
    if (this.#invoke("keyboard", () => this.#controller.keyDown?.(input, this.#context))) return true;
    if (event.defaultPrevented) return false;
    const tool = this.dependencies.registry.findShortcut(event.key, input.modifiers);
    if (!tool) return false;
    this.setActiveTool(tool.id);
    this.dependencies.onShortcutToolSelected?.(tool.id);
    return true;
  }
  keyUp(event: KeyboardEventLike): void { if (!this.#disposed && !isEditableTarget(event.target)) this.#invoke("keyboard", () => this.#controller.keyUp?.({ key: event.key, modifiers: modifiersFromEvent(event) }, this.#context)); }
  documentReplaced(): void { this.cancelInteraction(); }
  cancelInteraction(): void { if (this.#pointerId !== undefined) this.#invoke("pointer", () => this.#controller.pointerCancel?.(this.#context)); else this.#context.cancelPreview(); this.#releasePointerCapture(); }
  dispose(): void { if (this.#disposed) return; this.cancelInteraction(); this.#invoke("deactivate", () => this.#controller.deactivate?.(this.#context)); this.#invoke("dispose", () => this.#controller.dispose?.()); this.#disposed = true; }
  #pointer(event: PointerEventLike, host: PointerCaptureHost): ToolPointerInput {
    const viewport = this.dependencies.getViewport();
    const rect = host.getBoundingClientRect();
    return { pointerId: event.pointerId, pointerType: event.pointerType, buttons: event.buttons, pressure: event.pressure, tiltX: event.tiltX, tiltY: event.tiltY, viewport: clientToViewport({ x: event.clientX, y: event.clientY }, rect, viewport), document: clientToDocument({ x: event.clientX, y: event.clientY }, rect, viewport), modifiers: modifiersFromEvent(event) };
  }
  #releasePointerCapture(): void {
    const pointerId = this.#pointerId;
    const host = this.#captureHost;
    this.#pointerId = undefined;
    this.#captureHost = undefined;
    if (pointerId !== undefined && host && (!host.hasPointerCapture || host.hasPointerCapture(pointerId))) host.releasePointerCapture(pointerId);
  }
  #invoke<T>(phase: ToolRuntimeError["phase"], operation: () => T): T | undefined {
    try { return operation(); }
    catch (cause) {
      const error: ToolRuntimeError = { phase, message: cause instanceof Error ? cause.message : "Tool controller failed", cause };
      this.#lastError = error;
      this.dependencies.cancelPreview();
      this.dependencies.setRendererTransformPreview?.();
      this.dependencies.overlay.clear();
      this.#releasePointerCapture();
      this.dependencies.onError?.(error);
      return undefined;
    }
  }
}
