import { type RasterAssetId, type RasterDirtyBounds, type RasterDirtyTile, type RasterMutationTransaction, RasterStore } from "./raster-store";

/** Platform-neutral raster-local input. Pixel centers are at `(integer + 0.5, integer + 0.5)`. */
export interface BrushSample { readonly x: number; readonly y: number; readonly pressure: number; readonly timestamp?: number; readonly tiltX?: number; readonly tiltY?: number; readonly twist?: number; }
export interface BrushColor { readonly r: number; readonly g: number; readonly b: number; readonly a?: number; }
export interface BrushPressureMapping { /** 0 ignores pressure; 1 makes diameter proportional to pressure. */ readonly size: number; /** 0 ignores pressure; 1 makes per-dab alpha proportional to pressure. */ readonly opacity: number; }
/** A small procedural round-brush preset. Opacity is the stroke alpha scale; flow is the contribution of each dab. */
export interface RoundBrushPreset { readonly diameter: number; readonly hardness: number; readonly opacity: number; readonly flow: number; /** Distance between dabs as a fraction of base diameter. */ readonly spacing: number; readonly color: BrushColor; readonly pressure?: Partial<BrushPressureMapping>; }
export interface RasterStrokeTarget { readonly assetId: RasterAssetId; }
export interface BrushStrokeResult { readonly assetId: RasterAssetId; readonly sampleCount: number; readonly dabCount: number; readonly changed: boolean; readonly revision?: number; readonly dirtyTiles: readonly RasterDirtyTile[]; readonly dirtyBounds?: RasterDirtyBounds; }

interface NormalizedPreset { readonly diameter: number; readonly hardness: number; readonly opacity: number; readonly flow: number; readonly spacing: number; readonly color: readonly [number, number, number, number]; readonly pressure: BrushPressureMapping; }

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));
function validUnit(value: number, label: string): number { if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError(`${label} must be finite and between 0 and 1`); return value; }
function normalizedPreset(preset: RoundBrushPreset): NormalizedPreset {
  if (!Number.isFinite(preset.diameter) || preset.diameter <= 0) throw new RangeError("Brush diameter must be positive and finite"); if (!Number.isFinite(preset.spacing) || preset.spacing <= 0) throw new RangeError("Brush spacing must be positive and finite");
  const color = [preset.color.r, preset.color.g, preset.color.b, preset.color.a ?? 255] as const; if (color.some(channel => !Number.isInteger(channel) || channel < 0 || channel > 255)) throw new RangeError("Brush color channels must be integer values between 0 and 255");
  return { diameter: Math.max(0.01, preset.diameter), hardness: validUnit(preset.hardness, "Brush hardness"), opacity: validUnit(preset.opacity, "Brush opacity"), flow: validUnit(preset.flow, "Brush flow"), spacing: preset.spacing, color, pressure: { size: validUnit(preset.pressure?.size ?? 0, "Brush pressure size mapping"), opacity: validUnit(preset.pressure?.opacity ?? 0, "Brush pressure opacity mapping") } };
}
function validSample(sample: BrushSample): void { if (![sample.x, sample.y, sample.pressure].every(Number.isFinite) || sample.pressure < 0 || sample.pressure > 1) throw new RangeError("Brush sample position must be finite and pressure must be between 0 and 1"); if (sample.timestamp !== undefined && !Number.isFinite(sample.timestamp)) throw new RangeError("Brush sample timestamp must be finite when provided"); }
function interpolate(first: BrushSample, second: BrushSample, factor: number): BrushSample { return { x: first.x + (second.x - first.x) * factor, y: first.y + (second.y - first.y) * factor, pressure: first.pressure + (second.pressure - first.pressure) * factor, timestamp: first.timestamp === undefined || second.timestamp === undefined ? undefined : first.timestamp + (second.timestamp - first.timestamp) * factor }; }
function sourceOver(destination: readonly [number, number, number, number], color: readonly [number, number, number, number], alpha: number): readonly [number, number, number, number] {
  const sourceAlpha = clamp(color[3] / 255 * alpha, 0, 1); if (sourceAlpha <= 0) return destination; const destinationAlpha = destination[3] / 255; const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha); if (outputAlpha <= 0) return [0, 0, 0, 0];
  const channel = (source: number, target: number): number => Math.round(clamp((source * sourceAlpha + target * destinationAlpha * (1 - sourceAlpha)) / outputAlpha, 0, 255)); return [channel(color[0], destination[0]), channel(color[1], destination[1]), channel(color[2], destination[2]), Math.round(outputAlpha * 255)];
}
function coverageAt(distance: number, radius: number, hardness: number): number { const inner = radius * hardness; const outer = radius + 0.5; if (distance <= inner) return 1; if (distance >= outer) return 0; const t = clamp((distance - inner) / Math.max(outer - inner, Number.EPSILON), 0, 1); return 1 - t * t * (3 - 2 * t); }

