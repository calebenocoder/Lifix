import { describe, expect, it } from "vitest";
import { calculatePhysicalSurfaceSize, createRenderInput, createRenderer, createViewport, type FrameScheduler, type WebGpuProbe } from "../src/renderer";
import { createDocument, createRasterLayer } from "../src/core";

function surface(withCanvas = true): { canvas: HTMLCanvasElement; fills: number } {
  let fills = 0;
  const canvas = { width: 0, height: 0, style: {}, getContext: (kind: string) => kind === "2d" && withCanvas ? { canvas, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, setTransform() {}, set fillStyle(_value: string) {}, set strokeStyle(_value: string) {}, set lineWidth(_value: number) {}, fillRect() { fills += 1; }, strokeRect() {} } : null } as unknown as HTMLCanvasElement;
  return { canvas, get fills() { return fills; } };
}
function scheduler(): { scheduler: FrameScheduler; run(): void; cancelled: number[] } { let callback: (() => void) | undefined; const cancelled: number[] = []; return { scheduler: { request: next => { callback = next; return 7; }, cancel: handle => cancelled.push(handle) }, run: () => callback?.(), cancelled }; }

describe("renderer foundation", () => {
  it("calculates physical surface size independently from viewport logical size", () => {
    expect(calculatePhysicalSurfaceSize(createViewport(320, 180, 2))).toEqual({ width: 640, height: 360 });
    expect(() => createViewport(0, 1)).toThrow("positive");
  });

  it("uses Canvas 2D when WebGPU is unavailable and renders only after invalidation", async () => {
    const target = surface(); const frames = scheduler();
    const renderer = createRenderer({ scheduler: frames.scheduler });
    renderer.attach(target.canvas); renderer.resize(createViewport(100, 50, 2));
    await renderer.initialize();
    expect(renderer.status).toBe("fallback");
    expect(renderer.detail).toMatchObject({ backend: "canvas2d", error: { code: "webgpu-unavailable" } });
    expect(target.canvas.width).toBe(200); expect(target.canvas.height).toBe(100);
    await renderer.render(); await renderer.render();
    expect(target.fills).toBe(0); frames.run();
    expect(target.fills).toBe(1);
    renderer.dispose(); expect(renderer.status).toBe("disposed"); expect(frames.cancelled).toEqual([]);
  });

  it("falls back after WebGPU initialization failure and disposes a pending frame", async () => {
    const target = surface(); const frames = scheduler();
    const webGpu: WebGpuProbe = { requestAdapter: async () => ({ requestDevice: async () => { throw new Error("device failure"); } }) };
    const renderer = createRenderer({ webGpu, scheduler: frames.scheduler });
    renderer.attach(target.canvas); await renderer.initialize();
    expect(renderer.status).toBe("fallback");
    expect(renderer.detail.error?.code).toBe("webgpu-initialization-failed");
    renderer.invalidate(); renderer.dispose(); expect(frames.cancelled).toEqual([7]);
  });

  it("selects WebGPU when a device and surface context initialize", async () => {
    const frames = scheduler(); let submits = 0; let configured = 0;
    const canvas = { width: 0, height: 0, style: {}, getContext: () => ({ configure() { configured += 1; }, getCurrentTexture: () => ({ createView: () => ({}) }) }) } as unknown as HTMLCanvasElement;
    const webGpu: WebGpuProbe = { getPreferredCanvasFormat: () => "rgba8unorm", requestAdapter: async () => ({ requestDevice: async () => ({ queue: { submit() { submits += 1; }, writeBuffer() {} }, createShaderModule: () => ({}), createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createRenderPipeline: () => ({}), createBuffer: () => ({}), createBindGroup: () => ({}), createCommandEncoder: () => ({ beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, draw() {}, end() {} }), finish: () => ({}) }) }) }) };
    const renderer = createRenderer({ webGpu, scheduler: frames.scheduler });
    renderer.attach(canvas); await renderer.initialize(); await renderer.render(); frames.run();
    expect(renderer.detail).toMatchObject({ status: "ready", backend: "webgpu" });
    expect(configured).toBe(1); expect(submits).toBe(1);
  });

  it("reports unavailable when neither backend can attach", async () => {
    const renderer = createRenderer(); renderer.attach(surface(false).canvas); await renderer.initialize();
    expect(renderer.status).toBe("unavailable"); expect(renderer.detail.error?.code).toBe("fallback-unavailable");
  });

  it("creates a detached render input from Core state", () => {
    const document = createDocument("doc", "Document", 10, 20); document.layerTree.add(createRasterLayer("layer", "Layer"));
    const input = createRenderInput(document); document.layerTree.find("layer")!.name = "Changed";
    expect(input).toMatchObject({ documentId: "doc", width: 10, height: 20, layers: { layer: { name: "Layer", kind: "raster" } } });
  });
});
