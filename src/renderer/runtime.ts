import type { RenderBackendKind, RenderInput, RenderOptions, Renderer, RendererError, RendererStatus, RendererStatusDetail, RenderViewport } from "./contracts";

export interface WebGpuDevice { readonly queue?: { submit(commands: unknown[]): void }; createCommandEncoder?(): WebGpuCommandEncoder; }
export interface WebGpuAdapter { readonly name?: string; requestDevice?(): Promise<WebGpuDevice>; }
export interface WebGpuProbe { requestAdapter(): Promise<WebGpuAdapter | null>; getPreferredCanvasFormat?(): string; }
export interface WebGpuCommandEncoder { beginRenderPass(descriptor: unknown): { end(): void }; finish(): unknown; }
export interface FrameScheduler { request(callback: () => void): number; cancel(handle: number): void; }
export interface RendererDependencies { readonly webGpu?: WebGpuProbe; readonly scheduler?: FrameScheduler; }
interface RenderBackend { readonly kind: RenderBackendKind; initialize(surface: HTMLCanvasElement, viewport: RenderViewport): Promise<void>; resize(viewport: RenderViewport): void; render(input: RenderInput | undefined, options: RenderOptions | undefined): void; dispose(): void; }
interface WebGpuCanvasContext { configure(config: { device: WebGpuDevice; format: string; alphaMode: "opaque" }): void; getCurrentTexture(): { createView(): unknown }; }

const defaultScheduler: FrameScheduler = { request: callback => typeof requestAnimationFrame === "function" ? requestAnimationFrame(callback) : setTimeout(callback, 0) as unknown as number, cancel: handle => typeof cancelAnimationFrame === "function" ? cancelAnimationFrame(handle) : clearTimeout(handle) };

