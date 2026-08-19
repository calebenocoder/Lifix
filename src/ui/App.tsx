import { useEffect, useRef, useState } from "react";
import { CreateGroupCommand, CreateRasterLayerCommand, createEditorCore, type CoreStatus } from "../core";
import { createPlatformRuntime, type PlatformRuntime } from "../platform";
import { createRenderInput, createRenderer, createSolidRasterSource, createViewport, InMemoryRasterSourceResolver, type RendererStatus } from "../renderer";

interface DiagnosticState {
  runtime: PlatformRuntime["kind"];
  platform: PlatformRuntime["status"];
  core: CoreStatus;
  renderer: RendererStatus;
}

const initialPlatform = createPlatformRuntime();
const diagnosticSources = new InMemoryRasterSourceResolver([
  createSolidRasterSource("diagnostic-background", 920, 560, [55, 78, 120, 255]),
  createSolidRasterSource("diagnostic-blue", 330, 220, [56, 139, 253, 255]),
  createSolidRasterSource("diagnostic-orange", 280, 180, [255, 156, 60, 255]),
  createSolidRasterSource("diagnostic-pink", 190, 130, [236, 72, 153, 255]),
  createSolidRasterSource("diagnostic-hidden", 220, 140, [16, 185, 129, 255]),
]);

/** Presentation and user-interaction boundary. It does not own editor state. */
export function App() {
  const surfaceRef = useRef<HTMLCanvasElement>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticState>({
    runtime: initialPlatform.kind,
    platform: initialPlatform.status,
    core: "idle",
    renderer: "initializing",
  });

  useEffect(() => {
    let active = true;
    const core = createEditorCore();
    const renderer = createRenderer({ rasterSources: diagnosticSources });

    void (async () => {
      await core.initialize();
      if (!active || !surfaceRef.current) return;
      const document = core.createDocument("viewport-validation", "Viewport validation", 1200, 800);
      new CreateRasterLayerCommand("background", "Background", { transform: { position: { x: 140, y: 120 }, scale: { x: 1, y: 1 }, rotation: 0 } }, null, undefined, { kind: "raster-reference", sourceId: "diagnostic-background", storage: "lazy" }).execute(document);
      new CreateGroupCommand("artwork", "Artwork", { opacity: 0.9, transform: { position: { x: 250, y: 170 }, scale: { x: 1, y: 1 }, rotation: 0 } }).execute(document);
      new CreateRasterLayerCommand("blue", "Blue", { transform: { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 } }, "artwork", undefined, { kind: "raster-reference", sourceId: "diagnostic-blue", storage: "lazy" }).execute(document);
      new CreateGroupCommand("nested", "Nested", { transform: { position: { x: 130, y: 75 }, scale: { x: 1, y: 1 }, rotation: -12 } }, "artwork").execute(document);
      new CreateRasterLayerCommand("orange", "Orange", { opacity: 0.72, transform: { position: { x: 0, y: 0 }, scale: { x: 1.1, y: 1.1 }, rotation: 0 } }, "nested", undefined, { kind: "raster-reference", sourceId: "diagnostic-orange", storage: "lazy" }).execute(document);
      new CreateRasterLayerCommand("pink", "Pink", { transform: { position: { x: 500, y: 310 }, scale: { x: 1, y: 1 }, rotation: 18 } }, null, undefined, { kind: "raster-reference", sourceId: "diagnostic-pink", storage: "lazy" }).execute(document);
      new CreateRasterLayerCommand("hidden", "Hidden", { visible: false, transform: { position: { x: 720, y: 160 }, scale: { x: 1, y: 1 }, rotation: 0 } }, null, undefined, { kind: "raster-reference", sourceId: "diagnostic-hidden", storage: "lazy" }).execute(document);
      const input = createRenderInput(document);
      renderer.attach(surfaceRef.current);
      renderer.resize(createViewport(640, 360, window.devicePixelRatio || 1));
      await renderer.initialize();
      renderer.fitDocument(input);
      await renderer.render(input);

      if (active) {
        const platform = createPlatformRuntime();
        setDiagnostics({
          runtime: platform.kind,
          platform: platform.status,
          core: core.status,
          renderer: renderer.status,
        });
      }
    })();

    return () => {
      active = false;
      renderer.dispose();
    };
  }, []);

  return (
    <main>
      <h1>Image Editor</h1>
      <p>Runtime validation</p>
      <canvas ref={surfaceRef} className="renderer-surface" aria-label="Renderer validation surface" />
      <dl>
        <div><dt>Runtime</dt><dd>{diagnostics.runtime.toUpperCase()}</dd></div>
        <div><dt>Core status</dt><dd>{diagnostics.core.toUpperCase()}</dd></div>
        <div><dt>Renderer status</dt><dd>{diagnostics.renderer.toUpperCase()}</dd></div>
        <div><dt>Platform status</dt><dd>{diagnostics.platform.toUpperCase()}</dd></div>
      </dl>
    </main>
  );
}
