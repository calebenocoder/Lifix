import type { ThemeId } from "../design-system";

export type PanelId = string;
export type PanelIconId = "panel" | "sliders" | "grid" | "info" | "layers" | "color" | "properties" | "tools" | "status" | "document";
export interface PanelSize { readonly width: number; readonly height: number; }
export interface PanelDefinition { readonly id: PanelId; readonly type: string; readonly title: string; readonly icon: PanelIconId; readonly minimumSize: PanelSize; readonly preferredSize: PanelSize; readonly maximumSize?: Partial<PanelSize>; readonly dockable: boolean; readonly floatable: boolean; readonly closable: boolean; }

export type DockRegion = "left" | "right" | "top" | "bottom";
export interface PanelStackNode { readonly kind: "panel-stack"; readonly id: string; readonly panelIds: readonly PanelId[]; readonly activePanelId: PanelId; }
export interface SplitNode { readonly kind: "split"; readonly id: string; readonly axis: "horizontal" | "vertical"; readonly ratio: number; readonly first: WorkspaceNode; readonly second: WorkspaceNode; }
export type WorkspaceNode = PanelStackNode | SplitNode;
export interface FloatingBounds { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export interface FloatingPanel { readonly panelId: PanelId; readonly bounds: FloatingBounds; readonly zIndex: number; }
export interface WorkspaceLayout { readonly formatVersion: 1; readonly presetId: string; readonly themeId: ThemeId; readonly regions: Readonly<Record<DockRegion, WorkspaceNode | null>>; readonly floatingPanels: readonly FloatingPanel[]; }

export const WORKSPACE_FORMAT_VERSION = 1 as const;
/** Default professional-shell layout. The stable IDs are UI-only and future-dockable. */
export function createWorkspaceLayout(themeId: ThemeId = "soft-modular"): WorkspaceLayout { return { formatVersion: WORKSPACE_FORMAT_VERSION, presetId: "professional-shell", themeId, regions: { left: { kind: "panel-stack", id: "tool-strip-stack", panelIds: ["tool-strip"], activePanelId: "tool-strip" }, right: { kind: "panel-stack", id: "inspector-stack", panelIds: ["layers", "properties", "color"], activePanelId: "layers" }, top: { kind: "panel-stack", id: "application-stack", panelIds: ["application-menu", "tool-options"], activePanelId: "application-menu" }, bottom: { kind: "panel-stack", id: "status-stack", panelIds: ["status"], activePanelId: "status" } }, floatingPanels: [] }; }
