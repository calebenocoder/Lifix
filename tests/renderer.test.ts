import { describe, expect, it } from "vitest";
import { calculatePhysicalSurfaceSize, createRenderInput, createRenderer, createSolidRasterSource, createViewport, InMemoryRasterSourceResolver, type FrameScheduler, type WebGpuProbe } from "../src/renderer";
import { CropDocumentCommand, createDocument, createRasterLayer } from "../src/core";

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
    const frames = scheduler(); let submits = 0; let configured = 0; let uploads = 0; let textures = 0; let sampler: unknown;
    const canvas = { width: 0, height: 0, style: {}, getContext: () => ({ configure() { configured += 1; }, getCurrentTexture: () => ({ createView: () => ({}) }) }) } as unknown as HTMLCanvasElement;
    const webGpu: WebGpuProbe = { getPreferredCanvasFormat: () => "rgba8unorm", requestAdapter: async () => ({ requestDevice: async () => ({ queue: { submit() { submits += 1; }, writeBuffer() {}, writeTexture() { uploads += 1; } }, createShaderModule: () => ({}), createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createRenderPipeline: () => ({}), createBuffer: () => ({}), createBindGroup: () => ({}), createSampler: descriptor => { sampler = descriptor; return {}; }, createTexture: () => { textures += 1; return { createView: () => ({}) }; }, createCommandEncoder: () => ({ copyTextureToTexture() {}, beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, draw() {}, end() {} }), finish: () => ({}) }) }) }) };
    const renderer = createRenderer({ webGpu, scheduler: frames.scheduler });
    renderer.attach(canvas); await renderer.initialize(); await renderer.render(); frames.run();
    expect(renderer.detail).toMatchObject({ status: "ready", backend: "webgpu" });
    expect(configured).toBe(1); expect(submits).toBe(1); expect(textures).toBe(1); expect(uploads).toBe(1); expect(sampler).toMatchObject({ magFilter: "linear", minFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
  });

  it("uploads odd-sized textures once and refreshes them after a source revision", async () => {
    const frames = scheduler(); const uploads: { bytes: number; bytesPerRow: number; width: number; height: number }[] = []; let textures = 0; let destroyed = 0; let destroyedBuffers = 0;
    const canvas = { width: 0, height: 0, style: {}, getContext: () => ({ configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) }) } as unknown as HTMLCanvasElement;
    const webGpu: WebGpuProbe = { requestAdapter: async () => ({ requestDevice: async () => ({ queue: { submit() {}, writeBuffer() {}, writeTexture(_destination, data, layout, size) { uploads.push({ bytes: data.byteLength, bytesPerRow: layout.bytesPerRow, width: size.width, height: size.height }); } }, createShaderModule: () => ({}), createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createRenderPipeline: () => ({}), createBuffer: () => ({ destroy() { destroyedBuffers += 1; } }), createBindGroup: () => ({}), createSampler: () => ({}), createTexture: () => { textures += 1; return { createView: () => ({}), destroy() { destroyed += 1; } }; }, createCommandEncoder: () => ({ copyTextureToTexture() {}, beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, draw() {}, end() {} }), finish: () => ({}) }) }) }) };
    const resolver = new InMemoryRasterSourceResolver([createSolidRasterSource("odd", 3, 5, [1, 2, 3, 255])]); const document = createDocument("doc", "Document", 10, 10); document.layerTree.add(createRasterLayer("layer", "Layer", {}, { kind: "raster-reference", sourceId: "odd", storage: "lazy" })); const renderer = createRenderer({ webGpu, scheduler: frames.scheduler, rasterSources: resolver }); renderer.attach(canvas); await renderer.initialize(); await renderer.render(createRenderInput(document)); frames.run(); await renderer.render(createRenderInput(document)); frames.run();
    expect(textures).toBe(4); expect(uploads.at(-1)).toEqual({ bytes: 1280, bytesPerRow: 256, width: 3, height: 5 }); resolver.set(createSolidRasterSource("odd", 3, 5, [4, 5, 6, 255], 1)); frames.run(); expect(textures).toBe(5); expect(destroyed).toBe(1); renderer.dispose(); expect(destroyed).toBe(5); expect(destroyedBuffers).toBe(2);
  });

  it("rebinds a raster texture after visibility pruning and restoration", async () => {
    const frames = scheduler(); let textureId = 0; const uploaded: number[] = []; const destroyed: number[] = []; const boundSourceIds: number[] = [];
    const canvas = { width: 0, height: 0, style: {}, getContext: () => ({ configure() {}, getCurrentTexture: () => ({ createView: () => ({ surface: true }) }) }) } as unknown as HTMLCanvasElement;
    const webGpu: WebGpuProbe = { requestAdapter: async () => ({ requestDevice: async () => ({ queue: { submit() {}, writeBuffer() {}, writeTexture(destination) { uploaded.push((destination.texture as unknown as { id: number }).id); } }, createShaderModule: () => ({}), createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createRenderPipeline: () => ({}), createBuffer: () => ({ destroy() {} }), createBindGroup: descriptor => { const source = (descriptor as { entries: { binding: number; resource: unknown }[] }).entries.find(entry => entry.binding === 1)?.resource as { id?: number } | undefined; return { sourceId: source?.id }; }, createSampler: () => ({}), createTexture: () => { const id = ++textureId; return { id, createView: () => ({ id }), destroy() { destroyed.push(id); } }; }, createCommandEncoder: () => ({ copyTextureToTexture() {}, beginRenderPass: () => ({ setPipeline() {}, setBindGroup(_index, group) { const sourceId = (group as { sourceId?: number }).sourceId; if (sourceId !== undefined) boundSourceIds.push(sourceId); }, draw() {}, end() {} }), finish: () => ({}) }) }) }) };
    const resolver = new InMemoryRasterSourceResolver([createSolidRasterSource("visibility", 4, 4, [20, 40, 60, 255])]); const document = createDocument("doc", "Document", 20, 20); document.layerTree.add(createRasterLayer("layer", "Layer", {}, { kind: "raster-reference", sourceId: "visibility", storage: "lazy" })); const renderer = createRenderer({ webGpu, scheduler: frames.scheduler, rasterSources: resolver }); renderer.attach(canvas); renderer.resize(createViewport(20, 20)); await renderer.initialize(); await renderer.render(createRenderInput(document)); frames.run();
    const firstRasterTexture = uploaded.at(-1)!; document.layerTree.find("layer")!.visible = false; await renderer.render(createRenderInput(document)); frames.run(); expect(destroyed).toContain(firstRasterTexture);
    document.layerTree.find("layer")!.visible = true; await renderer.render(createRenderInput(document)); frames.run(); expect(uploaded.at(-1)).not.toBe(firstRasterTexture); expect(boundSourceIds.at(-1)).toBe(uploaded.at(-1)); renderer.dispose();
  });

  it("isolates a per-layer WebGPU upload failure", async () => {
    const frames = scheduler(); let upload = 0; let destroyed = 0; const canvas = { width: 0, height: 0, style: {}, getContext: () => ({ configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) }) } as unknown as HTMLCanvasElement;
    const webGpu: WebGpuProbe = { requestAdapter: async () => ({ requestDevice: async () => ({ queue: { submit() {}, writeBuffer() {}, writeTexture() { upload += 1; if (upload > 1) throw new Error("layer upload failed"); } }, createShaderModule: () => ({}), createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createRenderPipeline: () => ({}), createBuffer: () => ({}), createBindGroup: () => ({}), createSampler: () => ({}), createTexture: () => ({ createView: () => ({}), destroy() { destroyed += 1; } }), createCommandEncoder: () => ({ copyTextureToTexture() {}, beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, draw() {}, end() {} }), finish: () => ({}) }) }) }) };
    const resolver = new InMemoryRasterSourceResolver([createSolidRasterSource("bad-upload", 3, 5, [1, 2, 3, 255])]); const document = createDocument("doc", "Document", 10, 10); document.layerTree.add(createRasterLayer("layer", "Layer", {}, { kind: "raster-reference", sourceId: "bad-upload", storage: "lazy" })); const renderer = createRenderer({ webGpu, scheduler: frames.scheduler, rasterSources: resolver }); renderer.attach(canvas); await renderer.initialize(); await renderer.render(createRenderInput(document)); frames.run(); expect(renderer.status).toBe("ready"); expect(renderer.detail.issues).toMatchObject([{ code: "resource-creation-failed", layerId: "layer", sourceId: "bad-upload" }]); expect(destroyed).toBe(1); renderer.dispose(); expect(destroyed).toBe(4);
  });

  it("coalesces concurrent initialization", async () => {
    const target = surface(); let canvasContexts = 0; const canvas = { ...target.canvas, getContext: (kind: string) => { canvasContexts += 1; return (target.canvas as unknown as { getContext(kind: string): unknown }).getContext(kind); } } as HTMLCanvasElement; const renderer = createRenderer(); renderer.attach(canvas); const first = renderer.initialize(); const second = renderer.initialize(); await Promise.all([first, second]); expect(canvasContexts).toBe(1); expect(renderer.status).toBe("fallback"); renderer.dispose(); expect(renderer.status).toBe("disposed");
  });

  it("disposes a backend that finishes initialization after renderer disposal", async () => {
    let release: ((adapter: Awaited<ReturnType<WebGpuProbe["requestAdapter"]>>) => void) | undefined; let destroyed = 0; const adapter = { requestDevice: async () => ({ queue: { submit() {}, writeBuffer() {}, writeTexture() {} }, createShaderModule: () => ({}), createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createRenderPipeline: () => ({}), createBuffer: () => ({}), createBindGroup: () => ({}), createSampler: () => ({}), createTexture: () => ({ createView: () => ({}), destroy() { destroyed += 1; } }), createCommandEncoder: () => ({ copyTextureToTexture() {}, beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, draw() {}, end() {} }), finish: () => ({}) }) }) }; const webGpu: WebGpuProbe = { requestAdapter: () => new Promise(resolve => { release = resolve; }) }; const canvas = { width: 0, height: 0, style: {}, getContext: () => ({ configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) }) } as unknown as HTMLCanvasElement; const renderer = createRenderer({ webGpu }); renderer.attach(canvas); const initialization = renderer.initialize(); renderer.dispose(); release!(adapter); await initialization; expect(renderer.status).toBe("disposed"); expect(destroyed).toBe(1);
  });

  it("reports unavailable when neither backend can attach", async () => {
    const renderer = createRenderer(); renderer.attach(surface(false).canvas); await renderer.initialize();
    expect(renderer.status).toBe("unavailable"); expect(renderer.detail.error?.code).toBe("fallback-unavailable");
  });

  it("skips a missing raster source without taking down the Canvas renderer", async () => {
    const frames = scheduler(); const target = surface(); const document = createDocument("doc", "Document", 10, 10); document.layerTree.add(createRasterLayer("missing", "Missing", {}, { kind: "raster-reference", sourceId: "missing", storage: "lazy" })); const renderer = createRenderer({ scheduler: frames.scheduler, rasterSources: new InMemoryRasterSourceResolver(), canvasRasterFactory: () => { throw new Error("must not create"); } }); renderer.attach(target.canvas); await renderer.initialize(); await renderer.render(createRenderInput(document)); frames.run(); expect(renderer.status).toBe("fallback"); expect(renderer.detail.issues).toMatchObject([{ code: "missing-source", layerId: "missing", sourceId: "missing" }]); expect(target.fills).toBe(2);
  });

  it("creates a detached render input from Core state", () => {
    const document = createDocument("doc", "Document", 10, 20); document.layerTree.add(createRasterLayer("layer", "Layer"));
    const input = createRenderInput(document); document.layerTree.find("layer")!.name = "Changed";
    expect(input).toMatchObject({ documentId: "doc", width: 10, height: 20, layers: { layer: { name: "Layer", kind: "raster" } } });
  });

  it("composites normal raster layers in plan order and redraws when the input changes", async () => {
    const frames = scheduler(); const operations: { drawable: string; alpha: number; transform: number[]; size: number[] }[] = []; let alpha = 1; let transform: number[] = [];
    const context = { canvas: undefined as unknown as HTMLCanvasElement, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, strokeRect() {}, fillRect() {}, set lineWidth(_value: number) {}, set strokeStyle(_value: string) {}, set fillStyle(_value: string) {}, set imageSmoothingEnabled(_value: boolean) {}, set globalAlpha(value: number) { alpha = value; }, setTransform(...value: number[]) { transform = value; }, drawImage(drawable: { id: string }, _x: number, _y: number, width: number, height: number) { operations.push({ drawable: drawable.id, alpha, transform, size: [width, height] }); } };
    const canvas = { width: 0, height: 0, style: {}, getContext: (kind: string) => kind === "2d" ? context : null } as unknown as HTMLCanvasElement; context.canvas = canvas;
    const resolver = new InMemoryRasterSourceResolver([createSolidRasterSource("blue", 10, 10, [0, 0, 255, 255]), createSolidRasterSource("red", 10, 10, [255, 0, 0, 255])]); const document = createDocument("doc", "Document", 100, 100);
    document.layerTree.add(createRasterLayer("blue", "Blue", { transform: { position: { x: 4, y: 5 }, scale: { x: 2, y: 3 }, rotation: 0 } }, { kind: "raster-reference", sourceId: "blue", storage: "lazy" })); document.layerTree.add(createRasterLayer("red", "Red", { opacity: 0.4 }, { kind: "raster-reference", sourceId: "red", storage: "lazy" }));
    const renderer = createRenderer({ scheduler: frames.scheduler, rasterSources: resolver, canvasRasterFactory: source => ({ id: source.id } as unknown as CanvasImageSource) }); renderer.attach(canvas); renderer.resize(createViewport(100, 100)); await renderer.initialize(); await renderer.render(createRenderInput(document)); frames.run();
    expect(operations).toEqual([{ drawable: "blue", alpha: 1, transform: [2, 0, 0, 3, 4, 5], size: [10, 10] }, { drawable: "red", alpha: 0.4, transform: [1, 0, 0, 1, 0, 0], size: [10, 10] }]);
    document.layerTree.find("red")!.visible = false; await renderer.render(createRenderInput(document)); frames.run(); expect(operations).toHaveLength(3); expect(operations.at(-1)?.drawable).toBe("blue");
    document.layerTree.find("red")!.visible = true; await renderer.render(createRenderInput(document)); frames.run(); expect(operations.slice(-2).map(operation => operation.drawable)).toEqual(["blue", "red"]);
  });

  it("renders a transient transform preview from the current plan without recreating raster resources", async () => {
    const frames = scheduler(); const transforms: number[][] = []; let created = 0; let alpha = 1;
    const context = { canvas: undefined as unknown as HTMLCanvasElement, save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, strokeRect() {}, fillRect() {}, set lineWidth(_value: number) {}, set strokeStyle(_value: string) {}, set fillStyle(_value: string) {}, set imageSmoothingEnabled(_value: boolean) {}, set globalAlpha(value: number) { alpha = value; }, setTransform(...value: number[]) { transforms.push(value); }, drawImage() { expect(alpha).toBe(1); } };
    const canvas = { width: 0, height: 0, style: {}, getContext: (kind: string) => kind === "2d" ? context : null } as unknown as HTMLCanvasElement; context.canvas = canvas;
    const resolver = new InMemoryRasterSourceResolver([createSolidRasterSource("source", 4, 4, [0, 0, 0, 255])]); const document = createDocument("doc", "Document", 100, 100); document.layerTree.add(createRasterLayer("layer", "Layer", { transform: { position: { x: 3, y: 4 }, scale: { x: 1, y: 1 }, rotation: 0 } }, { kind: "raster-reference", sourceId: "source", storage: "lazy" }));
    const renderer = createRenderer({ scheduler: frames.scheduler, rasterSources: resolver, canvasRasterFactory: () => { created += 1; return {} as CanvasImageSource; } }); renderer.attach(canvas); renderer.resize(createViewport(100, 100)); await renderer.initialize(); await renderer.render(createRenderInput(document)); frames.run(); renderer.setLayerTransformPreview({ layerId: "layer", documentTransform: { a: 1.5, b: 0, c: 0, d: 1.25, e: 0, f: 0 } }); renderer.setLayerTransformPreview({ layerId: "layer", documentTransform: { a: 2, b: 0, c: 0, d: 1.5, e: 0, f: 0 } }); frames.run();
    expect(created).toBe(1); expect(transforms.at(-1)).toEqual([2, 0, 0, 1.5, 6, 6]); renderer.dispose();
  });

  it("clips Canvas layers to cropped document bounds while reusing raster resources", async () => {
    const frames = scheduler(); const clips: number[][] = []; let created = 0; const context = { canvas: undefined as unknown as HTMLCanvasElement, save() {}, restore() {}, beginPath() {}, rect(...values: number[]) { clips.push(values); }, clip() {}, strokeRect() {}, fillRect() {}, setTransform() {}, drawImage() {}, set lineWidth(_value: number) {}, set strokeStyle(_value: string) {}, set fillStyle(_value: string) {}, set globalAlpha(_value: number) {}, set globalCompositeOperation(_value: string) {}, set imageSmoothingEnabled(_value: boolean) {} }; const canvas = { width: 0, height: 0, style: {}, getContext: (kind: string) => kind === "2d" ? context : null } as unknown as HTMLCanvasElement; context.canvas = canvas;
    const resolver = new InMemoryRasterSourceResolver([createSolidRasterSource("crop-source", 20, 20, [20, 40, 60, 255])]); const document = createDocument("crop", "Crop", 100, 80); document.layerTree.add(createRasterLayer("layer", "Layer", {}, { kind: "raster-reference", sourceId: "crop-source", storage: "lazy" })); const renderer = createRenderer({ scheduler: frames.scheduler, rasterSources: resolver, canvasRasterFactory: () => { created += 1; return {} as CanvasImageSource; } }); renderer.attach(canvas); renderer.resize(createViewport(200, 160)); await renderer.initialize(); await renderer.render(createRenderInput(document)); frames.run(); new CropDocumentCommand({ left: 10, top: 10, width: 50, height: 40 }).execute(document); await renderer.render(createRenderInput(document)); frames.run();
    expect(clips).toContainEqual([0, 0, 100, 80]); expect(clips.at(-1)).toEqual([0, 0, 50, 40]); expect(created).toBe(1); renderer.dispose();
  });

  it("uses WebGPU scissor bounds after crop without re-uploading unchanged raster textures", async () => {
    const frames = scheduler(); const scissors: number[][] = []; let uploads = 0; let textures = 0; const canvas = { width: 0, height: 0, style: {}, getContext: () => ({ configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) }) } as unknown as HTMLCanvasElement;
    const webGpu: WebGpuProbe = { requestAdapter: async () => ({ requestDevice: async () => ({ queue: { submit() {}, writeBuffer() {}, writeTexture() { uploads += 1; } }, createShaderModule: () => ({}), createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createRenderPipeline: () => ({}), createBuffer: () => ({ destroy() {} }), createBindGroup: () => ({}), createSampler: () => ({}), createTexture: () => { textures += 1; return { createView: () => ({}), destroy() {} }; }, createCommandEncoder: () => ({ copyTextureToTexture() {}, beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, setScissorRect(...values: number[]) { scissors.push(values); }, draw() {}, end() {} }), finish: () => ({}) }) }) }) };
    const resolver = new InMemoryRasterSourceResolver([createSolidRasterSource("gpu-crop", 20, 20, [20, 40, 60, 255])]); const document = createDocument("gpu-crop", "GPU Crop", 100, 80); document.layerTree.add(createRasterLayer("layer", "Layer", {}, { kind: "raster-reference", sourceId: "gpu-crop", storage: "lazy" })); const renderer = createRenderer({ webGpu, scheduler: frames.scheduler, rasterSources: resolver }); renderer.attach(canvas); renderer.resize(createViewport(200, 160)); await renderer.initialize(); await renderer.render(createRenderInput(document)); frames.run(); const initialUploads = uploads; const initialTextures = textures; new CropDocumentCommand({ left: 10, top: 10, width: 50, height: 40 }).execute(document); await renderer.render(createRenderInput(document)); frames.run();
    expect(scissors).toContainEqual([0, 0, 100, 80]); expect(scissors.at(-1)).toEqual([0, 0, 50, 40]); expect(uploads).toBe(initialUploads); expect(textures).toBe(initialTextures); renderer.dispose();
  });
});
