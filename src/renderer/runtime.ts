import type { Document } from "../core";
import type { Renderer, RenderOptions } from "./contracts";

export type RendererStatus = "initializing" | "ready" | "unavailable";

export interface WebGpuAdapter {
  readonly name?: string;
}

export interface WebGpuProbe {
  requestAdapter(): Promise<WebGpuAdapter | null>;
}

export interface RendererRuntime extends Renderer {
  readonly status: RendererStatus;
}

function getWebGpuProbe(): WebGpuProbe | undefined {
  const navigatorWithGpu = globalThis.navigator as Navigator & { gpu?: WebGpuProbe };
  return navigatorWithGpu?.gpu;
}

class BootstrapRenderer implements RendererRuntime {
  #status: RendererStatus = "initializing";

  constructor(private readonly webGpu: WebGpuProbe | undefined) {}

  get status(): RendererStatus {
    return this.#status;
  }

  async initialize(): Promise<void> {
    if (!this.webGpu) {
      this.#status = "unavailable";
      return;
    }

    try {
      this.#status = (await this.webGpu.requestAdapter()) ? "ready" : "unavailable";
    } catch {
      this.#status = "unavailable";
    }
  }

  async render(_document: Document, _options: RenderOptions): Promise<void> {
    // Rendering is intentionally deferred to a future WebGPU/native backend.
  }

  dispose(): void {}
}

/** Creates the WebGPU-ready renderer boundary without allocating image resources. */
export function createRenderer(webGpu: WebGpuProbe | undefined = getWebGpuProbe()): RendererRuntime {
  return new BootstrapRenderer(webGpu);
}
