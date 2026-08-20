import { RenameLayerCommand, SetBlendModeCommand, SetGroupCompositingModeCommand, SetOpacityCommand, SetTransformCommand, SetVisibilityCommand, type Document, type EditorCommand, type Layer, type LayerId } from "../../core";
import type { EditorActionResult, EditorColor, EditorLayerView, EditorSessionAction, EditorSessionSnapshot } from "./model";

export type EditorSessionListener = (snapshot: EditorSessionSnapshot) => void;
export type DocumentChangeListener = (document: Document) => void;

function cloneColor(color: EditorColor): EditorColor { return { ...color }; }
function validColor(color: EditorColor): boolean { return [color.r, color.g, color.b].every(value => Number.isInteger(value) && value >= 0 && value <= 255); }
function cloneTransform(layer: Layer) { return { position: { ...layer.transform.position }, scale: { ...layer.transform.scale }, rotation: layer.transform.rotation }; }

function projectLayer(layer: Layer, document: Document, expanded: ReadonlySet<LayerId>): EditorLayerView {
  const children = layer.kind === "group"
    ? [...layer.childLayerIds].reverse().map(id => document.layerTree.find(id)).filter((child): child is Layer => child !== undefined).map(child => projectLayer(child, document, expanded))
    : [];
  return {
    id: layer.id,
    kind: layer.kind,
    name: layer.name,
    visible: layer.visible,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    transform: cloneTransform(layer),
    parentId: layer.parentId,
    compositing: layer.kind === "group" ? layer.compositing : undefined,
    expanded: layer.kind === "group" && expanded.has(layer.id),
    children,
  };
}

export function projectEditorSnapshot(document: Document, selectedLayerId: LayerId | null, expandedGroupIds: ReadonlySet<LayerId>, foregroundColor: EditorColor, backgroundColor: EditorColor, documentRevision: number, sessionRevision: number): EditorSessionSnapshot {
  const layers = [...document.layerTree.rootLayerIds].reverse().map(id => document.layerTree.find(id)).filter((layer): layer is Layer => layer !== undefined).map(layer => projectLayer(layer, document, expandedGroupIds));
  const find = (nodes: readonly EditorLayerView[]): EditorLayerView | undefined => { for (const node of nodes) { if (node.id === selectedLayerId) return node; const nested = find(node.children); if (nested) return nested; } return undefined; };
  return {
    documentRevision,
    sessionRevision,
    document: { id: document.id, name: document.name, width: document.width, height: document.height, layers },
    selectedLayerId,
    selectedLayer: find(layers),
    expandedGroupIds: [...expandedGroupIds],
    foregroundColor: cloneColor(foregroundColor),
    backgroundColor: cloneColor(backgroundColor),
  };
}

export class EditorSessionController {
  readonly #listeners = new Set<EditorSessionListener>();
  readonly #expandedGroupIds = new Set<LayerId>();
  #selectedLayerId: LayerId | null = null;
  #foregroundColor: EditorColor = { r: 32, g: 102, b: 242 };
  #backgroundColor: EditorColor = { r: 255, g: 255, b: 255 };
  #documentRevision = 0;
  #sessionRevision = 0;

  constructor(private readonly document: Document, private readonly onDocumentChange: DocumentChangeListener) {
    document.layerTree.traverse().forEach(layer => { if (layer.kind === "group") this.#expandedGroupIds.add(layer.id); });
  }

  get snapshot(): EditorSessionSnapshot { return projectEditorSnapshot(this.document, this.#selectedLayerId, this.#expandedGroupIds, this.#foregroundColor, this.#backgroundColor, this.#documentRevision, this.#sessionRevision); }

  subscribe(listener: EditorSessionListener): () => void { this.#listeners.add(listener); listener(this.snapshot); return () => this.#listeners.delete(listener); }

  dispatch(action: EditorSessionAction): EditorActionResult {
    try {
      switch (action.type) {
        case "select-layer": this.#select(action.layerId); return this.#sessionChanged();
        case "toggle-group": this.#toggleGroup(action.layerId); return this.#sessionChanged();
        case "set-foreground-color": this.#setColor("foreground", action.color); return this.#sessionChanged();
        case "set-background-color": this.#setColor("background", action.color); return this.#sessionChanged();
        case "set-visibility": return this.#execute(new SetVisibilityCommand(action.layerId, action.visible));
        case "set-opacity": return this.#execute(new SetOpacityCommand(action.layerId, action.opacity));
        case "set-blend-mode": return this.#execute(new SetBlendModeCommand(action.layerId, action.blendMode));
        case "rename-layer": return this.#execute(new RenameLayerCommand(action.layerId, action.name));
        case "set-transform": return this.#execute(new SetTransformCommand(action.layerId, action.transform));
        case "set-group-compositing": return this.#execute(new SetGroupCompositingModeCommand(action.layerId, action.compositing));
      }
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : "Editor operation failed" };
    }
  }

  #select(layerId: LayerId | null): void { if (layerId !== null && !this.document.layerTree.find(layerId)) throw new Error(`Unknown layer: ${layerId}`); this.#selectedLayerId = layerId; }
  #toggleGroup(layerId: LayerId): void { const layer = this.document.layerTree.find(layerId); if (layer?.kind !== "group") throw new Error("Layer must be a group"); if (this.#expandedGroupIds.has(layerId)) this.#expandedGroupIds.delete(layerId); else this.#expandedGroupIds.add(layerId); }
  #setColor(target: "foreground" | "background", color: EditorColor): void { if (!validColor(color)) throw new RangeError("RGB channels must be integers between 0 and 255"); if (target === "foreground") this.#foregroundColor = cloneColor(color); else this.#backgroundColor = cloneColor(color); }
  #execute(command: EditorCommand<Document>): EditorActionResult { command.execute(this.document); this.#documentRevision += 1; this.onDocumentChange(this.document); this.#emit(); return { ok: true }; }
  #sessionChanged(): EditorActionResult { this.#sessionRevision += 1; this.#emit(); return { ok: true }; }
  #emit(): void { const snapshot = this.snapshot; this.#listeners.forEach(listener => listener(snapshot)); }
}

export function createEditorSession(document: Document, onDocumentChange: DocumentChangeListener): EditorSessionController { return new EditorSessionController(document, onDocumentChange); }
