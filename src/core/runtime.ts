/**
 * Public lifecycle for the platform-neutral editor core.
 * Infrastructure composes this runtime; React must not own core state.
 */
export type CoreStatus = "idle" | "ready";

export interface EditorCoreRuntime {
  readonly status: CoreStatus;
  initialize(): Promise<void>;
}

class EditorCoreRuntimeImpl implements EditorCoreRuntime {
  #status: CoreStatus = "idle";

  get status(): CoreStatus {
    return this.#status;
  }

  async initialize(): Promise<void> {
    this.#status = "ready";
  }
}

export function createEditorCore(): EditorCoreRuntime {
  return new EditorCoreRuntimeImpl();
}
