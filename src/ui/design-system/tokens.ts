export const semanticTokenNames = [
  "background.canvas", "background.workspace", "surface.panel", "surface.panelFloating", "surface.toolbar", "surface.overlay", "surface.input",
  "text.primary", "text.secondary", "text.disabled", "border.default", "border.subtle",
  "interaction.hover", "interaction.selected", "interaction.active", "interaction.focus", "interaction.dockCandidate", "interaction.dockPreview", "interaction.dockActive", "interaction.dockInvalid",
  "space.025", "space.050", "space.100", "space.150", "space.200", "space.300",
  "radius.none", "radius.small", "radius.medium", "radius.large", "radius.panel",
  "elevation.none", "elevation.panel", "elevation.floating", "elevation.modal",
  "blur.none", "blur.panel", "blur.floating", "opacity.panel", "opacity.overlay",
  "font.ui", "font.mono", "font.size.small", "font.size.medium", "font.size.large", "font.weight.normal", "font.weight.medium", "font.weight.strong",
  "duration.fast", "duration.normal", "easing.standard", "workspace.gap", "panel.headerHeight", "control.height",
] as const;

export type SemanticTokenName = typeof semanticTokenNames[number];
export type SemanticTokens = Readonly<Record<SemanticTokenName, string>>;
export type CssVariableMap = Readonly<Record<`--ui-${string}`, string>>;

export function tokenVariable(name: SemanticTokenName): `--ui-${string}` { return `--ui-${name.replaceAll(".", "-")}`; }
export function toCssVariables(tokens: SemanticTokens): CssVariableMap { return Object.fromEntries(semanticTokenNames.map(name => [tokenVariable(name), tokens[name]])) as CssVariableMap; }
export function assertCompleteTokens(tokens: Readonly<Record<string, string>>): asserts tokens is SemanticTokens { const missing = semanticTokenNames.filter(name => !tokens[name]); const unknown = Object.keys(tokens).filter(name => !semanticTokenNames.includes(name as SemanticTokenName)); if (missing.length || unknown.length) throw new Error(`Invalid semantic tokens; missing: ${missing.join(", ") || "none"}; unknown: ${unknown.join(", ") || "none"}`); }
