import type { ReactNode, RefObject } from "react";
import type { CoreStatus } from "../core";
import type { PlatformRuntime } from "../platform";
import type { RendererStatus } from "../renderer";
import type { ThemeId } from "./design-system";
import { Button, Divider, IconButton, PanelChrome, ScrollArea, Select, Surface, TextInput } from "./primitives";
import { PanelRegistry, createWorkspaceLayout } from "./workspace";

interface DiagnosticState { readonly runtime: PlatformRuntime["kind"]; readonly platform: PlatformRuntime["status"]; readonly core: CoreStatus; readonly renderer: RendererStatus; }
type PanelFactory = () => ReactNode;
const panelRegistry = new PanelRegistry<PanelFactory>();
panelRegistry.register({ id: "panel-specimen", type: "foundation.panel", title: "Panel specimen", icon: "panel", minimumSize: { width: 180, height: 140 }, preferredSize: { width: 230, height: 300 }, dockable: true, floatable: true, closable: true }, () => <PanelChrome title="Panel specimen" icon="panel" actions={<IconButton label="Panel options" icon="more" />}><ScrollArea><button className="specimen-row specimen-row--selected" type="button"><span className="specimen-thumb" />Selected item</button><button className="specimen-row" type="button"><span className="specimen-thumb specimen-thumb--alt" />Secondary item</button><p className="ui-help-text">Stable panel IDs restore layout without serializing React components.</p></ScrollArea></PanelChrome>);
panelRegistry.register({ id: "controls-specimen", type: "foundation.controls", title: "Control specimen", icon: "sliders", minimumSize: { width: 210, height: 160 }, preferredSize: { width: 260, height: 320 }, dockable: true, floatable: true, closable: true }, () => <PanelChrome title="Control specimen" icon="sliders"><TextInput id="specimen-name" label="Name" defaultValue="Untitled" /><Select id="specimen-mode" label="Mode" defaultValue="normal"><option value="normal">Normal</option><option value="multiply">Multiply</option></Select><Divider /><div className="button-row"><Button appearance="primary">Apply</Button><Button appearance="subtle">Reset</Button></div></PanelChrome>);
const foundationLayout = createWorkspaceLayout();

export function WorkspaceSandbox({ surfaceRef, diagnostics, themeId, onThemeChange }: { readonly surfaceRef: RefObject<HTMLCanvasElement | null>; readonly diagnostics: DiagnosticState; readonly themeId: ThemeId; readonly onThemeChange: (theme: ThemeId) => void }) {
  const leftPanel = panelRegistry.require(foundationLayout.regions.left?.kind === "panel-stack" ? foundationLayout.regions.left.activePanelId : "panel-specimen").factory(); const rightPanel = panelRegistry.require(foundationLayout.regions.right?.kind === "panel-stack" ? foundationLayout.regions.right.activePanelId : "controls-specimen").factory();
  return <div className="workspace-sandbox">
    <Surface level="toolbar" className="workspace-toolbar"><div className="brand-mark">L</div><div><strong>Lifix</strong><span>UI foundation</span></div><Divider /><IconButton label="Pointer" icon="pointer" selected /><IconButton label="Zoom" icon="zoom" /><div className="toolbar-spacer" /><span className="toolbar-label">Theme</span><Button appearance="subtle" selected={themeId === "soft-modular"} onClick={() => onThemeChange("soft-modular")}>Soft</Button><Button appearance="subtle" selected={themeId === "flat-professional"} onClick={() => onThemeChange("flat-professional")}>Flat</Button></Surface>
    <main className="workspace-grid" aria-label="UI architecture sandbox"><Surface className="workspace-panel workspace-panel--left">{leftPanel}</Surface><section className="document-area" aria-label="Document area"><canvas ref={surfaceRef} className="renderer-surface" aria-label="Renderer validation surface" /><Surface level="floating" className="viewport-badge"><span className="status-dot" />Renderer {diagnostics.renderer.toUpperCase()}</Surface></section><Surface className="workspace-panel workspace-panel--right">{rightPanel}</Surface></main>
    <Surface level="toolbar" className="workspace-status" aria-label="Runtime diagnostics"><span>{diagnostics.runtime.toUpperCase()}</span><span>Core {diagnostics.core.toUpperCase()}</span><span>Platform {diagnostics.platform.toUpperCase()}</span><span className="status-spacer" /><span>Layout v{foundationLayout.formatVersion}</span></Surface>
  </div>;
}
