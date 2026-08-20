import { useEffect, useState, type ReactNode, type RefObject } from "react";
import type { CoreStatus } from "../core";
import type { PlatformRuntime } from "../platform";
import type { RendererStatus } from "../renderer";
import type { ThemeId } from "./design-system";
import { Divider, IconButton, PanelChrome, ScrollArea, Select, Surface } from "./primitives";
import { Icon, type IconName } from "./icons";
import { normalizeWorkspaceViewportSize, PanelRegistry, createWorkspaceLayout } from "./workspace";

interface DiagnosticState { readonly runtime: PlatformRuntime["kind"]; readonly platform: PlatformRuntime["status"]; readonly core: CoreStatus; readonly renderer: RendererStatus; }
type PanelFactory = () => ReactNode;

const workspaceLayout = createWorkspaceLayout();
const panelRegistry = new PanelRegistry<PanelFactory>();
panelRegistry.register({ id: "tool-strip", type: "workspace.tools", title: "Tools", icon: "tools", minimumSize: { width: 44, height: 240 }, preferredSize: { width: 52, height: 520 }, dockable: true, floatable: true, closable: false }, () => <ToolStrip />);
panelRegistry.register({ id: "layers", type: "inspector.layers", title: "Layers", icon: "layers", minimumSize: { width: 220, height: 180 }, preferredSize: { width: 288, height: 340 }, dockable: true, floatable: true, closable: true }, () => <PanelChrome title="Layers" icon="layers"><ScrollArea className="layers-shell"><div className="layers-shell__empty"><Icon name="layers" /><strong>Document layers</strong><span>Layer controls will appear here when the workspace connects to the Core.</span></div></ScrollArea></PanelChrome>);
panelRegistry.register({ id: "properties", type: "inspector.properties", title: "Properties", icon: "properties", minimumSize: { width: 220, height: 160 }, preferredSize: { width: 288, height: 280 }, dockable: true, floatable: true, closable: true }, () => <PanelChrome title="Properties" icon="properties"><div className="panel-empty-state"><Icon name="properties" /><strong>No active selection</strong><span>Select an editable object to view its properties.</span></div></PanelChrome>);
panelRegistry.register({ id: "color", type: "inspector.color", title: "Color", icon: "color", minimumSize: { width: 220, height: 140 }, preferredSize: { width: 288, height: 220 }, dockable: true, floatable: true, closable: true }, () => <PanelChrome title="Color" icon="color"><div className="color-shell" aria-label="Color panel placeholder"><div className="color-shell__preview" /><span>Color controls will appear with editing tools.</span></div></PanelChrome>);
panelRegistry.register({ id: "application-menu", type: "workspace.application-menu", title: "Application menu", icon: "document", minimumSize: { width: 180, height: 36 }, preferredSize: { width: 360, height: 36 }, dockable: true, floatable: false, closable: false }, () => null);
panelRegistry.register({ id: "tool-options", type: "workspace.tool-options", title: "Tool options", icon: "sliders", minimumSize: { width: 200, height: 36 }, preferredSize: { width: 460, height: 36 }, dockable: true, floatable: false, closable: false }, () => null);
panelRegistry.register({ id: "status", type: "workspace.status", title: "Status", icon: "status", minimumSize: { width: 280, height: 24 }, preferredSize: { width: 600, height: 24 }, dockable: true, floatable: false, closable: false }, () => null);

function ToolStrip() {
  const tools: readonly [IconName, string, boolean?][] = [["pointer", "Move tool", true], ["marquee", "Selection tool"], ["brush", "Brush tool"], ["eraser", "Eraser tool"], ["crop", "Crop tool"], ["text", "Text tool"], ["shape", "Shape tool"], ["hand", "Hand tool"], ["zoom", "Zoom tool"]];
  return <nav className="tool-strip" aria-label="Tool strip">{tools.map(([icon, label, selected], index) => <span key={icon} className={index === 5 || index === 7 ? "tool-strip__group" : undefined}><IconButton label={`${label} (not available yet)`} icon={icon} selected={selected} /></span>)}</nav>;
}

