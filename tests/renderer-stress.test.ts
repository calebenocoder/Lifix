import { describe, expect, it } from "vitest";
import { calculatePhysicalSurfaceSize, createRenderer, createRendererStressScene, createViewport, InMemoryRasterSourceResolver, transformedRasterBounds, type FrameScheduler, type RasterSourceResolver, type WebGpuProbe } from "../src/renderer";

function frames(): { readonly scheduler: FrameScheduler; readonly requests: () => number; run(): void } {
  let callback: (() => void) | undefined; let requests = 0;
  return { scheduler: { request: next => { requests += 1; callback = next; return requests; }, cancel() {} }, requests: () => requests, run: () => { const next = callback; callback = undefined; next?.(); } };
}

function canvasContext(): { readonly canvas: HTMLCanvasElement; readonly draws: () => number } {
  let draws = 0; const context = { save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, clearRect() {}, setTransform() {}, strokeRect() {}, fillRect() {}, drawImage() { draws += 1; }, set fillStyle(_value: string) {}, set strokeStyle(_value: string) {}, set lineWidth(_value: number) {}, set globalAlpha(_value: number) {}, set globalCompositeOperation(_value: string) {}, set imageSmoothingEnabled(_value: boolean) {} }; const canvas = { width: 0, height: 0, style: {}, getContext: (kind: string) => kind === "2d" ? context : null } as unknown as HTMLCanvasElement;
  return { canvas, draws: () => draws };
}

