# Image Editor

A Linux-first professional image-editing application foundation. This milestone intentionally contains no image-editing features.

## Architecture

```text
React UI ────────────────> TypeScript Editor Core
                                  ^
Platform adapters ────────┘
Renderer contracts ───────> WebGPU / future native GPU backends
Tauri desktop shell ──────> platform integration only
Rust editor-core ─────────> native-core migration boundary (not a duplicate engine)
```

- `src/core/`: the current authoritative, platform-independent document engine.
- `crates/editor-core/`: native-core migration boundary; it intentionally does not duplicate the TypeScript engine.
- `src/platform/`: contracts for filesystem, clipboard, dialogs, windowing, input, and OS integration.
- `src/renderer/`: renderer and cache contracts, ready for WebGPU implementation.
- `src/ui/`: React presentation layer.
- `src-tauri/`: Tauri desktop shell; it is not the editor core.
- `docs/`: architectural decisions and guidance.

## Development

Install frontend dependencies with `npm install`, then run `npm run dev` for the web development interface. Once Rust is installed, use `npm run tauri dev` to run the desktop shell.

The initial runtime screen reports the selected runtime, core lifecycle, renderer bootstrap state, and platform status. `READY` renderer status means WebGPU exposed an adapter; `UNAVAILABLE` is a supported, non-fatal fallback.

The Rust workspace requires a stable Rust toolchain and the normal Tauri Linux prerequisites when building for the primary target. See [docs/architecture.md](docs/architecture.md) for boundary rules.
