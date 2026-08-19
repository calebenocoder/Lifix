import { useEffect, useRef, useState, type CSSProperties } from "react";
import { CreateGroupCommand, CreateRasterLayerCommand, createEditorCore, type CoreStatus } from "../core";
import { createPlatformRuntime, type PlatformRuntime } from "../platform";
import { createDiagnosticRasterSources, createRenderInput, createRenderer, createViewport, InMemoryRasterSourceResolver, type Renderer, type RendererStatus } from "../renderer";
import { themeCssVariables, type ThemeId } from "./design-system";
import { WorkspaceSandbox } from "./WorkspaceSandbox";

interface DiagnosticState {
  runtime: PlatformRuntime["kind"];
  platform: PlatformRuntime["status"];
  core: CoreStatus;
  renderer: RendererStatus;
}

const initialPlatform = createPlatformRuntime();
const diagnosticSources = new InMemoryRasterSourceResolver(createDiagnosticRasterSources());

/** Presentation and user-interaction boundary. It does not own editor state. */
export function App() {
  const surfaceRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>("soft-modular");
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
    rendererRef.current = renderer;

    void (async () => {
      await core.initialize();
      if (!active || !surfaceRef.current) return;
      const document = core.createDocument("viewport-validation", "Viewport validation", 1200, 800);
      new CreateRasterLayerCommand("background", "Background", { transform: { position: { x: 140, y: 120 }, scale: { x: 3.6, y: 3.6 }, rotation: 0 } }, null, undefined, { kind: "raster-reference", sourceId: "diagnostic-background", storage: "lazy" }).execute(document);
      new CreateGroupCommand("artwork", "Isolated artwork", { compositing: "isolated", opacity: 0.9, transform: { position: { x: 250, y: 170 }, scale: { x: 1, y: 1 }, rotation: 0 } }).execute(document);
      new CreateRasterLayerCommand("quadrants", "Quadrants", { transform: { position: { x: 0, y: 0 }, scale: { x: 2.1, y: 2.1 }, rotation: 0 } }, "artwork", undefined, { kind: "raster-reference", sourceId: "diagnostic-quadrants", storage: "lazy" }).execute(document);
      new CreateGroupCommand("nested", "Nested", { transform: { position: { x: 130, y: 75 }, scale: { x: 1, y: 1 }, rotation: -12 } }, "artwork").execute(document);
      new CreateRasterLayerCommand("alpha", "Multiply alpha gradient", { opacity: 0.72, blendMode: "multiply", transform: { position: { x: 0, y: 0 }, scale: { x: 2.2, y: 2.2 }, rotation: 0 } }, "nested", undefined, { kind: "raster-reference", sourceId: "diagnostic-alpha", storage: "lazy" }).execute(document);
      new CreateRasterLayerCommand("screen", "Screen sample", { opacity: 0.82, blendMode: "screen", transform: { position: { x: 180, y: 105 }, scale: { x: 1.7, y: 1.7 }, rotation: 9 } }, "artwork", undefined, { kind: "raster-reference", sourceId: "diagnostic-screen", storage: "lazy" }).execute(document);
      new CreateRasterLayerCommand("overlay", "Overlay sample", { opacity: 0.78, blendMode: "overlay", transform: { position: { x: 360, y: 160 }, scale: { x: 1.9, y: 1.9 }, rotation: -8 } }, "artwork", undefined, { kind: "raster-reference", sourceId: "diagnostic-overlay", storage: "lazy" }).execute(document);
      new CreateRasterLayerCommand("marker", "Orientation marker", { transform: { position: { x: 570, y: 290 }, scale: { x: 1.8, y: 1.8 }, rotation: 18 } }, null, undefined, { kind: "raster-reference", sourceId: "diagnostic-marker", storage: "lazy" }).execute(document);
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
      if (rendererRef.current === renderer) rendererRef.current = null;
      renderer.dispose();
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.invalidate();
  }, [themeId]);

  return <div className="ui-foundation" data-theme={themeId} style={themeCssVariables(themeId) as CSSProperties}>
    <WorkspaceSandbox surfaceRef={surfaceRef} diagnostics={diagnostics} themeId={themeId} onThemeChange={setThemeId} />
  </div>;
}
