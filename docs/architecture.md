# Architecture

## Core ownership

`src/core` is the sole authoritative Editor Core during the web-first phase. It owns document state, layer hierarchy and invariants, document-space pixel-selection geometry, commands, validation, and the versioned project format. The running React application dispatches its public Core API; React components do not own or implement domain rules.

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

## UI and workspace boundary

The professional UI foundation lives in `src/ui` and is intentionally downstream of both Core and Renderer contracts. Application semantic tokens are the visual source of truth; shared UI primitives consume their CSS variables, and editor-facing workspace components consume those primitives. Theme changes replace token values rather than component structure, document state, or renderer resources.

Workspace state is a separate, versioned UI model containing stable panel identities, dock regions, tab stacks, nested splits, floating bounds, theme, and preset. It is not part of the native image project format. A `PanelRegistry` maps stable IDs to UI factories at runtime, so serialized layouts never contain React components. Dock target and snap-intent types describe future magnetic preview/commit behavior without implementing a drag engine.

The visible foundation is a professional workspace shell, not final editor feature UI. It uses a top application bar, neutral tool-options row, stable tool-strip panel, document tab and renderer viewport, registered inspector panels (`layers`, `properties`, `color`), and a status bar. The panels are intentionally lightweight placeholders: they do not mirror document state or implement editing behavior.

Workspace layout remains a separate, versioned UI model. The `professional-shell` preset registers stable UI-only IDs (`application-menu`, `tool-options`, `tool-strip`, `layers`, `properties`, `color`, and `status`) so future docking/persistence can evolve without serializing React components. It is independent from the native project format.

The document viewport owns a `ResizeObserver` in the UI composition layer. It reports logical CSS dimensions to the existing renderer `resize` API; the renderer preserves zoom/pan and maps DPR to physical pixels. Theme switches and normal React renders reuse the current renderer instance, render plan, and backend resources. Only real viewport geometry changes request a resize, so workspace presentation never becomes a second rendering implementation. Full rationale, theme definitions, dependency policy, accessibility rules, and docking direction are recorded in [UI architecture](./ui-architecture.md).

Core-backed panels consume detached `EditorSessionSnapshot` values projected by a non-React application adapter. Panels dispatch typed session actions; render-affecting document actions are translated to Core commands before a new renderer snapshot is created. Selected layer, collapsed groups, and foreground/background colors are editor-session state, while theme/panel layout remains workspace state. The selected layer is only a UI/tool target and is never serialized. In contrast, the Core-owned document pixel selection is serializable operation state but remains renderer-neutral until a future operation consumes it. Non-document session actions never notify the Renderer.

## Rendering boundary

The renderer is a distinct TypeScript subsystem. It receives a detached `RenderInput` snapshot derived from the authoritative Core document; it may read that snapshot but cannot mutate a `Document`, execute commands, validate document state, or serialize projects. Renderer-owned state is limited to its surface, viewport, selected backend, GPU/Canvas resources, caches, and frame scheduling.

Backend selection is internal: WebGPU is preferred when an adapter, device, and canvas context initialize successfully; Canvas 2D is a development and compatibility fallback. A renderer viewport owns logical dimensions, device-pixel ratio, zoom, and pan offset independently from the image document. Rendering is invalidation-driven and coalesces requests into one animation frame, leaving future dirty-region, tile, cache, and culling work behind the same boundary.

### Layer compositing foundation

`createRenderPlan` resolves the detached `RenderInput` into a renderer-owned, immutable compositing tree plus a deterministic flat raster index. Every tree level is bottom-to-top: a later root, sibling, or child is composited above an earlier one. Group visibility suppresses descendants and group transforms remain composed into descendant affine transforms; neither backend owns or mutates the Core hierarchy.

Core groups have one structural `compositing` property: `pass-through` (the default) or `isolated`. A pass-through group with opacity `1` and Normal blend sends its children directly into the parent compositing context. A requested isolated group renders children into a transparent intermediate and composites the result into its parent. Pass-through groups with opacity below `1` or a non-Normal blend are deliberately promoted to effective isolation: this is required to apply group opacity/blend once to the group result instead of incorrectly multiplying opacity into each child. Nested isolated and pass-through groups follow the same rule recursively.

The raster-source boundary is `RasterSourceResolver`. Core and `RenderInput` retain only a `RasterDataReference`; full pixel buffers never enter the document snapshot. A resolved source has a stable ID, non-negative revision, dimensions, typed pixel-format metadata, and an owned pixel buffer. The currently supported format is RGBA8 unorm in RGBA channel order, top row first, with straight (unpremultiplied) alpha. Mutated content must be published with a higher revision.

