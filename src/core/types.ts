/** Platform-neutral editor domain identifiers and future-facing contracts. */
export type DocumentId = string;
export type LayerId = string;
export type AssetId = string;

export interface Document { id: DocumentId; name: string; rootLayerIds: readonly LayerId[]; }
export interface Layer { id: LayerId; name: string; visible: boolean; opacity: number; }
export interface Group extends Layer { childLayerIds: readonly LayerId[]; }
export interface Selection { readonly kind: "none" | "pixel" | "vector"; }
export interface Mask { readonly layerId: LayerId; readonly enabled: boolean; }
export interface Transform { readonly x: number; readonly y: number; readonly scaleX: number; readonly scaleY: number; readonly rotation: number; }
export interface Asset { id: AssetId; name: string; }

