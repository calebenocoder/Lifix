import { useEffect, useState } from "react";
import { createEditorCore, type CoreStatus } from "../core";
import { createPlatformRuntime, type PlatformRuntime } from "../platform";
import { createRenderer, type RendererStatus } from "../renderer";

interface DiagnosticState {
  runtime: PlatformRuntime["kind"];
  platform: PlatformRuntime["status"];
  core: CoreStatus;
  renderer: RendererStatus;
}

const initialPlatform = createPlatformRuntime();

/** Presentation and user-interaction boundary. It does not own editor state. */
export function App() {
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
      await renderer.initialize();

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
      <dl>
        <div><dt>Runtime</dt><dd>{diagnostics.runtime.toUpperCase()}</dd></div>
        <div><dt>Core status</dt><dd>{diagnostics.core.toUpperCase()}</dd></div>
        <div><dt>Renderer status</dt><dd>{diagnostics.renderer.toUpperCase()}</dd></div>
        <div><dt>Platform status</dt><dd>{diagnostics.platform.toUpperCase()}</dd></div>
      </dl>
    </main>
  );
}
