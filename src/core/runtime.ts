/**
 * Public lifecycle for the platform-neutral editor core.
 * Infrastructure composes this runtime; React must not own core state.
 */
export type CoreStatus = "idle" | "ready";

export interface EditorCoreRuntime {
  readonly status: CoreStatus;
  initialize(): Promise<void>;
  createDocument(id: string, name: string, width: number, height: number, options?: DocumentOptions): Document;
}

class EditorCoreRuntimeImpl implements EditorCoreRuntime {
  #status: CoreStatus = "idle";

  get status(): CoreStatus {
    return this.#status;
  }

  async initialize(): Promise<void> {
    this.#status = "ready";
  }

  createDocument(id: string, name: string, width: number, height: number, options?: DocumentOptions): Document {
    if (this.#status !== "ready") throw new Error("Editor Core must be initialized before creating a document");
    return createDocument(id, name, width, height, options);
  }
}

export function createEditorCore(): EditorCoreRuntime {
  return new EditorCoreRuntimeImpl();
}
import { createDocument, type Document, type DocumentOptions } from "./document";
