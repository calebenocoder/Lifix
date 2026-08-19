import type { Transform } from "../core";

/** Canvas-compatible affine transform `[a, b, c, d, e, f]`. */
export interface AffineTransform { readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly e: number; readonly f: number; }

export const identityAffine = (): AffineTransform => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
/** Applies `child` in the coordinate system produced by `parent`. */
export function multiplyAffine(parent: AffineTransform, child: AffineTransform): AffineTransform {
  return { a: parent.a * child.a + parent.c * child.b, b: parent.b * child.a + parent.d * child.b, c: parent.a * child.c + parent.c * child.d, d: parent.b * child.c + parent.d * child.d, e: parent.a * child.e + parent.c * child.f + parent.e, f: parent.b * child.e + parent.d * child.f + parent.f };
}
/** Layer transforms are applied to source pixels as scale, then rotation, then position. */
export function affineFromTransform(transform: Transform): AffineTransform {
  const radians = transform.rotation * Math.PI / 180; const cosine = Math.cos(radians); const sine = Math.sin(radians);
  return { a: cosine * transform.scale.x, b: sine * transform.scale.x, c: -sine * transform.scale.y, d: cosine * transform.scale.y, e: transform.position.x, f: transform.position.y };
}
