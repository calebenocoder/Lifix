import { useEffect, useState, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react";
import type { CoreStatus } from "../core";
import type { PlatformRuntime } from "../platform";
import type { RendererStatus } from "../renderer";
import type { ThemeId } from "./design-system";
import type { EditorActionResult, EditorSessionAction, EditorSessionSnapshot, ToolId } from "./editor";
import { toolRegistry } from "./tools";
import { ColorPanel, LayersPanel, PropertiesPanel } from "./panels";
import { Divider, IconButton, PanelChrome, Select, Surface } from "./primitives";
import { Icon } from "./icons";
import { normalizeWorkspaceViewportSize, PanelRegistry, createWorkspaceLayout } from "./workspace";

interface DiagnosticState { readonly runtime: PlatformRuntime["kind"]; readonly platform: PlatformRuntime["status"]; readonly core: CoreStatus; readonly renderer: RendererStatus; }
interface PanelContext { readonly editor: EditorSessionSnapshot | null; readonly dispatch: (action: EditorSessionAction) => EditorActionResult | void; readonly activeToolId: ToolId; readonly activateTool: (toolId: ToolId) => void; }
type PanelFactory = (context: PanelContext) => ReactNode;

const workspaceLayout = createWorkspaceLayout();
const panelRegistry = new PanelRegistry<PanelFactory>();
const loadingPanel = (title: string, icon: "layers" | "properties" | "color") => <PanelChrome title={title} icon={icon}><div className="panel-empty-state"><Icon name={icon} /><strong>Opening document</strong></div></PanelChrome>;
panelRegistry.register({ id: "tool-strip", type: "workspace.tools", title: "Tools", icon: "tools", minimumSize: { width: 44, height: 240 }, preferredSize: { width: 52, height: 520 }, dockable: true, floatable: true, closable: false }, context => <ToolStrip activeToolId={context.activeToolId} activateTool={context.activateTool} />);
panelRegistry.register({ id: "layers", type: "inspector.layers", title: "Layers", icon: "layers", minimumSize: { width: 220, height: 180 }, preferredSize: { width: 288, height: 340 }, dockable: true, floatable: true, closable: true }, context => context.editor ? <LayersPanel editor={context.editor} dispatch={context.dispatch} /> : loadingPanel("Layers", "layers"));
panelRegistry.register({ id: "properties", type: "inspector.properties", title: "Properties", icon: "properties", minimumSize: { width: 220, height: 160 }, preferredSize: { width: 288, height: 280 }, dockable: true, floatable: true, closable: true }, context => context.editor ? <PropertiesPanel editor={context.editor} dispatch={context.dispatch} /> : loadingPanel("Properties", "properties"));
panelRegistry.register({ id: "color", type: "inspector.color", title: "Color", icon: "color", minimumSize: { width: 220, height: 140 }, preferredSize: { width: 288, height: 220 }, dockable: true, floatable: true, closable: true }, context => context.editor ? <ColorPanel editor={context.editor} dispatch={context.dispatch} /> : loadingPanel("Color", "color"));
panelRegistry.register({ id: "application-menu", type: "workspace.application-menu", title: "Application menu", icon: "document", minimumSize: { width: 180, height: 36 }, preferredSize: { width: 360, height: 36 }, dockable: true, floatable: false, closable: false }, () => null);
panelRegistry.register({ id: "tool-options", type: "workspace.tool-options", title: "Tool options", icon: "sliders", minimumSize: { width: 200, height: 36 }, preferredSize: { width: 460, height: 36 }, dockable: true, floatable: false, closable: false }, () => null);
panelRegistry.register({ id: "status", type: "workspace.status", title: "Status", icon: "status", minimumSize: { width: 280, height: 24 }, preferredSize: { width: 600, height: 24 }, dockable: true, floatable: false, closable: false }, () => null);

function ToolStrip({ activeToolId, activateTool }: { readonly activeToolId: ToolId; readonly activateTool: (toolId: ToolId) => void }) {
  return <nav className="tool-strip" aria-label="Tool strip">{toolRegistry.tools.map(tool => <span key={tool.id} className={tool.id === "brush" || tool.id === "hand" ? "tool-strip__group" : undefined}><IconButton label={`${tool.label} tool${tool.shortcut ? ` (${tool.shortcut.key.toUpperCase()})` : ""}`} icon={tool.icon} selected={tool.id === activeToolId} onClick={() => activateTool(tool.id)} /></span>)}</nav>;
}

function InspectorStack({ context }: { readonly context: PanelContext }) {
  const node = workspaceLayout.regions.right;
  const panelIds = node?.kind === "panel-stack" ? node.panelIds : [];
  const [activePanelId, setActivePanelId] = useState(node?.kind === "panel-stack" ? node.activePanelId : "layers");
  const panel = panelRegistry.require(activePanelId);
  return <Surface className="inspector-stack"><div className="panel-tabs" role="tablist" aria-label="Inspector panels">{panelIds.map(id => { const definition = panelRegistry.require(id).definition; return <button key={id} type="button" role="tab" aria-selected={id === activePanelId} className="panel-tab" onClick={() => setActivePanelId(id)}><Icon name={definition.icon} /><span>{definition.title}</span></button>; })}</div><div className="inspector-stack__content" role="tabpanel">{panel.factory(context)}</div></Surface>;
}

interface ViewportInputHandlers { readonly onPointerDown: (event: PointerEvent<HTMLElement>) => void; readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void; readonly onPointerUp: (event: PointerEvent<HTMLElement>) => void; readonly onPointerCancel: (event: PointerEvent<HTMLElement>) => void; readonly onKeyDown: (event: KeyboardEvent<HTMLElement>) => void; readonly onKeyUp: (event: KeyboardEvent<HTMLElement>) => void; }
function RendererViewport({ surfaceRef, onResize, overlayRef, cursor, input }: { readonly surfaceRef: RefObject<HTMLCanvasElement | null>; readonly onResize: (width: number, height: number) => void; readonly overlayRef: (element: HTMLDivElement | null) => void; readonly cursor: string; readonly input: ViewportInputHandlers }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!container) return;
    const update = (width: number, height: number) => { const size = normalizeWorkspaceViewportSize(width, height); if (size) onResize(size.width, size.height); };
    const observer = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) update(rect.width, rect.height); });
    observer.observe(container);
    update(container.clientWidth, container.clientHeight);
    return () => observer.disconnect();
  }, [container, onResize]);
  return <section ref={setContainer} className="document-viewport" aria-label="Document viewport" tabIndex={0} style={{ cursor }} onPointerDown={input.onPointerDown} onPointerMove={input.onPointerMove} onPointerUp={input.onPointerUp} onPointerCancel={input.onPointerCancel} onKeyDown={input.onKeyDown} onKeyUp={input.onKeyUp}><canvas ref={surfaceRef} className="renderer-surface" aria-label="Document renderer surface" /><div ref={overlayRef} className="editor-interaction-overlay" aria-hidden="true" /><div className="viewport-corner-label">Canvas</div></section>;
}

