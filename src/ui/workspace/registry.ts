import type { PanelDefinition, PanelId } from "./model";

export interface RegisteredPanel<Factory> { readonly definition: PanelDefinition; readonly factory: Factory; }
export class PanelRegistry<Factory> {
  #panels = new Map<PanelId, RegisteredPanel<Factory>>();
  register(definition: PanelDefinition, factory: Factory): void {
    if (!definition.id.trim()) throw new Error("Panel ID must be non-empty");
    if (this.#panels.has(definition.id)) throw new Error(`Panel ID is already registered: ${definition.id}`);
    const sizes = [definition.minimumSize.width, definition.minimumSize.height, definition.preferredSize.width, definition.preferredSize.height];
    if (!sizes.every(value => Number.isFinite(value) && value > 0)) throw new Error("Panel sizes must be positive and finite");
    const maximumSizes = [definition.maximumSize?.width, definition.maximumSize?.height].filter((value): value is number => value !== undefined);
    if (!maximumSizes.every(value => Number.isFinite(value) && value > 0)) throw new Error("Panel maximum sizes must be positive and finite");
    if (definition.preferredSize.width < definition.minimumSize.width || definition.preferredSize.height < definition.minimumSize.height) throw new Error("Panel preferred size must meet its minimum size");
    if (definition.maximumSize?.width !== undefined && definition.maximumSize.width < definition.minimumSize.width) throw new Error("Panel maximum width must meet its minimum width");
    if (definition.maximumSize?.height !== undefined && definition.maximumSize.height < definition.minimumSize.height) throw new Error("Panel maximum height must meet its minimum height");
    this.#panels.set(definition.id, { definition: { ...definition, minimumSize: { ...definition.minimumSize }, preferredSize: { ...definition.preferredSize }, maximumSize: definition.maximumSize ? { ...definition.maximumSize } : undefined }, factory });
  }
  get(id: PanelId): RegisteredPanel<Factory> | undefined { return this.#panels.get(id); }
  require(id: PanelId): RegisteredPanel<Factory> { const panel = this.get(id); if (!panel) throw new Error(`Panel is not registered: ${id}`); return panel; }
  list(): readonly RegisteredPanel<Factory>[] { return [...this.#panels.values()]; }
  has(id: PanelId): boolean { return this.#panels.has(id); }
}
