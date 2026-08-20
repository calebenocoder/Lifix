import { assertCompleteTokens, toCssVariables, type CssVariableMap, type SemanticTokens } from "./tokens";

export type ThemeId = "soft-modular" | "flat-professional" | "reserved";
export interface UiTheme { readonly id: ThemeId; readonly label: string; readonly status: "ready" | "reserved"; readonly tokens: SemanticTokens; }

const softTokens = {
  "background.canvas": "#101218", "background.workspace": "#171a22", "surface.panel": "rgba(35, 39, 50, 0.94)", "surface.panelFloating": "rgba(41, 46, 59, 0.88)", "surface.toolbar": "rgba(31, 35, 45, 0.92)", "surface.overlay": "rgba(12, 14, 19, 0.72)", "surface.input": "rgba(12, 15, 21, 0.62)",
  "text.primary": "#f2f4f8", "text.secondary": "#aab2c0", "text.disabled": "#697180", "border.default": "rgba(184, 194, 214, 0.24)", "border.subtle": "rgba(184, 194, 214, 0.12)",
  "interaction.hover": "rgba(132, 156, 255, 0.13)", "interaction.selected": "rgba(112, 143, 255, 0.24)", "interaction.active": "rgba(112, 143, 255, 0.34)", "interaction.focus": "#86a0ff", "interaction.dockCandidate": "#77a0ff", "interaction.dockPreview": "rgba(86, 127, 255, 0.22)", "interaction.dockActive": "rgba(86, 127, 255, 0.46)", "interaction.dockInvalid": "rgba(255, 105, 120, 0.48)",
  "space.025": "2px", "space.050": "4px", "space.100": "8px", "space.150": "12px", "space.200": "16px", "space.300": "24px",
  "radius.none": "0", "radius.small": "4px", "radius.medium": "7px", "radius.large": "10px", "radius.panel": "12px",
  "elevation.none": "none", "elevation.panel": "0 1px 2px rgba(0, 0, 0, 0.24)", "elevation.floating": "0 14px 36px rgba(0, 0, 0, 0.38)", "elevation.modal": "0 24px 60px rgba(0, 0, 0, 0.5)",
  "blur.none": "0", "blur.panel": "6px", "blur.floating": "10px", "opacity.panel": "0.94", "opacity.overlay": "0.72",
  "font.ui": "Inter, ui-sans-serif, system-ui, sans-serif", "font.mono": "\"SFMono-Regular\", Consolas, ui-monospace, monospace", "font.size.small": "0.75rem", "font.size.medium": "0.875rem", "font.size.large": "1rem", "font.weight.normal": "400", "font.weight.medium": "560", "font.weight.strong": "680",
  "duration.fast": "70ms", "duration.normal": "140ms", "easing.standard": "cubic-bezier(0.2, 0, 0, 1)", "workspace.gap": "6px", "panel.headerHeight": "32px", "panel.padding": "10px", "control.height": "30px", "icon.size": "16px", "application.barHeight": "38px", "toolOptions.height": "34px", "toolStrip.width": "48px", "documentTab.height": "30px", "status.height": "24px",
} satisfies SemanticTokens;

const flatTokens = {
  ...softTokens,
  "background.canvas": "#0e0f11", "background.workspace": "#15171a", "surface.panel": "#25282c", "surface.panelFloating": "#292c31", "surface.toolbar": "#202328", "surface.overlay": "rgba(5, 6, 8, 0.82)", "surface.input": "#17191c",
  "text.primary": "#f1f2f4", "text.secondary": "#b3b7be", "text.disabled": "#6e737b", "border.default": "#454a52", "border.subtle": "#34383f",
  "interaction.hover": "#303846", "interaction.selected": "#35466a", "interaction.active": "#405680", "interaction.focus": "#8eafff", "interaction.dockCandidate": "#6f9dff", "interaction.dockPreview": "rgba(77, 121, 219, 0.34)", "interaction.dockActive": "rgba(77, 121, 219, 0.58)", "interaction.dockInvalid": "rgba(214, 72, 87, 0.62)",
  "radius.medium": "2px", "radius.large": "2px", "radius.panel": "0", "elevation.panel": "none", "elevation.floating": "0 8px 22px rgba(0, 0, 0, 0.52)", "blur.panel": "0", "blur.floating": "0", "opacity.panel": "1", "workspace.gap": "0px", "panel.headerHeight": "30px", "panel.padding": "8px", "control.height": "28px", "icon.size": "15px", "application.barHeight": "34px", "toolOptions.height": "30px", "toolStrip.width": "44px", "documentTab.height": "28px", "status.height": "22px",
} satisfies SemanticTokens;

assertCompleteTokens(softTokens); assertCompleteTokens(flatTokens);
export const themes: Readonly<Record<ThemeId, UiTheme>> = {
  "soft-modular": { id: "soft-modular", label: "Soft / Modular", status: "ready", tokens: softTokens },
  "flat-professional": { id: "flat-professional", label: "Flat / Professional", status: "ready", tokens: flatTokens },
  reserved: { id: "reserved", label: "Reserved", status: "reserved", tokens: { ...flatTokens } },
};
export function resolveTheme(id: ThemeId): UiTheme { return themes[id]; }
export function themeCssVariables(id: ThemeId): CssVariableMap { return toCssVariables(resolveTheme(id).tokens); }
