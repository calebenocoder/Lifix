import type { EditorColor } from "./model";

export function colorToHex(color: EditorColor): string { return `#${[color.r, color.g, color.b].map(value => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase(); }
export function parseHexColor(value: string): EditorColor | undefined { const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value.trim()); return match ? { r: Number.parseInt(match[1], 16), g: Number.parseInt(match[2], 16), b: Number.parseInt(match[3], 16) } : undefined; }
