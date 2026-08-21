import { createGroupLayer, createRasterLayer, type BlendMode, type Document, type GroupCompositingMode, type GroupLayerOptions, type LayerId, type LayerOptions, type LayerTreeState, type RasterDataReference, type Transform } from "./document";
import { clonePixelSelection, setPixelSelection, type PixelSelection } from "./selection";

/** Commands define the future undoable state transition boundary. */
export interface EditorCommand<State> { readonly label: string; /** Selection-only commands can update editor projections without rebuilding image render input. */ readonly affectsImageRendering?: boolean; execute(state: State): State; undo(state: State): State; }
export interface History<State> { readonly canUndo: boolean; readonly canRedo: boolean; execute(command: EditorCommand<State>): void; undo(): void; redo(): void; }
export interface Tool { readonly id: string; readonly label: string; }
export interface CropBounds { readonly left: number; readonly top: number; readonly width: number; readonly height: number; }

abstract class DocumentCommand implements EditorCommand<Document> {
  #previous?: { readonly width: number; readonly height: number; readonly layerTree: LayerTreeState; readonly pixelSelection: PixelSelection | null };
  abstract readonly label: string;
  readonly affectsImageRendering: boolean = true;
  execute(document: Document): Document { this.#previous = { width: document.width, height: document.height, layerTree: document.layerTree.snapshot(), pixelSelection: clonePixelSelection(document.pixelSelection) }; this.apply(document); return document; }
  undo(document: Document): Document { if (!this.#previous) throw new Error("Command has not been executed"); document.width = this.#previous.width; document.height = this.#previous.height; document.layerTree.restore(this.#previous.layerTree); document.pixelSelection = clonePixelSelection(this.#previous.pixelSelection); return document; }
  protected abstract apply(document: Document): void;
  protected layer(document: Document, id: LayerId) { const layer = document.layerTree.find(id); if (!layer) throw new Error(`Unknown layer: ${id}`); return layer; }
}

export class CreateRasterLayerCommand extends DocumentCommand {
  readonly label = "Create raster layer";
  constructor(private readonly id: LayerId, private readonly name?: string, private readonly options: LayerOptions = {}, private readonly parentId: LayerId | null = null, private readonly index?: number, private readonly raster?: RasterDataReference) { super(); }
  protected apply(document: Document): void { document.layerTree.add(createRasterLayer(this.id, this.name, this.options, this.raster), this.parentId, this.index); }
}
export class CreateGroupCommand extends DocumentCommand {
  readonly label = "Create group";
  constructor(private readonly id: LayerId, private readonly name?: string, private readonly options: GroupLayerOptions = {}, private readonly parentId: LayerId | null = null, private readonly index?: number) { super(); }
  protected apply(document: Document): void { document.layerTree.add(createGroupLayer(this.id, this.name, this.options), this.parentId, this.index); }
}
export class DeleteLayerCommand extends DocumentCommand { readonly label = "Delete layer"; constructor(private readonly id: LayerId) { super(); } protected apply(document: Document): void { this.layer(document, this.id); document.layerTree.remove(this.id); } }
export class RenameLayerCommand extends DocumentCommand { readonly label = "Rename layer"; constructor(private readonly id: LayerId, private readonly name: string) { super(); } protected apply(document: Document): void { if (!this.name.trim()) throw new Error("Layer name cannot be empty"); this.layer(document, this.id).name = this.name; } }
export class SetVisibilityCommand extends DocumentCommand { readonly label = "Set layer visibility"; constructor(private readonly id: LayerId, private readonly visible: boolean) { super(); } protected apply(document: Document): void { this.layer(document, this.id).visible = this.visible; } }
export class SetOpacityCommand extends DocumentCommand { readonly label = "Set layer opacity"; constructor(private readonly id: LayerId, private readonly opacity: number) { super(); } protected apply(document: Document): void { if (!Number.isFinite(this.opacity) || this.opacity < 0 || this.opacity > 1) throw new RangeError("Layer opacity must be between 0 and 1"); this.layer(document, this.id).opacity = this.opacity; } }
export class SetBlendModeCommand extends DocumentCommand { readonly label = "Set layer blend mode"; constructor(private readonly id: LayerId, private readonly blendMode: BlendMode) { super(); } protected apply(document: Document): void { if (!(["normal", "multiply", "screen", "overlay"] as string[]).includes(this.blendMode)) throw new Error("Unsupported blend mode"); this.layer(document, this.id).blendMode = this.blendMode; } }
export class SetGroupCompositingModeCommand extends DocumentCommand { readonly label = "Set group compositing mode"; constructor(private readonly id: LayerId, private readonly compositing: GroupCompositingMode) { super(); } protected apply(document: Document): void { if (this.compositing !== "pass-through" && this.compositing !== "isolated") throw new Error("Unsupported group compositing mode"); const layer = this.layer(document, this.id); if (layer.kind !== "group") throw new Error("Layer must be a group"); layer.compositing = this.compositing; } }
export class SetTransformCommand extends DocumentCommand {
  readonly label = "Set layer transform";
  constructor(private readonly id: LayerId, private readonly transform: Transform) { super(); }
  protected apply(document: Document): void {
    const values = [this.transform.position.x, this.transform.position.y, this.transform.scale.x, this.transform.scale.y, this.transform.rotation];
    if (!values.every(Number.isFinite)) throw new RangeError("Transform values must be finite");
    this.layer(document, this.id).transform = {
      position: { ...this.transform.position },
      scale: { ...this.transform.scale },
      rotation: this.transform.rotation,
    };
  }
}
export class SetPixelSelectionCommand extends DocumentCommand {
  readonly label = "Set pixel selection";
  override readonly affectsImageRendering = false;
  constructor(private readonly selection: PixelSelection) { super(); }
  protected apply(document: Document): void { setPixelSelection(document, this.selection); }
}
export class ClearPixelSelectionCommand extends DocumentCommand {
  readonly label = "Clear pixel selection";
  override readonly affectsImageRendering = false;
  protected apply(document: Document): void { setPixelSelection(document, null); }
}
export class CropDocumentCommand extends DocumentCommand {
  readonly label = "Crop document";
  constructor(private readonly bounds: CropBounds) { super(); }
  protected apply(document: Document): void {
    const { left, top, width, height } = this.bounds;
    if (!Number.isSafeInteger(document.width) || !Number.isSafeInteger(document.height) || document.width < 1 || document.height < 1) throw new RangeError("Document dimensions must be positive integer pixels");
    if (![left, top, width, height].every(Number.isSafeInteger)) throw new RangeError("Crop bounds must use integer pixel coordinates");
    if (left < 0 || top < 0 || width < 1 || height < 1) throw new RangeError("Crop bounds must define a positive canvas within the document");
    if (left + width > document.width || top + height > document.height) throw new RangeError("Crop bounds must remain within the document");
    const roots = document.layerTree.rootLayerIds.map(id => this.layer(document, id));
    const positions = roots.map(layer => ({ layer, x: layer.transform.position.x - left, y: layer.transform.position.y - top }));
    if (positions.some(position => !Number.isFinite(position.x) || !Number.isFinite(position.y))) throw new RangeError("Cropped root transforms must remain finite");
    const selection = document.pixelSelection ? { ...document.pixelSelection, left: document.pixelSelection.left - left, top: document.pixelSelection.top - top, right: document.pixelSelection.right - left, bottom: document.pixelSelection.bottom - top } : null;
    document.width = width; document.height = height;
    positions.forEach(({ layer, x, y }) => { layer.transform = { ...layer.transform, position: { x, y } }; });
    setPixelSelection(document, selection);
  }
}
export class MoveLayerCommand extends DocumentCommand { readonly label: string = "Move layer"; constructor(private readonly id: LayerId, private readonly parentId: LayerId | null, private readonly index?: number) { super(); } protected apply(document: Document): void { this.layer(document, this.id); document.layerTree.move(this.id, this.parentId, this.index); } }
export class ReorderLayerCommand extends DocumentCommand { readonly label = "Reorder layer"; constructor(private readonly id: LayerId, private readonly index: number) { super(); } protected apply(document: Document): void { if (!Number.isInteger(this.index) || this.index < 0) throw new RangeError("Layer index must be a non-negative integer"); this.layer(document, this.id); document.layerTree.reorder(this.id, this.index); } }
export class AddLayerToGroupCommand extends MoveLayerCommand { override readonly label = "Add layer to group"; constructor(id: LayerId, groupId: LayerId, index?: number) { super(id, groupId, index); } }
export class RemoveLayerFromGroupCommand extends DocumentCommand { readonly label = "Remove layer from group"; constructor(private readonly id: LayerId, private readonly index?: number) { super(); } protected apply(document: Document): void { const layer = this.layer(document, this.id); if (layer.parentId === null) throw new Error("Layer is not in a group"); document.layerTree.move(this.id, null, this.index); } }
