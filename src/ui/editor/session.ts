import { RenameLayerCommand, SetBlendModeCommand, SetGroupCompositingModeCommand, SetOpacityCommand, SetTransformCommand, SetVisibilityCommand, type Document, type EditorCommand, type Layer, type LayerId } from "../../core";
import type { EditorActionResult, EditorColor, EditorDocumentView, EditorLayerView, EditorSessionAction, EditorSessionSnapshot } from "./model";
import { toolIds, type EditorInteractionPreview, type ToolId } from "./tool-state";

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

function projectDocument(document: Document, expandedGroupIds: ReadonlySet<LayerId>): EditorDocumentView {
  const layers = [...document.layerTree.rootLayerIds].reverse().map(id => document.layerTree.find(id)).filter((layer): layer is Layer => layer !== undefined).map(layer => projectLayer(layer, document, expandedGroupIds));
  return { id: document.id, name: document.name, width: document.width, height: document.height, layers };
}

function findLayer(nodes: readonly EditorLayerView[], selectedLayerId: LayerId | null): EditorLayerView | undefined {
  for (const node of nodes) {
    if (node.id === selectedLayerId) return node;
    const nested = findLayer(node.children, selectedLayerId);
    if (nested) return nested;
  }
  return undefined;
}

function createSnapshot(document: EditorDocumentView, selectedLayerId: LayerId | null, expandedGroupIds: ReadonlySet<LayerId>, foregroundColor: EditorColor, backgroundColor: EditorColor, documentRevision: number, sessionRevision: number, activeToolId: ToolId, interactionActive: boolean): EditorSessionSnapshot {
  return {
    documentRevision,
    sessionRevision,
    document,
    selectedLayerId,
    selectedLayer: findLayer(document.layers, selectedLayerId),
    expandedGroupIds: [...expandedGroupIds],
    foregroundColor: cloneColor(foregroundColor),
    backgroundColor: cloneColor(backgroundColor),
    activeToolId,
    interactionActive,
  };
}

export function projectEditorSnapshot(document: Document, selectedLayerId: LayerId | null, expandedGroupIds: ReadonlySet<LayerId>, foregroundColor: EditorColor, backgroundColor: EditorColor, documentRevision: number, sessionRevision: number, activeToolId: ToolId = "move", interactionActive = false): EditorSessionSnapshot {
  return createSnapshot(projectDocument(document, expandedGroupIds), selectedLayerId, expandedGroupIds, foregroundColor, backgroundColor, documentRevision, sessionRevision, activeToolId, interactionActive);
}

export class EditorSessionController {
  readonly #listeners = new Set<EditorSessionListener>();
  readonly #documentReplacementListeners = new Set<() => void>();
  readonly #expandedGroupIds = new Set<LayerId>();
  #selectedLayerId: LayerId | null = null;
  #foregroundColor: EditorColor = { r: 32, g: 102, b: 242 };
  #backgroundColor: EditorColor = { r: 255, g: 255, b: 255 };
  #documentRevision = 0;
  #sessionRevision = 0;
  #activeToolId: ToolId = "move";
  #interactionActive = false;
  #preview?: EditorInteractionPreview;
  #document: Document;
  #documentView: EditorDocumentView;
  #snapshot: EditorSessionSnapshot;

  constructor(document: Document, private readonly onDocumentChange: DocumentChangeListener) {
    this.#document = document;
    this.#expandAllGroups();
    this.#documentView = projectDocument(this.#document, this.#expandedGroupIds);
    this.#snapshot = this.#createSnapshot();
  }

