import { createRgba8RasterSource, type RasterSource } from "./raster-source";

function pattern(id: string, width: number, height: number, pixel: (x: number, y: number) => readonly [number, number, number, number]): RasterSource { const pixels = new Uint8ClampedArray(width * height * 4); for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) pixels.set(pixel(x, y), (y * width + x) * 4); return createRgba8RasterSource(id, width, height, pixels); }
export function createDiagnosticRasterSources(): readonly RasterSource[] {
  const background = pattern("diagnostic-background", 256, 128, (x, y) => ((Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0 ? [39, 56, 92, 255] : [55, 78, 120, 255]));
  const quadrants = pattern("diagnostic-quadrants", 161, 119, (x, y) => x < 12 && y < 12 ? [255, 255, 255, 255] : x >= 149 && y < 12 ? [0, 0, 0, 255] : x < 80 && y < 59 ? [239, 68, 68, 255] : x >= 80 && y < 59 ? [34, 197, 94, 255] : x < 80 ? [59, 130, 246, 255] : [250, 204, 21, 255]);
  const alpha = pattern("diagnostic-alpha", 127, 79, (x, y) => [236, 72 + Math.round(y / 78 * 80), 153, Math.round(x / 126 * 255)]);
  const marker = pattern("diagnostic-marker", 73, 101, (x, y) => x < 10 || y < 10 ? [255, 255, 255, 255] : x > 55 && y > 78 ? [249, 115, 22, 255] : [124, 58, 237, 255]);
  const hidden = pattern("diagnostic-hidden", 17, 9, (x, y) => [16, 185, 129, (x + y) % 2 ? 255 : 96]);
  return [background, quadrants, alpha, marker, hidden];
}
