import { useEffect, useRef, useState } from "react";
import { createEditorCore, type CoreStatus } from "../core";
import { createPlatformRuntime, type PlatformRuntime } from "../platform";
import { createRenderInput, createRenderer, createViewport, type RendererStatus } from "../renderer";

interface DiagnosticState {
  runtime: PlatformRuntime["kind"];
  platform: PlatformRuntime["status"];
  core: CoreStatus;
  renderer: RendererStatus;
}

const initialPlatform = createPlatformRuntime();

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
    const renderer = createRenderer();

    void (async () => {
      await core.initialize();
      if (!active || !surfaceRef.current) return;
      const document = core.createDocument("viewport-validation", "Viewport validation", 1200, 800);
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
