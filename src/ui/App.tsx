import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { CreateGroupCommand, CreateRasterLayerCommand, RasterStore, beginBrushStroke, createEditorCore, type CoreStatus } from "../core";
import { createPlatformRuntime, type PlatformRuntime } from "../platform";
import { RasterStoreSourceResolver, createDiagnosticRasterSources, createRenderInput, createRenderer, createViewport, type Renderer, type RendererStatus } from "../renderer";
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
const diagnosticStore = new RasterStore();
for (const source of createDiagnosticRasterSources()) { diagnosticStore.create({ id: source.id, width: source.width, height: source.height }); const mutation = diagnosticStore.beginMutation(source.id); mutation.writePixels(0, 0, source.width, source.height, source.pixels); mutation.commit(); }
/** Development-only engine fixture: a single staged stroke crosses the 256px tile boundary without introducing a Brush UI. */
const diagnosticStroke = beginBrushStroke(diagnosticStore, { assetId: "diagnostic-tiled" }, { diameter: 18, hardness: 0.72, opacity: 0.85, flow: 0.65, spacing: 0.25, color: { r: 248, g: 113, b: 113, a: 255 } });
diagnosticStroke.addSample({ x: 228, y: 125, pressure: 1 }); diagnosticStroke.addSample({ x: 284, y: 145, pressure: 0.7 }); diagnosticStroke.finish();
/** Development fixture only: real editable assets now flow through the same tiled-storage resolver boundary. */
const diagnosticSources = new RasterStoreSourceResolver(diagnosticStore);

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
      new CreateRasterLayerCommand("tiled", "Tiled raster diagnostic", { opacity: 0.62, transform: { position: { x: 285, y: 185 }, scale: { x: 0.92, y: 0.92 }, rotation: -4 } }, null, undefined, { kind: "raster-reference", sourceId: "diagnostic-tiled", storage: "tiled" }).execute(document);
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
        if (change.commandLabel === "Crop document") { renderer.fitDocument(nextInput); overlayRef.current?.setViewport(renderer.viewport); }
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
          const tiled = diagnosticSources.describe(layer.raster);
          if (tiled) return { x: 0, y: 0, width: tiled.width, height: tiled.height };
          const source = diagnosticSources.resolve(layer.raster);
          return source ? { x: 0, y: 0, width: source.width, height: source.height } : undefined;
        }),
        brush: {
          store: diagnosticStore,
          resolveTarget: () => {
            const snapshot = editorSession.snapshot; const layer = snapshot.selectedLayer;
            if (!layer || layer.kind !== "raster" || !layer.visible || !layer.raster?.sourceId || !diagnosticStore.get(layer.raster.sourceId)) return undefined;
            const target = resolveTransformTarget(snapshot, layer.id, candidate => {
              if (!candidate.raster) return undefined;
              const tiled = diagnosticSources.describe(candidate.raster);
              return tiled ? { x: 0, y: 0, width: tiled.width, height: tiled.height } : undefined;
            });
            return target ? { layerId: layer.id, assetId: layer.raster.sourceId, world: target.originalWorld, worldInverse: target.originalWorldInverse, documentRevision: target.documentRevision } : undefined;
          },
        },
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
  const routePointerMove = useCallback((event: PointerEvent<HTMLElement>) => { const native = event.nativeEvent; const coalesced = native.getCoalescedEvents?.(); const samples = coalesced && coalesced.length ? coalesced : [native]; samples.forEach(sample => inputRouterRef.current?.pointerMove(sample, event.currentTarget)); }, []);
  const routePointerUp = useCallback((event: PointerEvent<HTMLElement>) => inputRouterRef.current?.pointerUp(event.nativeEvent, event.currentTarget), []);
  const routePointerCancel = useCallback((event: PointerEvent<HTMLElement>) => inputRouterRef.current?.pointerCancel(event.nativeEvent), []);
  const routeKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => { if (inputRouterRef.current?.keyDown(event.nativeEvent)) event.preventDefault(); }, []);
  const routeKeyUp = useCallback((event: KeyboardEvent<HTMLElement>) => inputRouterRef.current?.keyUp(event.nativeEvent), []);
  const attachOverlay = useCallback((element: HTMLDivElement | null) => { if (element) overlayRef.current?.attach(element); }, []);

  return <div className="ui-foundation" data-theme={themeId} style={themeCssVariables(themeId) as CSSProperties}>
    <WorkspaceShell surfaceRef={surfaceRef} diagnostics={diagnostics} editor={editor} dispatchEditorAction={dispatchEditorAction} themeId={themeId} onThemeChange={setThemeId} onViewportResize={resizeRenderer} onViewportPointerDown={routePointerDown} onViewportPointerMove={routePointerMove} onViewportPointerUp={routePointerUp} onViewportPointerCancel={routePointerCancel} onViewportKeyDown={routeKeyDown} onViewportKeyUp={routeKeyUp} overlayRef={attachOverlay} />
  </div>;
}
