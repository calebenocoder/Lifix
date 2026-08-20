import type { Transform } from "../core";

/** Canvas-compatible affine transform `[a, b, c, d, e, f]`. */
export interface AffineTransform { readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly e: number; readonly f: number; }

export const identityAffine = (): AffineTransform => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
export const translationAffine = (x: number, y: number): AffineTransform => ({ a: 1, b: 0, c: 0, d: 1, e: x, f: y });
/** Applies `child` in the coordinate system produced by `parent`. */
export function multiplyAffine(parent: AffineTransform, child: AffineTransform): AffineTransform {
  return { a: parent.a * child.a + parent.c * child.b, b: parent.b * child.a + parent.d * child.b, c: parent.a * child.c + parent.c * child.d, d: parent.b * child.c + parent.d * child.d, e: parent.a * child.e + parent.c * child.f + parent.e, f: parent.b * child.e + parent.d * child.f + parent.f };
}
/** Layer transforms are applied to source pixels as scale, then rotation, then position. */
export function affineFromTransform(transform: Transform): AffineTransform {
  const radians = transform.rotation * Math.PI / 180; const cosine = Math.cos(radians); const sine = Math.sin(radians);
  return { a: cosine * transform.scale.x, b: sine * transform.scale.x, c: -sine * transform.scale.y, d: cosine * transform.scale.y, e: transform.position.x, f: transform.position.y };
}
export function transformPoint(transform: AffineTransform, point: { readonly x: number; readonly y: number }): { readonly x: number; readonly y: number } { return { x: transform.a * point.x + transform.c * point.y + transform.e, y: transform.b * point.x + transform.d * point.y + transform.f }; }
/** Applies only the linear portion of an affine transform, which is appropriate for a movement delta. */
export function transformVector(transform: AffineTransform, vector: { readonly x: number; readonly y: number }): { readonly x: number; readonly y: number } { return { x: transform.a * vector.x + transform.c * vector.y, y: transform.b * vector.x + transform.d * vector.y }; }
/** Returns undefined for singular/non-finite transforms rather than producing invalid coordinates. */
export function invertAffine(transform: AffineTransform): AffineTransform | undefined {
  if (![transform.a, transform.b, transform.c, transform.d, transform.e, transform.f].every(Number.isFinite)) return undefined;
  const determinant = transform.a * transform.d - transform.b * transform.c;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= Number.EPSILON) return undefined;
  const a = transform.d / determinant; const b = -transform.b / determinant; const c = -transform.c / determinant; const d = transform.a / determinant;
  return { a, b, c, d, e: -(a * transform.e + c * transform.f), f: -(b * transform.e + d * transform.f) };
}
