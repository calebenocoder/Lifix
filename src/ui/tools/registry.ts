import type { ToolController, ToolDefinition } from "./contracts";
import type { ToolId } from "../editor";
import { createRectangularMarqueeController } from "./marquee";
import { createMoveToolController } from "./move";
import { createTransformToolController } from "./transform";
import { createCropToolController } from "./crop";

function createPlaceholderController(): ToolController { return {}; }

const definitions: readonly ToolDefinition[] = [
  { id: "move", label: "Move", icon: "pointer", cursor: "move", shortcut: { key: "v" }, createController: createMoveToolController },
  { id: "transform", label: "Transform", icon: "transform", cursor: "default", shortcut: { key: "f" }, createController: createTransformToolController },
  { id: "marquee", label: "Marquee", icon: "marquee", cursor: "crosshair", shortcut: { key: "m" }, createController: createRectangularMarqueeController },
  { id: "brush", label: "Brush", icon: "brush", cursor: "crosshair", shortcut: { key: "b" }, createController: createPlaceholderController },
  { id: "eraser", label: "Eraser", icon: "eraser", cursor: "crosshair", shortcut: { key: "e" }, createController: createPlaceholderController },
  { id: "crop", label: "Crop", icon: "crop", cursor: "crosshair", shortcut: { key: "c" }, createController: createCropToolController },
  { id: "text", label: "Text", icon: "text", cursor: "text", shortcut: { key: "t" }, createController: createPlaceholderController },
  { id: "shape", label: "Shape", icon: "shape", cursor: "crosshair", shortcut: { key: "u" }, createController: createPlaceholderController },
  { id: "hand", label: "Hand", icon: "hand", cursor: "grab", shortcut: { key: "h" }, createController: createPlaceholderController },
  { id: "zoom", label: "Zoom", icon: "zoom", cursor: "zoom-in", shortcut: { key: "z" }, createController: createPlaceholderController },
];

/** Immutable source of truth for tool metadata and controller factories. */
export class ToolRegistry {
  readonly #byId: ReadonlyMap<ToolId, ToolDefinition>;
  constructor(readonly tools: readonly ToolDefinition[]) {
    const map = new Map<ToolId, ToolDefinition>();
    for (const tool of tools) {
      if (map.has(tool.id)) throw new Error(`Duplicate tool ID: ${tool.id}`);
      map.set(tool.id, tool);
    }
    this.#byId = map;
  }
  get(id: ToolId): ToolDefinition { const tool = this.#byId.get(id); if (!tool) throw new Error(`Unknown tool: ${id}`); return tool; }
  findShortcut(key: string, modifiers: { readonly shift: boolean; readonly alt: boolean; readonly control: boolean; readonly meta: boolean }): ToolDefinition | undefined {
    if (modifiers.alt || modifiers.control || modifiers.meta) return undefined;
    const normalized = key.toLowerCase();
    return this.tools.find(tool => tool.shortcut?.key === normalized && Boolean(tool.shortcut.shift) === modifiers.shift);
  }
}

export const toolRegistry = new ToolRegistry(definitions);