class Canvas2dBackend implements RenderBackend {
  readonly kind = "canvas2d" as const;
  #context?: CanvasRenderingContext2D;
  async initialize(surface: HTMLCanvasElement, _viewport: RenderViewport): Promise<void> { const context = surface.getContext("2d"); if (!context) throw new Error("Canvas 2D context is unavailable"); this.#context = context; }
  resize(_viewport: RenderViewport): void {}
  render(_input: RenderInput | undefined, _options: RenderOptions | undefined): void { if (!this.#context) throw new Error("Canvas backend is not initialized"); this.#context.save(); this.#context.setTransform(1, 0, 0, 1, 0, 0); this.#context.fillStyle = "#1b1f2a"; this.#context.fillRect(0, 0, this.#context.canvas.width, this.#context.canvas.height); this.#context.restore(); }
  dispose(): void { this.#context = undefined; }
}
class WebGpuBackend implements RenderBackend {
  readonly kind = "webgpu" as const; #device?: WebGpuDevice; #context?: WebGpuCanvasContext; #format?: string;
  constructor(private readonly probe: WebGpuProbe) {}
  async initialize(surface: HTMLCanvasElement, _viewport: RenderViewport): Promise<void> { const adapter = await this.probe.requestAdapter(); if (!adapter?.requestDevice) throw new Error("WebGPU adapter or device is unavailable"); const context = surface.getContext("webgpu") as unknown as WebGpuCanvasContext | null; if (!context) throw new Error("WebGPU canvas context is unavailable"); this.#device = await adapter.requestDevice(); this.#context = context; this.#format = this.probe.getPreferredCanvasFormat?.() ?? "bgra8unorm"; context.configure({ device: this.#device, format: this.#format, alphaMode: "opaque" }); }
  resize(_viewport: RenderViewport): void { if (this.#context && this.#device && this.#format) this.#context.configure({ device: this.#device, format: this.#format, alphaMode: "opaque" }); }
  render(_input: RenderInput | undefined, _options: RenderOptions | undefined): void { if (!this.#device?.createCommandEncoder || !this.#device.queue || !this.#context) throw new Error("WebGPU backend is not initialized"); const encoder = this.#device.createCommandEncoder(); const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.#context.getCurrentTexture().createView(), clearValue: { r: 0.106, g: 0.122, b: 0.165, a: 1 }, loadOp: "clear", storeOp: "store" }] }); pass.end(); this.#device.queue.submit([encoder.finish()]); }
  dispose(): void { this.#context = undefined; this.#device = undefined; this.#format = undefined; }
}
function browserWebGpuProbe(): WebGpuProbe | undefined { return (globalThis.navigator as Navigator & { gpu?: WebGpuProbe }).gpu; }
function physicalSize(viewport: RenderViewport): { width: number; height: number } { return { width: Math.max(1, Math.round(viewport.width * viewport.devicePixelRatio)), height: Math.max(1, Math.round(viewport.height * viewport.devicePixelRatio)) }; }
export function createViewport(width: number, height: number, devicePixelRatio = 1, zoom = 1, offsetX = 0, offsetY = 0): RenderViewport { if (![width, height, devicePixelRatio, zoom, offsetX, offsetY].every(Number.isFinite) || width <= 0 || height <= 0 || devicePixelRatio <= 0 || zoom <= 0) throw new RangeError("Viewport dimensions, pixel ratio, and zoom must be positive finite values"); return { width, height, devicePixelRatio, zoom, offsetX, offsetY }; }
export function calculatePhysicalSurfaceSize(viewport: RenderViewport): { width: number; height: number } { return physicalSize(viewport); }

class RendererRuntime implements Renderer {
  #surface?: HTMLCanvasElement; #backend?: RenderBackend; #viewport = createViewport(1, 1); #status: RendererStatus = "idle"; #detail: RendererStatusDetail = { status: "idle" }; #input?: RenderInput; #options?: RenderOptions; #frame?: number;
  constructor(private readonly dependencies: RendererDependencies) {}
  get status(): RendererStatus { return this.#status; } get detail(): RendererStatusDetail { return this.#detail; }
  attach(surface: HTMLCanvasElement): void { if (this.#status === "disposed") throw new Error("Renderer is disposed"); if (this.#surface && this.#surface !== surface) { this.#backend?.dispose(); this.#backend = undefined; this.#set("idle"); } this.#surface = surface; this.#applySize(); }
  async initialize(): Promise<void> { if (this.#status === "disposed") throw new Error("Renderer is disposed"); if (!this.#surface) return this.#fail("unavailable", "surface-unavailable", "A canvas surface must be attached before initialization"); this.#set("initializing"); const probe = this.dependencies.webGpu ?? browserWebGpuProbe(); if (probe) { try { const backend = new WebGpuBackend(probe); await backend.initialize(this.#surface, this.#viewport); this.#backend = backend; this.#set("ready", "webgpu"); return; } catch (cause) { this.#detail = { status: "initializing", error: { code: "webgpu-initialization-failed", message: "WebGPU initialization failed; attempting Canvas 2D fallback", cause } }; } } else this.#detail = { status: "initializing", error: { code: "webgpu-unavailable", message: "WebGPU is unavailable; attempting Canvas 2D fallback" } }; try { const backend = new Canvas2dBackend(); await backend.initialize(this.#surface, this.#viewport); this.#backend = backend; this.#set("fallback", "canvas2d", this.#detail.error); } catch (cause) { this.#fail("unavailable", "fallback-unavailable", "No render backend is available", cause); } }
  resize(viewport: RenderViewport): void { if (this.#status === "disposed") return; this.#viewport = viewport; this.#applySize(); this.#backend?.resize(viewport); this.invalidate(); }
  async render(input?: RenderInput, options?: RenderOptions): Promise<void> { if (this.#status === "disposed") throw new Error("Renderer is disposed"); this.#input = input; this.#options = options; this.invalidate(); }
  invalidate(): void { if (!this.#backend || this.#frame !== undefined || this.#status === "disposed") return; this.#frame = (this.dependencies.scheduler ?? defaultScheduler).request(() => { this.#frame = undefined; try { this.#backend?.render(this.#input, this.#options); } catch (cause) { this.#fail("unavailable", "render-failed", "Renderer failed to draw a frame", cause); } }); }
  dispose(): void { if (this.#status === "disposed") return; if (this.#frame !== undefined) (this.dependencies.scheduler ?? defaultScheduler).cancel(this.#frame); this.#frame = undefined; this.#backend?.dispose(); this.#backend = undefined; this.#surface = undefined; this.#set("disposed"); }
  #applySize(): void { if (!this.#surface) return; const size = physicalSize(this.#viewport); this.#surface.width = size.width; this.#surface.height = size.height; this.#surface.style.width = `${this.#viewport.width}px`; this.#surface.style.height = `${this.#viewport.height}px`; }
  #set(status: RendererStatus, backend?: RenderBackendKind, error?: RendererError): void { this.#status = status; this.#detail = { status, backend, error }; }
  #fail(status: RendererStatus, code: RendererError["code"], message: string, cause?: unknown): void { this.#backend?.dispose(); this.#backend = undefined; this.#set(status, undefined, { code, message, cause }); }
}
/** Creates an invalidation-driven renderer; backend selection remains internal. */
export function createRenderer(dependencies: RendererDependencies = {}): Renderer { return new RendererRuntime(dependencies); }
