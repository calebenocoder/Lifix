import { describe, expect, it } from "vitest";
import { createWorkspaceLayout, deserializeWorkspaceLayout, detectSnapIntent, normalizeWorkspaceViewportSize, PanelRegistry, serializeWorkspaceLayout, validateWorkspaceLayout, type DockTarget, type PanelDefinition, type WorkspaceLayout } from "../src/ui/workspace";

const definition = (id: string): PanelDefinition => ({ id, type: `test.${id}`, title: id, icon: "panel", minimumSize: { width: 100, height: 80 }, preferredSize: { width: 220, height: 260 }, dockable: true, floatable: true, closable: true });
function registry() { const result = new PanelRegistry<string>(); for (const id of ["tool-strip", "layers", "properties", "color", "application-menu", "tool-options", "status"]) result.register(definition(id), `${id}-factory`); return result; }

describe("panel registry", () => {
  it("uses stable IDs and rejects duplicates", () => {
    const panels = registry();
    expect(panels.require("layers").factory).toBe("layers-factory");
    expect(panels.list().map(panel => panel.definition.id)).toContain("tool-strip");
    expect(() => panels.register(definition("layers"), "duplicate")).toThrow("already registered");
    expect(() => panels.require("missing")).toThrow("not registered");
    expect(() => panels.register({ ...definition("invalid"), preferredSize: { width: 90, height: 100 } }, "invalid")).toThrow("preferred size");
  });
});

describe("workspace layout", () => {
  it("validates and round-trips the versioned foundation layout", () => {
    const layout = createWorkspaceLayout("flat-professional");
    const serialized = serializeWorkspaceLayout(layout);
    expect(deserializeWorkspaceLayout(serialized, registry())).toEqual(layout);
    expect(JSON.parse(serialized).formatVersion).toBe(1);
    expect(layout.presetId).toBe("professional-shell");
    expect(layout.regions.right).toMatchObject({ panelIds: ["layers", "properties", "color"], activePanelId: "layers" });
  });

  it("supports nested splits, tabs, and floating bounds as UI-only data", () => {
    const base = createWorkspaceLayout();
    const layout: WorkspaceLayout = { ...base, regions: { ...base.regions, left: { kind: "split", id: "left-split", axis: "vertical", ratio: 0.4, first: { kind: "panel-stack", id: "left-a", panelIds: ["tool-strip"], activePanelId: "tool-strip" }, second: { kind: "panel-stack", id: "left-b", panelIds: ["layers"], activePanelId: "layers" } }, right: null }, floatingPanels: [] };
    expect(validateWorkspaceLayout(layout, registry())).toEqual(layout);
  });

  it("rejects unknown panels, duplicate identities, invalid ratios, and versions", () => {
    const base = createWorkspaceLayout();
    expect(() => validateWorkspaceLayout({ ...base, formatVersion: 2 })).toThrow("Unsupported workspace format version");
    expect(() => validateWorkspaceLayout(base, new PanelRegistry())).toThrow("not registered");
    expect(() => validateWorkspaceLayout({ ...base, regions: { ...base.regions, left: { kind: "split", id: "split", axis: "horizontal", ratio: 1, first: base.regions.left, second: base.regions.right }, right: null } })).toThrow("between 0 and 1");
    expect(() => validateWorkspaceLayout({ ...base, floatingPanels: [{ panelId: "tool-strip", bounds: { x: 0, y: 0, width: 100, height: 100 }, zIndex: 1 }] })).toThrow("appears more than once");
  });
});

describe("workspace viewport geometry", () => {
  it("normalizes finite logical surface sizes without inventing physical-pixel behavior", () => {
    expect(normalizeWorkspaceViewportSize(800.8, 599.2)).toEqual({ width: 800, height: 599 });
    expect(normalizeWorkspaceViewportSize(0, 50)).toBeUndefined();
    expect(normalizeWorkspaceViewportSize(Number.NaN, 50)).toBeUndefined();
  });
});

describe("magnetic docking intent", () => {
  const targets: readonly DockTarget[] = [
    { id: "right", kind: "workspace-edge", edge: "right", bounds: { x: 0, y: 0, width: 500, height: 400 }, accepts: "all" },
    { id: "restricted", kind: "panel-edge", edge: "left", bounds: { x: 490, y: 0, width: 200, height: 400 }, accepts: ["other-panel"] },
  ];

  it("detects the closest compatible geometry and preserves validity separately", () => {
    expect(detectSnapIntent("moving", { x: 498, y: 200 }, targets, 12)).toMatchObject({ panelId: "moving", targetId: "right", edge: "right", distance: 2, valid: true });
    expect(detectSnapIntent("moving", { x: 489, y: 200 }, targets, 12)).toMatchObject({ targetId: "restricted", valid: false });
    expect(detectSnapIntent("moving", { x: 300, y: 200 }, targets, 12)).toBeUndefined();
  });

  it("breaks equal-distance ties deterministically", () => {
    const tied: readonly DockTarget[] = [
      { id: "z-target", kind: "workspace-edge", edge: "left", bounds: { x: 10, y: 0, width: 50, height: 50 }, accepts: "all" },
      { id: "a-target", kind: "workspace-edge", edge: "left", bounds: { x: 10, y: 0, width: 50, height: 50 }, accepts: "all" },
    ];
    expect(detectSnapIntent("moving", { x: 10, y: 20 }, tied)?.targetId).toBe("a-target");
  });
});
