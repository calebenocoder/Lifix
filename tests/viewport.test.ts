import { actualSize, clampZoom, createViewport, documentBounds, documentToViewport, fitDocument, fitWidth, panBy, panTo, viewportToDocument, zoomAround } from "../src/renderer";
import { describe, expect, it } from "vitest";

describe("renderer viewport math", () => {
  const viewport = createViewport(800, 600, 1.5, 2, 100, 50);

  it("converts document and viewport coordinates as exact inverses", () => {
    const point = { x: 123.5, y: -20.25 };
    expect(documentToViewport(point, viewport)).toEqual({ x: 347, y: 9.5 });
    expect(viewportToDocument(documentToViewport(point, viewport), viewport)).toEqual(point);
  });

  it("clamps zoom and preserves the document point under zoom focus", () => {
    expect(clampZoom(0)).toBe(0.01); expect(clampZoom(100)).toBe(64);
    const point = { x: 799, y: 1 }; const before = viewportToDocument(point, viewport);
    const zoomed = zoomAround(viewport, point, 0.5);
    expect(viewportToDocument(point, zoomed)).toEqual(before);
    expect(zoomed.zoom).toBe(0.5);
  });

  it("sets and moves pan in logical viewport coordinates", () => {
    expect(panTo(viewport, { x: 0, y: 0 })).toMatchObject({ offsetX: 0, offsetY: 0 });
    expect(panBy(viewport, { x: -20, y: 30 })).toMatchObject({ offsetX: 80, offsetY: 80 });
  });

  it("fits documents, width, and actual size deterministically", () => {
    const document = { width: 1600, height: 400 };
    const fit = fitDocument(document, createViewport(800, 600), 40);
    expect(fit.zoom).toBeCloseTo(0.45); expect(documentBounds(document, fit)).toMatchObject({ width: 720, height: 180, x: 40, y: 210 });
    const width = fitWidth(document, createViewport(800, 600), 40);
    expect(width.zoom).toBeCloseTo(0.45);
    expect(actualSize(document, createViewport(10, 10))).toMatchObject({ zoom: 1, offsetX: -795, offsetY: -195 });
  });

  it("retains transform while a resized viewport changes only viewport bounds", () => {
    const resized = { ...viewport, width: 333, height: 111 };
    expect(resized).toMatchObject({ zoom: 2, offsetX: 100, offsetY: 50, devicePixelRatio: 1.5 });
    expect(documentBounds({ width: 100, height: 200 }, resized)).toEqual({ x: 100, y: 50, width: 200, height: 400 });
  });
});