  get snapshot(): EditorSessionSnapshot { return this.#snapshot; }
  /** High-frequency preview state is intentionally not part of React subscriptions. */
  get interactionPreview(): EditorInteractionPreview | undefined { return this.#preview; }

  subscribe(listener: EditorSessionListener): () => void { this.#listeners.add(listener); listener(this.snapshot); return () => this.#listeners.delete(listener); }
  onDocumentWillReplace(listener: () => void): () => void { this.#documentReplacementListeners.add(listener); return () => this.#documentReplacementListeners.delete(listener); }

  dispatch(action: EditorSessionAction): EditorActionResult {
    try {
      switch (action.type) {
        case "select-layer": this.#select(action.layerId); return this.#sessionChanged();
        case "toggle-group": this.#toggleGroup(action.layerId); return this.#sessionChanged();
        case "set-foreground-color": this.#setColor("foreground", action.color); return this.#sessionChanged();
        case "set-background-color": this.#setColor("background", action.color); return this.#sessionChanged();
        case "set-active-tool": this.#setActiveTool(action.toolId); return this.#sessionChanged();
        case "set-visibility": return this.executeDocumentCommand(new SetVisibilityCommand(action.layerId, action.visible));
        case "set-opacity": return this.executeDocumentCommand(new SetOpacityCommand(action.layerId, action.opacity));
        case "set-blend-mode": return this.executeDocumentCommand(new SetBlendModeCommand(action.layerId, action.blendMode));
        case "rename-layer": return this.executeDocumentCommand(new RenameLayerCommand(action.layerId, action.name));
        case "set-transform": return this.executeDocumentCommand(new SetTransformCommand(action.layerId, action.transform));
        case "set-group-compositing": return this.executeDocumentCommand(new SetGroupCompositingModeCommand(action.layerId, action.compositing));
      }
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : "Editor operation failed" };
    }
  }

  /** Single application-layer hook for future History execution/grouping. */
  executeDocumentCommand(command: EditorCommand<Document>): EditorActionResult {
    try {
      command.execute(this.#document);
      this.#documentRevision += 1;
      this.#reconcileSessionState();
      this.#publish(true);
      return this.#notifyDocumentChange();
    } catch (cause) {
      return { ok: false, error: cause instanceof Error ? cause.message : "Editor operation failed" };
    }
  }

  /** Replaces document state without replacing workspace, renderer, or session ownership. */
  replaceDocument(document: Document): EditorActionResult {
    this.#documentReplacementListeners.forEach(listener => listener());
    this.#document = document;
    this.#selectedLayerId = null;
    this.#expandedGroupIds.clear();
    this.#expandAllGroups();
    this.#documentRevision += 1;
    this.#sessionRevision += 1;
    this.#publish(true);
    return this.#notifyDocumentChange();
  }

  beginInteractionPreview(preview: EditorInteractionPreview): void {
    this.#preview = preview;
    if (!this.#interactionActive) { this.#interactionActive = true; this.#sessionChanged(); }
  }
  updateInteractionPreview(preview: EditorInteractionPreview): void { this.#preview = preview; }
  completeInteractionPreview(): void { this.#clearInteractionPreview(); }
  cancelInteractionPreview(): void { this.#clearInteractionPreview(); }

  #select(layerId: LayerId | null): void { if (layerId !== null && !this.#document.layerTree.find(layerId)) throw new Error(`Unknown layer: ${layerId}`); this.#selectedLayerId = layerId; }
  #toggleGroup(layerId: LayerId): void { const layer = this.#document.layerTree.find(layerId); if (layer?.kind !== "group") throw new Error("Layer must be a group"); if (this.#expandedGroupIds.has(layerId)) this.#expandedGroupIds.delete(layerId); else this.#expandedGroupIds.add(layerId); }
  #setColor(target: "foreground" | "background", color: EditorColor): void { if (!validColor(color)) throw new RangeError("RGB channels must be integers between 0 and 255"); if (target === "foreground") this.#foregroundColor = cloneColor(color); else this.#backgroundColor = cloneColor(color); }
  #setActiveTool(toolId: ToolId): void { if (!toolIds.includes(toolId)) throw new Error(`Unknown tool: ${toolId}`); this.#activeToolId = toolId; }
  #clearInteractionPreview(): void { this.#preview = undefined; if (this.#interactionActive) { this.#interactionActive = false; this.#sessionChanged(); } }
  #sessionChanged(): EditorActionResult { this.#sessionRevision += 1; this.#publish(false); return { ok: true }; }
  #expandAllGroups(): void { this.#document.layerTree.traverse().forEach(layer => { if (layer.kind === "group") this.#expandedGroupIds.add(layer.id); }); }
  #reconcileSessionState(): void {
    if (this.#selectedLayerId !== null && !this.#document.layerTree.find(this.#selectedLayerId)) this.#selectedLayerId = null;
    for (const id of this.#expandedGroupIds) if (this.#document.layerTree.find(id)?.kind !== "group") this.#expandedGroupIds.delete(id);
  }
  #createSnapshot(): EditorSessionSnapshot { return createSnapshot(this.#documentView, this.#selectedLayerId, this.#expandedGroupIds, this.#foregroundColor, this.#backgroundColor, this.#documentRevision, this.#sessionRevision, this.#activeToolId, this.#interactionActive); }
  #publish(documentChanged: boolean): void {
    if (documentChanged) this.#documentView = projectDocument(this.#document, this.#expandedGroupIds);
    else if (this.#snapshot.expandedGroupIds.length !== this.#expandedGroupIds.size || this.#snapshot.expandedGroupIds.some(id => !this.#expandedGroupIds.has(id))) this.#documentView = projectDocument(this.#document, this.#expandedGroupIds);
    this.#snapshot = this.#createSnapshot();
    this.#listeners.forEach(listener => listener(this.#snapshot));
  }
  #notifyDocumentChange(): EditorActionResult {
    try { this.onDocumentChange(this.#document); return { ok: true }; }
    catch (cause) { return { ok: true, warning: cause instanceof Error ? cause.message : "Document changed, but downstream synchronization failed" }; }
  }
}

export function createEditorSession(document: Document, onDocumentChange: DocumentChangeListener): EditorSessionController { return new EditorSessionController(document, onDocumentChange); }
