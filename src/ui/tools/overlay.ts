import { documentToViewport, type RenderViewport } from "../../renderer";
import type { EditorInteractionPreview } from "../editor";

export interface OverlayScheduler { request(callback: FrameRequestCallback): number; cancel(id: number): void; }
const browserScheduler: OverlayScheduler = { request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id) };

/** Renderer-independent DOM overlay for transient editing affordances. */
export class InteractionOverlay {
  #element?: HTMLElement;
  #preview?: EditorInteractionPreview;
  #viewport?: RenderViewport;
  #frame?: number;
  constructor(private readonly scheduler: OverlayScheduler = browserScheduler) {}
  attach(element: HTMLElement): void { this.#element = element; this.#schedule(); }
  update(preview: EditorInteractionPreview, viewport: RenderViewport): void { this.#preview = preview; this.#viewport = viewport; this.#schedule(); }
  clear(): void { this.#preview = undefined; this.#schedule(); }
  dispose(): void { if (this.#frame !== undefined) this.scheduler.cancel(this.#frame); this.#frame = undefined; this.#preview = undefined; if (this.#element) this.#element.replaceChildren(); this.#element = undefined; }
  #schedule(): void { if (!this.#element || this.#frame !== undefined) return; this.#frame = this.scheduler.request(() => { this.#frame = undefined; this.#render(); }); }
  #render(): void {
    if (!this.#element) return;
    const preview = this.#preview;
    const viewport = this.#viewport;
    if (!preview || !viewport) { this.#element.replaceChildren(); return; }
    const start = documentToViewport(preview.start, viewport);
    const current = documentToViewport(preview.current, viewport);
    const marker = this.#element.ownerDocument.createElement("div");
    marker.className = "interaction-overlay__marker";
    marker.setAttribute("aria-hidden", "true");
    marker.style.left = `${current.x}px`;
    marker.style.top = `${current.y}px`;
    marker.style.width = `${Math.max(8, Math.abs(current.x - start.x))}px`;
    marker.style.height = `${Math.max(8, Math.abs(current.y - start.y))}px`;
    marker.style.transform = `translate(${current.x >= start.x ? "0" : "-100%"}, ${current.y >= start.y ? "0" : "-100%"})`;
    this.#element.replaceChildren(marker);
  }
}
