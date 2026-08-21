import { RasterStore, createDocument, createRasterLayer } from "../src/core";
import { affineFromTransform, invertAffine, transformPoint } from "../src/renderer";
import { createEditorSession } from "../src/ui/editor";
import { createBrushToolController, toolRegistry, type ToolContext, type ToolPointerInput } from "../src/ui/tools";
import { describe, expect, it } from "vitest";

const input = (document: { x: number; y: number }, pressure = 1): ToolPointerInput => ({ pointerId: 1, pointerType: "mouse", buttons: 1, pressure, tiltX: 0, tiltY: 0, viewport: document, document, modifiers: { shift: false, alt: false, control: false, meta: false } });
function fixture(transform = { position: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, rotation: 0 }, visible = true) {
  const store = new RasterStore(); store.create({ id: "asset", width: 128, height: 128 }); const document = createDocument("doc", "Doc", 300, 300); document.layerTree.add(createRasterLayer("layer", "Paint", { transform, visible }, { kind: "raster-reference", sourceId: "asset", storage: "tiled" })); const session = createEditorSession(document, () => {}); session.dispatch({ type: "select-layer", layerId: "layer" }); const world = affineFromTransform(transform); const inverse = invertAffine(world)!; const previews: string[] = [];
  const context: ToolContext = { getSessionSnapshot: () => session.snapshot, getViewport: () => ({ width: 300, height: 300, devicePixelRatio: 1, zoom: 1, offsetX: 0, offsetY: 0 }), beginPreview: preview => previews.push(preview.kind), updatePreview: preview => previews.push(preview.kind), cancelPreview: () => previews.push("cancel"), completePreview: () => previews.push("complete"), setRendererTransformPreview: () => {}, getTransformTarget: () => undefined, setTransformBox: () => {}, setBrushCursor: () => {}, commit: () => ({ ok: true }), brush: { store, resolveTarget: () => ({ layerId: "layer", assetId: "asset", world, worldInverse: inverse, documentRevision: session.snapshot.documentRevision }) } };
  return { store, session, context, previews, world };
}

describe("Brush tool controller", () => {
  it("is registered and paints a selected visible RasterStore raster with mouse pressure fallback", () => {
    expect(toolRegistry.get("brush").createController).toBe(createBrushToolController); const setup = fixture(); const controller = createBrushToolController(); expect(controller.pointerDown!(input({ x: 20.5, y: 20.5 }, 0), setup.context)).toBe(true); controller.pointerUp!(input({ x: 20.5, y: 20.5 }, 0), setup.context); expect(setup.store.get("asset")!.readPixel(20, 20)[3]).toBeGreaterThan(0); expect(setup.store.get("asset")!.revision).toBe(1); expect(setup.previews).toContain("brush-stroke"); expect(setup.previews).toContain("complete");
  });

  it("maps transformed document coordinates into raster-local pixels, including negative scale", () => {
    const setup = fixture({ position: { x: 80, y: 70 }, scale: { x: -1.5, y: 0.75 }, rotation: 25 }); const local = { x: 30.5, y: 40.5 }; const documentPoint = transformPoint(setup.world, local); const controller = createBrushToolController(); expect(controller.pointerDown!(input(documentPoint), setup.context)).toBe(true); controller.pointerUp!(input(documentPoint), setup.context); expect(setup.store.get("asset")!.readPixel(30, 40)[3]).toBeGreaterThan(0);
  });

  it("rejects hidden and missing targets, and rolls back when selection changes mid-stroke", () => {
    const hidden = fixture(undefined, false); expect(createBrushToolController().pointerDown!(input({ x: 10, y: 10 }), hidden.context)).toBe(false);
    const setup = fixture(); const controller = createBrushToolController(); controller.pointerDown!(input({ x: 20, y: 20 }), setup.context); setup.session.dispatch({ type: "select-layer", layerId: null }); controller.sessionChanged!(setup.context); expect(setup.store.get("asset")!.revision).toBe(0); expect(setup.store.get("asset")!.allocatedTileCount).toBe(0); expect(setup.previews).toContain("cancel");
  });

  it("freezes active stroke settings/color while session settings affect the next stroke", () => {
    const setup = fixture(); const controller = createBrushToolController(); controller.pointerDown!(input({ x: 10.5, y: 10.5 }), setup.context); setup.session.dispatch({ type: "set-brush-settings", settings: { diameter: 80, opacity: 0 } }); setup.session.dispatch({ type: "set-foreground-color", color: { r: 0, g: 255, b: 0 } }); controller.pointerUp!(input({ x: 20.5, y: 10.5 }), setup.context); expect(setup.store.get("asset")!.readPixel(10, 10)[0]).toBeGreaterThan(0); controller.pointerDown!(input({ x: 80.5, y: 80.5 }), setup.context); controller.pointerUp!(input({ x: 80.5, y: 80.5 }), setup.context); expect(setup.store.get("asset")!.readPixel(80, 80)).toEqual([0, 0, 0, 0]);
  });
});