Canvas converts each source revision into one cached drawable surface and uses the standardized `source-over`, `multiply`, `screen`, and `overlay` compositing operations. WebGPU converts the straight-alpha source to premultiplied alpha once per upload, stores it in an `rgba8unorm` texture, pads rows to the required 256-byte alignment when necessary, and samples through one backend-owned clamp-to-edge sampler (linear by default, nearest available explicitly). UV `(0, 0)` maps to the top-left source pixel and `(1, 1)` to the bottom-right, so no backend performs a vertical flip.

Blend functions are evaluated on unassociated source/backdrop colors, with zero-alpha colors defined as black to avoid division by zero. Layer opacity scales premultiplied source RGB and alpha together exactly once. The result then uses the W3C blend-plus-source-over equation: non-overlap source, alpha-overlap blend result, and non-overlap destination are combined separately; output alpha is ordinary source-over. Normal reduces exactly to premultiplied source-over. CPU reference functions and WGSL use the same mode indices and equations.

The present color-space assumption is intentionally limited: document metadata and source bytes are treated as sRGB-encoded values, while the current `rgba8unorm` GPU texture performs no automatic sRGB transfer conversion. All current blend functions therefore operate numerically in encoded component space rather than linear light, which approximates the Canvas reference behavior but is not a color-managed workflow. A future color-management milestone must choose explicit decode, working, blend, and output spaces instead of building on this temporary assumption.

Backend raster caches remain keyed only by source ID and revision, independently of compositing mode. Unchanged revisions reuse their drawable or GPU texture; revision changes, explicit invalidation, source removal, end-of-frame unused-resource pruning, backend replacement, and renderer disposal release cached resources. Upload-padding buffers are transient and never retained. Temporary composite surfaces use a separate renderer-owned pool keyed by group identity and physical bounds: stable bounds reuse surfaces, resized surfaces replace and release old resources, and unused groups are pruned after the frame. These intermediates never enter Core snapshots.

Canvas intermediate surfaces use `OffscreenCanvas` or an internal canvas equivalent. WebGPU uses two distinct sampled/render-target textures per active composite target. Each blend step copies the current destination into the alternate target, samples the previous destination, writes the result into the alternate target, and swaps them. It never samples from the texture currently attached for writing. Isolated-group targets use conservative transformed descendant bounds clipped to the visible physical viewport rather than document-sized allocation. Root and group targets, bind groups, textures, samplers, pipelines, and uniform buffers are backend-owned and deterministically released.

Source notifications invalidate the event-driven renderer without creating a permanent loop. Multiple invalidations coalesce into one scheduled frame, render plans are generated only when a new snapshot is submitted, and viewport-only redraws reuse that plan. Concurrent initialization is coalesced; a backend that finishes after surface replacement or renderer disposal is immediately disposed. Missing, malformed, unsupported, or failed sources produce typed per-layer `RendererIssue` entries and the affected layer is skipped without destroying an otherwise healthy renderer. Memory-budgeted tile caching, decoded assets, higher bit depths, mipmaps, and color-managed formats remain future work.

### Scalability and bounds review

The current renderer is viewport-centric, not document-surface-centric. A large logical document changes board coordinates and fit calculations, but it does not allocate a matching raster, Canvas, or WebGPU target by itself. Raster sources remain small independently-addressed resources; the renderer creates backend resources only for visible raster bounds. Whole-layer culling uses conservative affine bounds (translation, rotation, non-uniform or negative scale, and nested transforms) projected into the physical viewport. Non-finite or overflowed bounds are safely skipped instead of propagating invalid coordinates into Canvas or GPU work.

Isolated-group bounds are the union of resolved descendant bounds and are intersected with the physical viewport before allocating an intermediate. Consequently a small or partially visible group in a 4K/8K/16K logical document receives only a viewport-clipped temporary target. Ping-pong targets and Canvas offscreen surfaces reuse stable keys and matching physical sizes during a frame; changed size, unused target, backend replacement, and disposal deterministically release them. This is a controlled lifecycle, not a memory-budgeted pool.

Resource cache entries are still keyed by source ID plus revision. The cache additionally retains only small validated width/height metadata for the active render plan, allowing viewport-only redraws to cull and reuse known resources without resolving sources or recreating textures. A new render input checks revisions; resolver notifications explicitly invalidate a changed/removed source. Metadata and unused backend resources are pruned at the end of a render cycle. The present limits remain intentional: no tile culling, texture memory budget, mipmaps, decoded-asset streaming, or extremely deep-recursion policy exists yet.

