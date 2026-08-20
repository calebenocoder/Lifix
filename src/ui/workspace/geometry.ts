/** Logical CSS-pixel geometry delivered to the renderer surface. */
export interface WorkspaceViewportSize { readonly width: number; readonly height: number; }

export function normalizeWorkspaceViewportSize(width: number, height: number): WorkspaceViewportSize | undefined {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return undefined;
  return { width: Math.max(1, Math.floor(width)), height: Math.max(1, Math.floor(height)) };
}
