# Architecture

The editor domain is platform-independent and is represented in both TypeScript (`src/core`) and Rust (`crates/editor-core`). Rust is introduced at the foundation so future performance-sensitive and authoritative domain operations have a native home.

`src/platform` contains contracts for web and desktop adapters. Browser and Tauri implementations belong outside core and can be selected by composition at application startup.

`src/renderer` contains rendering contracts only. A WebGPU backend, tiling, caching, compositing, and native GPU backends can be added without changing editor-domain contracts.

React (`src/ui`) is presentation and interaction. Tauri (`src-tauri`) is solely the desktop shell and platform-integration boundary. Linux is the primary deployment target; no Windows-specific behavior belongs in core.

