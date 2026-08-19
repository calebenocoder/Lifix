# Working Agreement

- Target Linux first. Windows is the current development environment only; keep portability to Windows and macOS.
- Rust is part of the core architecture from the beginning. Keep `crates/editor-core` free of UI, Tauri, and OS APIs.
- React and TypeScript provide the presentation and interaction layer, not editor-domain ownership.
- Tauri is the desktop and platform-integration layer, never the application core.
- Keep platform behavior behind `src/platform` contracts. Do not leak DOM, browser, Tauri, Windows, Linux, or macOS APIs into core.
- Keep rendering behind `src/renderer` contracts; preserve room for WebGPU and future native GPU backends.
- Avoid unnecessary rewrites, preserve existing functionality, and work incrementally.
- Test relevant changes before declaring completion. Document architectural decisions when boundaries change.

