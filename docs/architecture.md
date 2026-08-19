# Architecture

The editor domain is platform-independent and is represented in both TypeScript (`src/core`) and Rust (`crates/editor-core`). Rust is introduced at the foundation so future performance-sensitive and authoritative domain operations have a native home.

`src/platform` contains contracts for web and desktop adapters. Browser and Tauri implementations belong outside core and can be selected by composition at application startup.

`src/renderer` contains rendering contracts only. A WebGPU backend, tiling, caching, compositing, and native GPU backends can be added without changing editor-domain contracts.

React (`src/ui`) is presentation and interaction. Tauri (`src-tauri`) is solely the desktop shell and platform-integration boundary. Linux is the primary deployment target; no Windows-specific behavior belongs in core.

## Runtime foundation

`createEditorCore` owns the minimal core lifecycle and is consumed through its public API by the composition root in the React UI. `createRenderer` probes WebGPU behind the renderer boundary; it reports `unavailable` instead of failing when a browser or webview does not provide a GPU adapter. `createPlatformRuntime` is the only frontend runtime detector and returns a neutral `web` or `tauri` result to the UI.

## Native project data

The Core serializes document structure through a versioned native project representation. It persists document and layer metadata, hierarchy, transforms, and raster *references* only. Future tiled pixel payloads, lazy sources, and GPU caches remain outside this structural representation and will be resolved by dedicated storage adapters rather than the document model.