/** One logical stroke stages its dabs in exactly one RasterMutationTransaction. It has no UI or renderer dependency. */
export class BrushStrokeSession {
  readonly #transaction: RasterMutationTransaction;
  readonly #preset: NormalizedPreset;
  #previous?: BrushSample;
  #distanceToNext: number;
  #samples = 0;
  #dabs = 0;
  #closed = false;
  constructor(store: RasterStore, readonly target: RasterStrokeTarget, preset: RoundBrushPreset) { this.#preset = normalizedPreset(preset); this.#transaction = store.beginMutation(target.assetId); this.#distanceToNext = this.#preset.diameter * this.#preset.spacing; }
  /** Adds ordered raster-local input. The first sample always creates an initial dab. */
  addSample(sample: BrushSample): void {
    this.#assertOpen(); validSample(sample); this.#samples += 1; const previous = this.#previous; if (!previous) { this.#dab(sample); this.#previous = sample; return; }
    const dx = sample.x - previous.x, dy = sample.y - previous.y, distance = Math.hypot(dx, dy); if (distance > 0) { let travelled = 0; while (distance - travelled + Number.EPSILON >= this.#distanceToNext) { travelled += this.#distanceToNext; this.#dab(interpolate(previous, sample, travelled / distance)); this.#distanceToNext = this.#preset.diameter * this.#preset.spacing; } this.#distanceToNext -= distance - travelled; }
    this.#previous = sample;
  }
  finish(): BrushStrokeResult { this.#assertOpen(); this.#closed = true; const mutation = this.#transaction.commit(); return { assetId: this.target.assetId, sampleCount: this.#samples, dabCount: this.#dabs, changed: Boolean(mutation), revision: mutation?.revision, dirtyTiles: mutation?.dirtyTiles ?? [], dirtyBounds: mutation?.dirtyBounds }; }
  cancel(): BrushStrokeResult { this.#assertOpen(); this.#closed = true; this.#transaction.rollback(); return { assetId: this.target.assetId, sampleCount: this.#samples, dabCount: this.#dabs, changed: false, dirtyTiles: [] }; }
  #dab(sample: BrushSample): void {
    const sizeFactor = 1 - this.#preset.pressure.size + sample.pressure * this.#preset.pressure.size; const opacityFactor = 1 - this.#preset.pressure.opacity + sample.pressure * this.#preset.pressure.opacity; const radius = Math.max(0.005, this.#preset.diameter * sizeFactor / 2); const alpha = this.#preset.opacity * this.#preset.flow * opacityFactor; this.#dabs += 1; if (alpha <= 0) return;
    const asset = this.#transaction.asset; const left = Math.max(0, Math.floor(sample.x - radius - 0.5)); const top = Math.max(0, Math.floor(sample.y - radius - 0.5)); const right = Math.min(asset.width - 1, Math.ceil(sample.x + radius + 0.5)); const bottom = Math.min(asset.height - 1, Math.ceil(sample.y + radius + 0.5));
    for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) { const coverage = coverageAt(Math.hypot(x + 0.5 - sample.x, y + 0.5 - sample.y), radius, this.#preset.hardness); if (coverage <= 0) continue; const previous = this.#transaction.readPixel(x, y); const next = sourceOver(previous, this.#preset.color, alpha * coverage); if (next[0] !== previous[0] || next[1] !== previous[1] || next[2] !== previous[2] || next[3] !== previous[3]) this.#transaction.writePixel(x, y, next); }
  }
  #assertOpen(): void { if (this.#closed) throw new Error("Brush stroke session is closed"); }
}

export function beginBrushStroke(store: RasterStore, target: RasterStrokeTarget, preset: RoundBrushPreset): BrushStrokeSession { return new BrushStrokeSession(store, target, preset); }
