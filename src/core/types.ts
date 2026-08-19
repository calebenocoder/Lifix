/** Platform-neutral editor domain identifiers and future-facing contracts. */
export type AssetId = string;
export interface Selection { readonly kind: "none" | "pixel" | "vector"; }
export interface Mask { readonly layerId: string; readonly enabled: boolean; }
export interface Asset { id: AssetId; name: string; }