Normal, Multiply, Screen, and Overlay are explicitly supported for raster layers and isolated group results. Canvas and WebGPU share the same bottom-to-top tree order, affine transforms, pass-through/isolation decisions, group-opacity rules, top-left raster orientation, blend/source-over semantics, and missing-source isolation. Expected differences are limited to implementation-defined Canvas resampling details, explicit WebGPU nearest/linear sampling, and small 8-bit premultiplication/rounding differences. Masks, clipping, adjustment layers, effects, linear-light blending, color management, mipmaps, and tile-aware intermediate targets remain future work.

### Viewport coordinate spaces

The renderer keeps three spaces explicit: **document space** is the image's unscaled pixel coordinate system; **viewport space** is logical CSS-pixel space; **physical surface space** is the canvas backing-store size, calculated from viewport size × device-pixel ratio. Zoom and pan calculations always use logical viewport coordinates, so a DPR change never changes document position or zoom.

`offsetX` and `offsetY` mean the viewport-space position of document origin `(0, 0)`. Therefore document → viewport is `document * zoom + offset`; the inverse subtracts offset and divides by zoom. Fit-document, fit-width, and actual-size are pure calculations that center the resulting document bounds. Panning and zooming invalidate the renderer but do not modify Core state. Both the Canvas and WebGPU document-board paths consume these shared bounds; future layer passes must do the same rather than create alternate coordinate math.

`src/platform` contains contracts for web and desktop adapters. Browser and Tauri implementations belong outside core and can be selected by composition at application startup.

`src/renderer` contains rendering contracts only. A WebGPU backend, tiling, caching, compositing, and native GPU backends can be added without changing editor-domain contracts.

React (`src/ui`) is presentation and interaction. Tauri (`src-tauri`) is solely the desktop shell and platform-integration boundary. Linux is the primary deployment target; no Windows-specific behavior belongs in core.

### Tool interaction boundary

The renderer canvas remains the document-pixel surface. `src/ui/tools` owns the independent DOM interaction overlay, centralized pointer/keyboard router, client-to-logical-viewport-to-document coordinate bridge, and controller lifecycle. Tools receive only detached session/viewport information through `ToolContext`; committed edits must pass through `EditorSessionController.executeDocumentCommand`, while pointer previews never create `RenderInput` or renderer resources. The first real Move tool is selected-layer-only: it converts a document-space pointer delta into a parent-local translation, places only a typed transient document-space transform preview in the renderer, then commits one `SetTransformCommand` on release. It cancels on Escape, pointer cancellation, tool/document replacement, or stale target state. Hand and Zoom remain future renderer viewport operations.

Move previews are renderer-owned metadata (`layerId` plus document-space delta) applied to the existing immutable render plan during a coalesced frame. They neither rebuild the plan/input nor mutate Core state, upload raster data, or serialize. A selected group preview translates its rendered descendants together; the final Core transform changes only the group transform. For nested selected layers, the tool inverts the composed parent affine transform before committing local `x/y`; non-invertible parents refuse the interaction safely. Layers can remain off-canvas and coordinates retain fractional values.

Marquee is the first Core-backed pixel-operation tool. Its current `PixelSelection` variant is a normalized rectangle in document coordinates over the half-open geometric domain `[0, width] × [0, height]`; raster sample indices remain a separate future concern. A drag shows only a transient DOM overlay and commits exactly one `SetPixelSelectionCommand` on pointer-up. The command clips the rectangle to document bounds; a click or wholly outside drag clears an existing selection through `ClearPixelSelectionCommand`. Escape, `pointercancel`, tool changes, and document replacement discard only transient geometry. The committed outline is an overlay derived from the detached session projection: it is neither raster data nor `RenderInput`, so selection-only commands do not rebuild render plans, textures, or GPU resources. Future selection variants may use coverage masks or tiled representations behind the same Core boundary.

## Runtime foundation

`createEditorCore` owns the minimal core lifecycle and is consumed through its public API by the composition root in the React UI. `createRenderer` probes WebGPU behind the renderer boundary; it reports `unavailable` instead of failing when a browser or webview does not provide a GPU adapter. `createPlatformRuntime` is the only frontend runtime detector and returns a neutral `web` or `tauri` result to the UI.

## Native project data

The Core serializes document structure through a versioned native project representation. It persists document and layer metadata, hierarchy, transforms, raster *references*, and the current rectangular pixel-selection geometry only. The selection field is optional when reading existing v1 data, where an omitted value means no selection. Future tiled pixel payloads, lazy sources, GPU caches, and selection coverage payloads remain outside this structural representation and will be resolved by dedicated storage adapters rather than the document model.
