/** Adapters live here; core code must depend only on contracts, never browser/Tauri APIs. */
export interface FileSystem { read(path: string): Promise<Uint8Array>; write(path: string, data: Uint8Array): Promise<void>; }
export interface Clipboard { readText(): Promise<string>; writeText(value: string): Promise<void>; }
export interface FileDialogs { openFile(): Promise<string | undefined>; saveFile(suggestedName: string): Promise<string | undefined>; }
export interface WindowIntegration { setTitle(title: string): Promise<void>; requestAttention?(): Promise<void>; }
export interface InputSource { onShortcut(listener: (shortcut: string) => void): () => void; }
export interface PlatformServices { fileSystem: FileSystem; clipboard: Clipboard; dialogs: FileDialogs; window: WindowIntegration; input: InputSource; }

