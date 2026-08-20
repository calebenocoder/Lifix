import { documentToViewport, type RenderViewport } from "../../renderer";
import { clonePixelSelection, type PixelSelection } from "../../core";
import type { EditorInteractionPreview } from "../editor";
import type { TransformBoxGeometry } from "./transform-engine";

export interface OverlayScheduler { request(callback: FrameRequestCallback): number; cancel(id: number): void; }
const browserScheduler: OverlayScheduler = { request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id) };

/** Renderer-independent DOM overlay for transient editing affordances. */
export class InteractionOverlay {
  #element?: HTMLElement;
  #preview?: EditorInteractionPreview;
  #committedSelection: PixelSelection | null = null;
  #viewport?: RenderViewport;
  #transformBox?: TransformBoxGeometry;
  #frame?: number;
  constructor(private readonly scheduler: OverlayScheduler = browserScheduler) {}
  attach(element: HTMLElement): void { this.#element = element; this.#schedule(); }
  update(preview: EditorInteractionPreview, viewport: RenderViewport): void { this.#preview = preview; this.#viewport = viewport; this.#schedule(); }
  clear(): void { this.#preview = undefined; this.#schedule(); }
  setTransformBox(box: TransformBoxGeometry | undefined, viewport: RenderViewport): void { this.#transformBox = box; this.#viewport = viewport; this.#schedule(); }
  /** Committed geometry comes from the detached editor projection, never from document pixels. */
  setCommittedPixelSelection(selection: PixelSelection | null, viewport: RenderViewport): void { this.#committedSelection = clonePixelSelection(selection); this.#viewport = viewport; this.#schedule(); }
  setViewport(viewport: RenderViewport): void { this.#viewport = viewport; this.#schedule(); }
  dispose(): void { if (this.#frame !== undefined) this.scheduler.cancel(this.#frame); this.#frame = undefined; this.#preview = undefined; this.#transformBox = undefined; this.#committedSelection = null; if (this.#element) this.#element.replaceChildren(); this.#element = undefined; }
  #schedule(): void { if (!this.#element || this.#frame !== undefined) return; this.#frame = this.scheduler.request(() => { this.#frame = undefined; this.#render(); }); }
  #render(): void {
    if (!this.#element) return;
    const preview = this.#preview;
    const viewport = this.#viewport;
    if (!viewport) { this.#element.replaceChildren(); return; }
    const fragment = this.#element.ownerDocument.createDocumentFragment();
    const rectangle = (first: { readonly x: number; readonly y: number }, second: { readonly x: number; readonly y: number }, className: string) => {
      const start = documentToViewport(first, viewport); const current = documentToViewport(second, viewport);
      const element = this.#element!.ownerDocument.createElement("div"); element.className = className; element.setAttribute("aria-hidden", "true"); element.style.left = `${Math.min(start.x, current.x)}px`; element.style.top = `${Math.min(start.y, current.y)}px`; element.style.width = `${Math.abs(current.x - start.x)}px`; element.style.height = `${Math.abs(current.y - start.y)}px`; fragment.append(element);
    };
    const committed = this.#committedSelection;
    if (committed) rectangle({ x: committed.left, y: committed.top }, { x: committed.right, y: committed.bottom }, "selection-overlay__committed");
    const transformBox = this.#transformBox;
    if (transformBox) {
      const corners = transformBox.corners.map(point => documentToViewport(point, viewport));
      const svg = this.#element.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("class", "transform-overlay__svg"); svg.setAttribute("width", "100%"); svg.setAttribute("height", "100%");
      const polygon = this.#element.ownerDocument.createElementNS("http://www.w3.org/2000/svg", "polygon"); polygon.setAttribute("points", corners.map(point => `${point.x},${point.y}`).join(" ")); polygon.setAttribute("class", "transform-overlay__outline"); svg.append(polygon); fragment.append(svg);
      const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      const handles = [corners[0], midpoint(corners[0]!, corners[1]!), corners[1], midpoint(corners[1]!, corners[2]!), corners[2], midpoint(corners[2]!, corners[3]!), corners[3], midpoint(corners[3]!, corners[0]!)];
      const cursors = ["nwse", "ns", "nesw", "ew", "nwse", "ns", "nesw", "ew"];
      handles.forEach((point, index) => { const handle = this.#element!.ownerDocument.createElement("div"); handle.className = `transform-overlay__handle transform-overlay__handle--${cursors[index]}`; handle.style.left = `${point!.x}px`; handle.style.top = `${point!.y}px`; fragment.append(handle); });
      const top = midpoint(corners[0]!, corners[1]!); const pivot = documentToViewport(transformBox.pivot, viewport); const dx = top.x - pivot.x, dy = top.y - pivot.y, length = Math.hypot(dx, dy) || 1; const rotate = { x: top.x + dx / length * 28, y: top.y + dy / length * 28 };
      const stem = this.#element.ownerDocument.createElement("div"); stem.className = "transform-overlay__rotation-stem"; stem.style.left = `${top.x}px`; stem.style.top = `${top.y}px`; stem.style.width = "28px"; stem.style.transform = `rotate(${Math.atan2(rotate.y - top.y, rotate.x - top.x) * 180 / Math.PI}deg)`; fragment.append(stem);
      const rotateHandle = this.#element.ownerDocument.createElement("div"); rotateHandle.className = "transform-overlay__rotate"; rotateHandle.style.left = `${rotate.x}px`; rotateHandle.style.top = `${rotate.y}px`; fragment.append(rotateHandle);
    }
    if (preview?.kind === "rectangular-marquee") rectangle(preview.start, preview.current, "selection-overlay__preview");
    if (preview?.kind === "diagnostic-pointer") {
      const start = documentToViewport(preview.start, viewport); const current = documentToViewport(preview.current, viewport); const marker = this.#element.ownerDocument.createElement("div"); marker.className = "interaction-overlay__marker"; marker.setAttribute("aria-hidden", "true"); marker.style.left = `${current.x}px`; marker.style.top = `${current.y}px`; marker.style.width = `${Math.max(8, Math.abs(current.x - start.x))}px`; marker.style.height = `${Math.max(8, Math.abs(current.y - start.y))}px`; marker.style.transform = `translate(${current.x >= start.x ? "0" : "-100%"}, ${current.y >= start.y ? "0" : "-100%"})`; fragment.append(marker);
    }
    this.#element.replaceChildren(fragment);
  }
}
