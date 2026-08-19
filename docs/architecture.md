# Architecture

## Core ownership

`src/core` is the sole authoritative Editor Core during the web-first phase. It owns document state, layer hierarchy and invariants, commands, validation, and the versioned project format. The running React application dispatches its public Core API; React components do not own or implement domain rules.

`crates/editor-core` is deliberately a native boundary without a parallel Document or LayerTree implementation. The prior partial Rust model duplicated TypeScript concepts but did not provide matching commands or serialization, creating a concrete drift risk. Rust remains part of the architecture for future native execution, but it must not grow a second mutable editor engine.

When the native Core is needed for large-document memory management, native persistence, or command execution, migrate atomically: define stable data-transfer objects and command messages, implement the complete domain behavior in Rust, expose that implementation to Tauri and—only when justified—to the web runtime through WebAssembly, then remove the TypeScript domain implementation. Do not maintain both engines.

The cross-language contract is the versioned project DTO plus explicit command/event DTOs. These must describe only structured data, be validated at the receiving boundary, and hide internal Rust data structures. No generated schema or WASM bridge is introduced now because there is currently one implementation and no consumer needs cross-language execution.

## Layer responsibilities

- **TypeScript application/Core:** current authoritative document engine, public Core API, command dispatch, validation, and project serialization. It remains free of React, DOM, Tauri, GPU, and filesystem APIs.
- **Rust:** native-core migration target and future memory-sensitive/native operations; no duplicated domain behavior before the atomic migration.
- **Renderer:** reads a stable document snapshot and owns WebGPU/native-GPU compositing, caching, transforms, and viewport work. It never owns or mutates document state.
- **Platform:** supplies filesystem, clipboard, window, dialogs, input, and OS adapters behind contracts. It does not define document behavior.
- **React UI:** presentation, interaction state, and command dispatch only.
- **Tauri:** thin desktop shell that composes platform adapters and a future native Core; it is never the Editor Core.

## Rendering boundary

The renderer is a distinct TypeScript subsystem. It receives a detached `RenderInput` snapshot derived from the authoritative Core document; it may read that snapshot but cannot mutate a `Document`, execute commands, validate document state, or serialize projects. Renderer-owned state is limited to its surface, viewport, selected backend, GPU/Canvas resources, caches, and frame scheduling.

Backend selection is internal: WebGPU is preferred when an adapter, device, and canvas context initialize successfully; Canvas 2D is a development and compatibility fallback. Both currently render only a deterministic clear frame. A renderer viewport owns logical dimensions, device-pixel ratio, zoom, and pan offset independently from the image document. Rendering is invalidation-driven and coalesces requests into one animation frame, leaving future dirty-region, tile, cache, and culling work behind the same boundary.

`src/platform` contains contracts for web and desktop adapters. Browser and Tauri implementations belong outside core and can be selected by composition at application startup.

`src/renderer` contains rendering contracts only. A WebGPU backend, tiling, caching, compositing, and native GPU backends can be added without changing editor-domain contracts.

React (`src/ui`) is presentation and interaction. Tauri (`src-tauri`) is solely the desktop shell and platform-integration boundary. Linux is the primary deployment target; no Windows-specific behavior belongs in core.

## Runtime foundation

`createEditorCore` owns the minimal core lifecycle and is consumed through its public API by the composition root in the React UI. `createRenderer` probes WebGPU behind the renderer boundary; it reports `unavailable` instead of failing when a browser or webview does not provide a GPU adapter. `createPlatformRuntime` is the only frontend runtime detector and returns a neutral `web` or `tauri` result to the UI.

## Native project data

The Core serializes document structure through a versioned native project representation. It persists document and layer metadata, hierarchy, transforms, and raster *references* only. Future tiled pixel payloads, lazy sources, and GPU caches remain outside this structural representation and will be resolved by dedicated storage adapters rather than the document model.