describe("renderer stress and bounds review", () => {
  it("creates deterministic large logical scenes without raster-sized document allocations", () => {
    const scene = createRendererStressScene({ layerCount: 250, documentWidth: 16_384, documentHeight: 8_192, resourceCount: 8, groupDepth: 5 });
    expect(scene.input).toMatchObject({ width: 16_384, height: 8_192 });
    expect(scene.sources).toHaveLength(8);
    expect(scene.sources.every(source => source.pixels.byteLength === 8 * 8 * 4)).toBe(true);
    expect(JSON.stringify(scene.input)).not.toContain("pixels");
    expect(scene.input.rootLayerIds).toEqual(["stress-group-0"]);
  });

  it("keeps deep mixed group planning deterministic", () => {
    const scene = createRendererStressScene({ layerCount: 100, groupDepth: 10, resourceCount: 4 });
    const layers = Object.values(scene.input.layers);
    expect(layers.filter(layer => layer.kind === "group")).toHaveLength(10);
    expect(layers.filter(layer => layer.kind === "raster")).toHaveLength(100);
    expect(scene.input.layers["stress-group-0"].kind).toBe("group");
    expect(scene.input.layers["stress-layer-99"].parentId).toBe("stress-group-9");
  });

  it("uses conservative finite bounds for rotation, negative scale, and extreme values", () => {
    expect(transformedRasterBounds({ a: -2, b: 1, c: 3, d: 4, e: 10, f: 20 }, { width: 8, height: 6 })).toMatchObject({ x: -6, y: 20, width: 34, height: 32 });
    expect(transformedRasterBounds({ a: Number.MAX_VALUE, b: 0, c: 0, d: 1, e: Number.MAX_VALUE, f: 0 }, { width: 2, height: 1 })).toBeUndefined();
    expect(transformedRasterBounds({ a: Number.NaN, b: 0, c: 0, d: 1, e: 0, f: 0 }, { width: 1, height: 1 })).toBeUndefined();
  });

  it("culls off-viewport layers before Canvas resources are created and reuses metadata on viewport-only frames", async () => {
    const scene = createRendererStressScene({ layerCount: 100, resourceCount: 100, groupDepth: 0, visibleLayerCount: 2 }); const sourceMap = new Map(scene.sources.map(source => [source.id, source])); let resolutions = 0; let created = 0;
    const resolver: RasterSourceResolver = { resolve(reference) { resolutions += 1; return reference.sourceId ? sourceMap.get(reference.sourceId) : undefined; } };
    const target = canvasContext(); const scheduled = frames(); const renderer = createRenderer({ scheduler: scheduled.scheduler, rasterSources: resolver, canvasRasterFactory: source => { created += 1; return { id: source.id } as unknown as CanvasImageSource; } });
    renderer.attach(target.canvas); renderer.resize(createViewport(100, 100)); await renderer.initialize(); await renderer.render(scene.input); scheduled.run();
    expect(created).toBe(1); expect(target.draws()).toBe(1); const firstResolutionCount = resolutions;
    renderer.panBy({ x: 0, y: 1 }); renderer.panBy({ x: 0, y: 1 }); renderer.panBy({ x: 0, y: 1 }); expect(scheduled.requests()).toBe(2); scheduled.run();
    expect(created).toBe(1); expect(resolutions).toBe(firstResolutionCount); renderer.dispose();
  });

  it("applies the same culling and cache-reuse semantics to the WebGPU backend", async () => {
    const scene = createRendererStressScene({ layerCount: 100, resourceCount: 100, groupDepth: 0, visibleLayerCount: 2 }); let textures = 0; let uploads = 0;
    const canvas = { width: 0, height: 0, style: {}, getContext: () => ({ configure() {}, getCurrentTexture: () => ({ createView: () => ({}) }) }) } as unknown as HTMLCanvasElement;
    const webGpu: WebGpuProbe = { requestAdapter: async () => ({ requestDevice: async () => ({ queue: { submit() {}, writeBuffer() {}, writeTexture() { uploads += 1; } }, createShaderModule: () => ({}), createBindGroupLayout: () => ({}), createPipelineLayout: () => ({}), createRenderPipeline: () => ({}), createBuffer: () => ({}), createBindGroup: () => ({}), createSampler: () => ({}), createTexture: () => { textures += 1; return { createView: () => ({}) }; }, createCommandEncoder: () => ({ copyTextureToTexture() {}, beginRenderPass: () => ({ setPipeline() {}, setBindGroup() {}, draw() {}, end() {} }), finish: () => ({}) }) }) }) };
    const scheduled = frames(); const renderer = createRenderer({ webGpu, scheduler: scheduled.scheduler, rasterSources: new InMemoryRasterSourceResolver(scene.sources) }); renderer.attach(canvas); renderer.resize(createViewport(100, 100)); await renderer.initialize(); await renderer.render(scene.input); scheduled.run();
    expect(renderer.status).toBe("ready"); expect(uploads).toBe(2); expect(textures).toBe(4);
    renderer.panBy({ x: 0, y: 3 }); scheduled.run(); expect(uploads).toBe(2); expect(textures).toBe(4); renderer.dispose();
  });

  it("clips isolated-group temporary surfaces to the physical viewport on a large document", async () => {
    const scene = createRendererStressScene({ layerCount: 50, documentWidth: 32_768, documentHeight: 4_096, resourceCount: 8, groupDepth: 4, visibleLayerCount: 2 }); const target = canvasContext(); const scheduled = frames(); const surfaces: Array<{ width: number; height: number }> = [];
    const renderer = createRenderer({ scheduler: scheduled.scheduler, rasterSources: new InMemoryRasterSourceResolver(scene.sources), canvasRasterFactory: source => ({ id: source.id } as unknown as CanvasImageSource), canvasCompositeSurfaceFactory: (width, height) => { surfaces.push({ width, height }); return { width, height, getContext: () => canvasContext().canvas.getContext("2d")! }; } });
    renderer.attach(target.canvas); renderer.resize(createViewport(120, 80, 1.5)); await renderer.initialize(); await renderer.render(scene.input); scheduled.run();
    expect(surfaces.length).toBeGreaterThan(0); expect(surfaces.every(surface => surface.width <= 180 && surface.height <= 120)).toBe(true); expect(calculatePhysicalSurfaceSize(renderer.viewport)).toEqual({ width: 180, height: 120 }); renderer.dispose();
  });

  it("keeps fractional DPR physical sizing separate from logical viewport state across repeated resizes", async () => {
    const target = canvasContext(); const scheduled = frames(); const renderer = createRenderer({ scheduler: scheduled.scheduler }); renderer.attach(target.canvas); await renderer.initialize();
    for (const dpr of [1, 1.25, 1.5, 2]) { renderer.resize(createViewport(333, 111, dpr, 2, 40, -20)); scheduled.run(); expect(target.canvas.width).toBe(Math.round(333 * dpr)); expect(target.canvas.height).toBe(Math.round(111 * dpr)); expect(renderer.viewport).toMatchObject({ zoom: 2, offsetX: 40, offsetY: -20 }); }
    renderer.dispose();
  });
});
