import type { ToolController, ToolDefinition } from "./contracts";
import type { ToolId } from "../editor";

function createDiagnosticPointerController(): ToolController {
  let active = false;
  let start: { x: number; y: number } | undefined;
  return {
    pointerDown(input, context) {
      active = true;
      start = input.document;
      context.beginPreview({ kind: "diagnostic-pointer", toolId: context.getSessionSnapshot().activeToolId, start, current: input.document });
      return true;
    },
    pointerMove(input, context) {
      if (!active || !start) return;
      context.updatePreview({ kind: "diagnostic-pointer", toolId: context.getSessionSnapshot().activeToolId, start, current: input.document });
    },
    pointerUp(_input, context) { if (!active) return; active = false; start = undefined; context.completePreview(); },
    pointerCancel(context) { active = false; start = undefined; context.cancelPreview(); },
    keyDown(input, context) { if (input.key === "Escape" && active) { active = false; start = undefined; context.cancelPreview(); return true; } },
    deactivate(context) { if (active) { active = false; start = undefined; context.cancelPreview(); } },
  };
}

function createPlaceholderController(): ToolController { return {}; }

const definitions: readonly ToolDefinition[] = [
  { id: "move", label: "Move", icon: "pointer", cursor: "move", shortcut: { key: "v" }, createController: createDiagnosticPointerController },
  { id: "marquee", label: "Marquee", icon: "marquee", cursor: "crosshair", shortcut: { key: "m" }, createController: createPlaceholderController },
  { id: "brush", label: "Brush", icon: "brush", cursor: "crosshair", shortcut: { key: "b" }, createController: createPlaceholderController },
  { id: "eraser", label: "Eraser", icon: "eraser", cursor: "crosshair", shortcut: { key: "e" }, createController: createPlaceholderController },
  { id: "crop", label: "Crop", icon: "crop", cursor: "crosshair", shortcut: { key: "c" }, createController: createPlaceholderController },
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
