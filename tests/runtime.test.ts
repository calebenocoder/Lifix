import { describe, expect, it } from "vitest";
import { createEditorCore } from "../src/core";
import { createPlatformRuntime } from "../src/platform";
import { createRenderer } from "../src/renderer";

describe("runtime foundation", () => {
  it("initializes the core through its public API", async () => {
    const core = createEditorCore();
    expect(core.status).toBe("idle");

    await core.initialize();
    expect(core.status).toBe("ready");
  });

  it("reports unavailable WebGPU without throwing", async () => {
    const renderer = createRenderer(undefined);
    await expect(renderer.initialize()).resolves.toBeUndefined();
    expect(renderer.status).toBe("unavailable");
  });

  it("reports ready when WebGPU provides an adapter", async () => {
    const renderer = createRenderer({ requestAdapter: async () => ({ name: "test" }) });
    await renderer.initialize();
    expect(renderer.status).toBe("ready");
  });

  it("keeps runtime detection behind the platform abstraction", () => {
    expect(createPlatformRuntime({ isTauri: () => false }).kind).toBe("web");
    expect(createPlatformRuntime({ isTauri: () => true }).kind).toBe("tauri");
  });
});
