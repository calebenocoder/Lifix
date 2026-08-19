# Working Agreement

- Target Linux first. Windows is the current development environment only; keep portability to Windows and macOS.
- Rust is part of the core architecture from the beginning. Keep `crates/editor-core` free of UI, Tauri, and OS APIs.
- During the web-first phase, `src/core` is the single authoritative document engine. Do not recreate Document, LayerTree, commands, validation, or project serialization in Rust.
- `crates/editor-core` is a native boundary, not a second engine. Migrate to a Rust-authoritative Core only as one deliberate, atomic replacement through stable DTO/command contracts; delete the TypeScript engine at that migration point.
- Treat project DTOs and command messages as the TS ↔ Rust boundary. Keep native internals private; do not manually mirror mutable domain models across languages.
- Introduce WebAssembly only when a complete Rust Core needs to execute in the web runtime and the shared execution benefit outweighs its toolchain and debugging cost.
- React provides presentation and interaction only. The platform-independent TypeScript Core owns current domain behavior; UI code must not duplicate it.
- Tauri is the desktop and platform-integration layer, never the application core.
- Keep platform behavior behind `src/platform` contracts. Do not leak DOM, browser, Tauri, Windows, Linux, or macOS APIs into core.
- Keep rendering behind `src/renderer` contracts; preserve room for WebGPU and future native GPU backends.
- Avoid unnecessary rewrites, preserve existing functionality, and work incrementally.
- Test relevant changes before declaring completion. Document architectural decisions when boundaries change.