export function WorkspaceShell({ surfaceRef, diagnostics, editor, dispatchEditorAction, themeId, onThemeChange, onViewportResize, onViewportPointerDown, onViewportPointerMove, onViewportPointerUp, onViewportPointerCancel, onViewportKeyDown, onViewportKeyUp, overlayRef }: { readonly surfaceRef: RefObject<HTMLCanvasElement | null>; readonly diagnostics: DiagnosticState; readonly editor: EditorSessionSnapshot | null; readonly dispatchEditorAction: (action: EditorSessionAction) => EditorActionResult | void; readonly themeId: ThemeId; readonly onThemeChange: (theme: ThemeId) => void; readonly onViewportResize: (width: number, height: number) => void; readonly onViewportPointerDown: ViewportInputHandlers["onPointerDown"]; readonly onViewportPointerMove: ViewportInputHandlers["onPointerMove"]; readonly onViewportPointerUp: ViewportInputHandlers["onPointerUp"]; readonly onViewportPointerCancel: ViewportInputHandlers["onPointerCancel"]; readonly onViewportKeyDown: ViewportInputHandlers["onKeyDown"]; readonly onViewportKeyUp: ViewportInputHandlers["onKeyUp"]; readonly overlayRef: (element: HTMLDivElement | null) => void }) {
  const activeTool = toolRegistry.get(editor?.activeToolId ?? "move");
  const activateTool = (toolId: ToolId) => { dispatchEditorAction({ type: "set-active-tool", toolId }); };
  const panelContext = { editor, dispatch: dispatchEditorAction, activeToolId: activeTool.id, activateTool };
  return <div className="workspace-shell">
    <header className="application-bar"><div className="brand-mark" aria-hidden="true">L</div><strong>Lifix</strong><nav className="application-menu" aria-label="Application menu"><span>File</span><span>Edit</span><span>Image</span><span>Layer</span><span>Select</span><span>Filter</span><span>View</span><span>Window</span><span>Help</span></nav><div className="application-bar__spacer" /><Select label="Theme" id="workspace-theme" value={themeId} onChange={event => onThemeChange(event.target.value as ThemeId)}><option value="soft-modular">Soft</option><option value="flat-professional">Flat</option></Select></header>
    <section className="tool-options" aria-label="Tool options"><Icon name={activeTool.icon} /><strong>{activeTool.label}</strong><Divider /><span>{editor?.interactionActive ? `${activeTool.id === "marquee" ? "Creating rectangular pixel selection" : activeTool.id === "transform" ? "Transforming selected layer" : "Moving selected layer"} · Escape cancels` : activeTool.id === "move" ? "Drag the selected visible layer; release to commit." : activeTool.id === "transform" ? "Drag the box, handles, or rotation control; Shift constrains." : activeTool.id === "marquee" ? "Drag to replace the document pixel selection; click clears it." : "Tool behavior is not implemented yet."}</span></section>
    <main className="workspace-body" aria-label="Lifix professional workspace"><aside className="workspace-tool-region"><Surface className="workspace-tool-surface">{panelRegistry.require("tool-strip").factory(panelContext)}</Surface></aside><section className="workspace-center"><div className="document-tab" role="tablist" aria-label="Open documents"><button type="button" role="tab" aria-selected="true">{editor?.document.name ?? "Untitled document"} <span aria-hidden="true">×</span></button></div><RendererViewport surfaceRef={surfaceRef} onResize={onViewportResize} overlayRef={overlayRef} cursor={editor?.interactionActive && activeTool.id === "move" ? "grabbing" : activeTool.cursor} input={{ onPointerDown: onViewportPointerDown, onPointerMove: onViewportPointerMove, onPointerUp: onViewportPointerUp, onPointerCancel: onViewportPointerCancel, onKeyDown: onViewportKeyDown, onKeyUp: onViewportKeyUp }} /></section><aside className="workspace-inspector-region"><InspectorStack context={panelContext} /></aside></main>
    <footer className="workspace-status" aria-label="Application status"><span>{diagnostics.runtime.toUpperCase()}</span><span>Core {diagnostics.core.toUpperCase()}</span><span>Renderer {diagnostics.renderer.toUpperCase()}</span><span>Platform {diagnostics.platform.toUpperCase()}</span><span className="status-spacer" /><span>Layout v{workspaceLayout.formatVersion}</span></footer>
  </div>;
}
