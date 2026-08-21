import type { BlendMode, GroupCompositingMode, Layer, LayerId, PixelSelection, RasterDataReference, Transform } from "../../core";
import type { ToolId } from "./tool-state";

export interface EditorColor { readonly r: number; readonly g: number; readonly b: number; }
/** Session-only brush controls. Values are normalized except diameter, which is raster pixels. */
export interface BrushSettings { readonly diameter: number; readonly hardness: number; readonly opacity: number; readonly flow: number; readonly spacing: number; }
export const defaultBrushSettings = (): BrushSettings => ({ diameter: 32, hardness: 0.8, opacity: 1, flow: 0.7, spacing: 0.25 });

export interface EditorLayerView {
  readonly id: LayerId;
  readonly kind: Layer["kind"];
  readonly name: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly blendMode: BlendMode;
  readonly transform: Transform;
  readonly parentId: LayerId | null;
  readonly compositing?: GroupCompositingMode;
  readonly raster?: RasterDataReference;
  readonly expanded: boolean;
  readonly children: readonly EditorLayerView[];
}

export interface EditorDocumentView {
  readonly id: string;
  readonly name: string;
  readonly width: number;
  readonly height: number;
  /** Conventional editor order: topmost first. Core storage remains bottom-to-top. */
  readonly layers: readonly EditorLayerView[];
}

export interface EditorSessionSnapshot {
  readonly documentRevision: number;
  readonly sessionRevision: number;
  readonly document: EditorDocumentView;
  readonly selectedLayerId: LayerId | null;
  readonly selectedLayer?: EditorLayerView;
  /** Core-owned document-space operation region, distinct from selectedLayerId session targeting. */
  readonly pixelSelection: PixelSelection | null;
  readonly expandedGroupIds: readonly LayerId[];
  readonly foregroundColor: EditorColor;
  readonly backgroundColor: EditorColor;
  readonly brushSettings: BrushSettings;
  /** Low-frequency tool state for UI presentation; pointer preview data stays outside React. */
  readonly activeToolId: ToolId;
  readonly interactionActive: boolean;
}

export type EditorSessionAction =
  | { readonly type: "select-layer"; readonly layerId: LayerId | null }
  | { readonly type: "toggle-group"; readonly layerId: LayerId }
  | { readonly type: "set-visibility"; readonly layerId: LayerId; readonly visible: boolean }
  | { readonly type: "set-opacity"; readonly layerId: LayerId; readonly opacity: number }
  | { readonly type: "set-blend-mode"; readonly layerId: LayerId; readonly blendMode: BlendMode }
  | { readonly type: "rename-layer"; readonly layerId: LayerId; readonly name: string }
  | { readonly type: "set-transform"; readonly layerId: LayerId; readonly transform: Transform }
  | { readonly type: "set-group-compositing"; readonly layerId: LayerId; readonly compositing: GroupCompositingMode }
  | { readonly type: "set-foreground-color"; readonly color: EditorColor }
  | { readonly type: "set-background-color"; readonly color: EditorColor }
  | { readonly type: "set-brush-settings"; readonly settings: Partial<BrushSettings> }
  | { readonly type: "set-active-tool"; readonly toolId: ToolId };

export interface EditorActionResult {
  readonly ok: boolean;
  readonly error?: string;
  /** The Core change succeeded, but a downstream application integration failed. */
  readonly warning?: string;
}
