import { describe, expect, it } from "vitest";
import { resolveTheme, semanticTokenNames, themeCssVariables, themes, tokenVariable } from "../src/ui/design-system";

describe("UI themes", () => {
  it("resolves every theme through the same complete semantic contract", () => {
    for (const theme of Object.values(themes)) {
      expect(Object.keys(theme.tokens).sort()).toEqual([...semanticTokenNames].sort());
      expect(resolveTheme(theme.id)).toBe(theme);
    }
  });

  it("maps semantic names to stable CSS custom properties", () => {
    const variables = themeCssVariables("soft-modular");
    expect(tokenVariable("background.workspace")).toBe("--ui-background-workspace");
    expect(variables["--ui-background-workspace"]).toBe(resolveTheme("soft-modular").tokens["background.workspace"]);
    expect(Object.keys(variables)).toHaveLength(semanticTokenNames.length);
  });

  it("expresses strong visual differences without changing component contracts", () => {
    const soft = resolveTheme("soft-modular").tokens;
    const flat = resolveTheme("flat-professional").tokens;
    expect(soft["workspace.gap"]).not.toBe("0px");
    expect(soft["radius.panel"]).not.toBe("0");
    expect(soft["blur.floating"]).not.toBe("0");
    expect(flat["workspace.gap"]).toBe("0px");
    expect(flat["radius.panel"]).toBe("0");
    expect(flat["blur.floating"]).toBe("0");
    expect(resolveTheme("reserved").status).toBe("reserved");
  });
});
