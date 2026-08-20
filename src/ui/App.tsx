import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { CreateGroupCommand, CreateRasterLayerCommand, createEditorCore, type CoreStatus } from "../core";
import { createPlatformRuntime, type PlatformRuntime } from "../platform";
import { createDiagnosticRasterSources, createRenderInput, createRenderer, createViewport, InMemoryRasterSourceResolver, type Renderer, type RendererStatus } from "../renderer";
import { themeCssVariables, type ThemeId } from "./design-system";
import { createEditorSession, type EditorActionResult, type EditorSessionAction, type EditorSessionController, type EditorSessionSnapshot } from "./editor";
import { InteractionOverlay, ToolInputRouter, resolveTransformTarget, toolRegistry } from "./tools";
import { WorkspaceShell } from "./WorkspaceShell";

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
  const editorSessionRef = useRef<EditorSessionController | null>(null);
  const inputRouterRef = useRef<ToolInputRouter | null>(null);
  const overlayRef = useRef<InteractionOverlay | null>(null);
  if (!overlayRef.current) overlayRef.current = new InteractionOverlay();
  const viewportSizeRef = useRef<{ width: number; height: number } | null>(null);
  const [themeId, setThemeId] = useState<ThemeId>("soft-modular");
  const [editor, setEditor] = useState<EditorSessionSnapshot | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticState>({
    runtime: initialPlatform.kind,
    platform: initialPlatform.status,
    core: "idle",
    renderer: "initializing",
  });

  useEffect(() => {
    let active = true;
    let inputRouter: ToolInputRouter | undefined;
    let stopDocumentReplacement: (() => void) | undefined;
    const core = createEditorCore();
    const renderer = createRenderer({ rasterSources: diagnosticSources });
    rendererRef.current = renderer;

    void (async () => {
      await core.initialize();
      if (!active || !surfaceRef.current) return;
      const document = core.createDocument("viewport-validation", "Untitled-1", 1200, 800);
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
      const initialSize = viewportSizeRef.current ?? { width: 640, height: 360 };
      renderer.resize(createViewport(initialSize.width, initialSize.height, window.devicePixelRatio || 1));
      await renderer.initialize();
      renderer.fitDocument(input);
      await renderer.render(input);
      if (!active) return;
      const editorSession = createEditorSession(document, (changedDocument, change) => {
        if (!change.affectsImageRendering) return;
        const nextInput = createRenderInput(changedDocument);
        void renderer.render(nextInput);
      });
      editorSessionRef.current = editorSession;
      inputRouter = new ToolInputRouter({
        registry: toolRegistry,
        overlay: overlayRef.current!,
        getViewport: () => renderer.viewport,
        getSessionSnapshot: () => editorSession.snapshot,
        beginPreview: preview => editorSession.beginInteractionPreview(preview),
        updatePreview: preview => editorSession.updateInteractionPreview(preview),
        cancelPreview: () => editorSession.cancelInteractionPreview(),
        completePreview: () => editorSession.completeInteractionPreview(),
        executeDocumentCommand: command => editorSession.executeDocumentCommand(command),
        setRendererTransformPreview: preview => renderer.setLayerTransformPreview(preview),
        getTransformTarget: layerId => resolveTransformTarget(editorSession.snapshot, layerId, layer => {
          if (!layer.raster) return undefined;
          const source = diagnosticSources.resolve(layer.raster);
          return source ? { x: 0, y: 0, width: source.width, height: source.height } : undefined;
        }),
        onShortcutToolSelected: toolId => { editorSession.dispatch({ type: "set-active-tool", toolId }); },
      }, editorSession.snapshot.activeToolId);
      inputRouterRef.current = inputRouter;
      stopDocumentReplacement = editorSession.onDocumentWillReplace(() => inputRouter?.documentReplaced());
      editorSession.subscribe(snapshot => { overlayRef.current?.setCommittedPixelSelection(snapshot.pixelSelection, renderer.viewport); inputRouter?.sessionChanged(); setEditor(snapshot); });

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
      stopDocumentReplacement?.();
      inputRouter?.dispose();
      if (inputRouterRef.current === inputRouter) inputRouterRef.current = null;
      editorSessionRef.current = null;
      if (rendererRef.current === renderer) rendererRef.current = null;
      renderer.dispose();
      overlayRef.current?.dispose();
    };
  }, []);

  const resizeRenderer = useCallback((width: number, height: number) => {
    viewportSizeRef.current = { width, height };
    const renderer = rendererRef.current;
    if (!renderer) return;
    const viewport = renderer.viewport;
    renderer.resize(createViewport(width, height, window.devicePixelRatio || 1, viewport.zoom, viewport.offsetX, viewport.offsetY));
    overlayRef.current?.setViewport(renderer.viewport);
  }, []);

  const dispatchEditorAction = useCallback((action: EditorSessionAction): EditorActionResult | void => {
    if (action.type === "select-layer") inputRouterRef.current?.cancelInteraction();
    const result = editorSessionRef.current?.dispatch(action);
    if (action.type === "set-active-tool" && result?.ok) inputRouterRef.current?.setActiveTool(action.toolId);
    return result;
  }, []);
  const routePointerDown = useCallback((event: PointerEvent<HTMLElement>) => { event.currentTarget.focus(); inputRouterRef.current?.pointerDown(event.nativeEvent, event.currentTarget); }, []);
  const routePointerMove = useCallback((event: PointerEvent<HTMLElement>) => inputRouterRef.current?.pointerMove(event.nativeEvent, event.currentTarget), []);
  const routePointerUp = useCallback((event: PointerEvent<HTMLElement>) => inputRouterRef.current?.pointerUp(event.nativeEvent, event.currentTarget), []);
  const routePointerCancel = useCallback((event: PointerEvent<HTMLElement>) => inputRouterRef.current?.pointerCancel(event.nativeEvent), []);
  const routeKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => { if (inputRouterRef.current?.keyDown(event.nativeEvent)) event.preventDefault(); }, []);
  const routeKeyUp = useCallback((event: KeyboardEvent<HTMLElement>) => inputRouterRef.current?.keyUp(event.nativeEvent), []);
  const attachOverlay = useCallback((element: HTMLDivElement | null) => { if (element) overlayRef.current?.attach(element); }, []);

  return <div className="ui-foundation" data-theme={themeId} style={themeCssVariables(themeId) as CSSProperties}>
    <WorkspaceShell surfaceRef={surfaceRef} diagnostics={diagnostics} editor={editor} dispatchEditorAction={dispatchEditorAction} themeId={themeId} onThemeChange={setThemeId} onViewportResize={resizeRenderer} onViewportPointerDown={routePointerDown} onViewportPointerMove={routePointerMove} onViewportPointerUp={routePointerUp} onViewportPointerCancel={routePointerCancel} onViewportKeyDown={routeKeyDown} onViewportKeyUp={routeKeyUp} overlayRef={attachOverlay} />
  </div>;
}