function InspectorStack() {
  const node = workspaceLayout.regions.right;
  const panelIds = node?.kind === "panel-stack" ? node.panelIds : [];
  const [activePanelId, setActivePanelId] = useState(node?.kind === "panel-stack" ? node.activePanelId : "layers");
  const panel = panelRegistry.require(activePanelId);
  return <Surface className="inspector-stack"><div className="panel-tabs" role="tablist" aria-label="Inspector panels">{panelIds.map(id => { const definition = panelRegistry.require(id).definition; return <button key={id} type="button" role="tab" aria-selected={id === activePanelId} className="panel-tab" onClick={() => setActivePanelId(id)}><Icon name={definition.icon} /><span>{definition.title}</span></button>; })}</div><div className="inspector-stack__content" role="tabpanel">{panel.factory()}</div></Surface>;
}

function RendererViewport({ surfaceRef, onResize }: { readonly surfaceRef: RefObject<HTMLCanvasElement | null>; readonly onResize: (width: number, height: number) => void }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!container) return;
    const update = (width: number, height: number) => { const size = normalizeWorkspaceViewportSize(width, height); if (size) onResize(size.width, size.height); };
    const observer = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) update(rect.width, rect.height); });
    observer.observe(container);
    update(container.clientWidth, container.clientHeight);
    return () => observer.disconnect();
  }, [container, onResize]);
  return <section ref={setContainer} className="document-viewport" aria-label="Document viewport"><canvas ref={surfaceRef} className="renderer-surface" aria-label="Document renderer surface" /><div className="viewport-corner-label">Canvas</div></section>;
}

export function WorkspaceShell({ surfaceRef, diagnostics, themeId, onThemeChange, onViewportResize }: { readonly surfaceRef: RefObject<HTMLCanvasElement | null>; readonly diagnostics: DiagnosticState; readonly themeId: ThemeId; readonly onThemeChange: (theme: ThemeId) => void; readonly onViewportResize: (width: number, height: number) => void }) {
  return <div className="workspace-shell">
    <header className="application-bar"><div className="brand-mark" aria-hidden="true">L</div><strong>Lifix</strong><nav className="application-menu" aria-label="Application menu"><span>File</span><span>Edit</span><span>Image</span><span>Layer</span><span>Select</span><span>Filter</span><span>View</span><span>Window</span><span>Help</span></nav><div className="application-bar__spacer" /><Select label="Theme" id="workspace-theme" value={themeId} onChange={event => onThemeChange(event.target.value as ThemeId)}><option value="soft-modular">Soft</option><option value="flat-professional">Flat</option></Select></header>
    <section className="tool-options" aria-label="Tool options"><Icon name="pointer" /><strong>Move</strong><Divider /><span>Tool options will appear here when editing tools are introduced.</span></section>
    <main className="workspace-body" aria-label="Lifix professional workspace"><aside className="workspace-tool-region"><Surface className="workspace-tool-surface">{panelRegistry.require("tool-strip").factory()}</Surface></aside><section className="workspace-center"><div className="document-tab" role="tablist" aria-label="Open documents"><button type="button" role="tab" aria-selected="true">Untitled document <span aria-hidden="true">×</span></button></div><RendererViewport surfaceRef={surfaceRef} onResize={onViewportResize} /></section><aside className="workspace-inspector-region"><InspectorStack /></aside></main>
    <footer className="workspace-status" aria-label="Application status"><span>{diagnostics.runtime.toUpperCase()}</span><span>Core {diagnostics.core.toUpperCase()}</span><span>Renderer {diagnostics.renderer.toUpperCase()}</span><span>Platform {diagnostics.platform.toUpperCase()}</span><span className="status-spacer" /><span>Layout v{workspaceLayout.formatVersion}</span></footer>
  </div>;
}
