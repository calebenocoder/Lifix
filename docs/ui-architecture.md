# UI Architecture

## Professional workspace shell

The current visible UI is a professional shell built from the foundation primitives, not a visual editor implementation. It is composed from a compact top application bar, tool-options row, persistent grouped tool strip, document tab, renderer-owned canvas viewport, inspector panel stack, and restrained bottom status bar. `Layers`, `Properties`, and `Color` are registered panel shells with stable IDs and intentional empty states; none duplicates Core state or commands.

The default **Soft** theme remains modular and uses elevation, gap, and radius tokens. **Flat** preserves the exact component and layout contracts while resolving those same semantic tokens with zero gap/radius/blur. A theme control changes token values only; it must not recreate a Core or Renderer instance.

The UI observes the real document viewport’s CSS geometry and forwards only normalized logical dimensions to the renderer. DPR conversion, rendering, invalidation, and resource ownership remain in `src/renderer`. Future docking may use the existing versioned workspace model and registry; panel drag, docking commits, and panel business functionality are intentionally out of scope.

## Ownership and design-system strategy

The UI has a one-way dependency chain:

```text
Atlassian design-language reference
  -> Lifix semantic tokens
  -> Lifix UI primitives
  -> editor workspace components
```

The [Atlassian Design System foundations](https://atlassian.design/foundations) guide spacing, hierarchy, interaction feedback, focus, and accessible control behavior. They are a reference rather than a runtime or brand dependency. Lifix tokens in `src/ui/design-system` are authoritative; editor components consume semantic CSS custom properties and must not depend on Atlassian token names or values. This follows the useful principle that [design tokens represent design decisions by meaning](https://atlassian.design/foundations/tokens/design-tokens/) while keeping Lifix free to establish its own identity.

No Atlaskit package is adopted in this milestone. Button, input, select, surface, divider, scroll area, icon button, and panel chrome needs are small enough for application-owned accessible primitives without another styling/runtime layer. Focused Atlaskit packages may be reconsidered for complex menu, tooltip, select, focus-management, or keyboard-interaction requirements where they provide measurable accessibility value. Direct third-party imports should remain behind `src/ui/primitives.tsx`; no second general-purpose UI framework is permitted.

The current icons are a small application-owned, single-stroke set behind the shared `Icon` component. Themes never substitute icons. A future coherent icon package may replace the internal paths behind that boundary; components must not mix unrelated libraries or embed theme-specific copies.

## Semantic tokens and themes

Tokens cover canvas/workspace backgrounds, panel and overlay surfaces, text, borders, interaction states, spacing, radius, elevation, blur, opacity, typography, motion, structural workspace gap, panel-header height, and control height. Dock candidate, preview, active, and invalid states are explicit semantic interaction tokens. `themeCssVariables` is the only theme-to-CSS mapping step, and completeness is validated against a fixed token-name contract.

- **Soft / Modular (A)** is the default. It uses compact 38px application chrome, 30px controls, 6px module gaps, moderate rounding, translucent bounded panels/toolbars, restrained blur on bounded chrome, and subtle elevation.
- **Flat / Professional (B)** uses the same components with a denser 34px application chrome, 28px controls, zero workspace gaps, square panel joins, opaque surfaces, no blur, and stronger structural borders.
- **Reserved (C)** is a typed identity with the same complete contract but intentionally has no independent visual design yet.

Blur is confined to bounded toolbar and floating surfaces. It is never placed over the document-rendering area, and Theme B disables it through tokens. Animation is brief, tokenized, and disabled through `prefers-reduced-motion`.

Typography is deliberately utilitarian: application/menu and panel text use the small UI scale; only the Lifix wordmark is medium weight. Panel headers use a 32px/30px tokenized chrome height, 15–16px single-stroke icons, concise titles, and tokenized padding. The central document area retains the remaining window space and its framing styles only the surrounding pasteboard; document pixels remain the renderer's responsibility.

## Workspace and panel model

The workspace is UI state, not editor state:

```text
WorkspaceLayout v1
  dock regions: left | right | top | bottom
    panel stack (tabs)
    or recursive horizontal/vertical split
  floating panels (bounds and z-order)
  theme ID
  preset ID
```

Panel definitions provide stable ID, type, title, icon, minimum/preferred/optional maximum size, and dockable/floatable/closable capabilities. `PanelRegistry` maps each stable ID to a component factory and rejects duplicates. Layout validation rejects unsupported versions, invalid split ratios or floating bounds, duplicate node/panel IDs, unregistered panels, and inconsistent active tabs. Serialization stores only data; it never serializes React elements.

The model is desktop-first. Minimum panel sizes and localized overflow preserve usability in narrow windows; horizontal overflow is preferable to silently compressing professional controls below their minimum. Responsive phone layouts are outside the editor target.

## Core-backed panels and editor session

Panel data follows a one-way state path:

```text
authoritative Core Document
  -> detached EditorSessionSnapshot
  -> Layers / Properties / Color panel presentation
```

`EditorSessionController` is an application-layer adapter, not a second document engine. It keeps the mutable `Document` private, projects only UI-relevant scalar metadata and a detached pixel-selection value, recursively clones transforms and layer hierarchy, and never copies raster pixel buffers. The Layers panel presents the conventional topmost-first view by reversing each Core sibling list during projection; Core and Renderer storage remain bottom-to-top.

Document actions follow the reverse command path:

```text
panel action
  -> typed EditorSessionAction
  -> existing Core command
  -> Core Document mutation and validation
  -> detached RenderInput
  -> renderer invalidation/frame
  -> new EditorSessionSnapshot
```

Visibility, opacity, blend mode, name, transform, and group compositing therefore remain Core-owned. Invalid commands return a safe action result and do not publish a document revision. Commands already retain reversal data, but a complete history stack and Undo/Redo UI remain future work.

State ownership is explicit:

- **Document state:** hierarchy, names, visibility, opacity, blend modes, transforms, group compositing, and the current document-space pixel selection.
- **Editor-session state:** one selected layer (a UI/tool target), expanded group IDs, and foreground/background RGB colors.
- **Workspace state:** theme, registered panels, splits, positions, and future docking data.

Layer targeting, group expansion, panel scrolling, and session colors publish UI snapshots only. They do not create `RenderInput`, invalidate the Renderer, or touch raster/GPU resources. Pixel selection is different: it is a Core document command and is serialized, but it remains renderer-neutral until a future operation explicitly consumes it. Its command publishes the detached selection projection without rebuilding layer projection, `RenderInput`, raster, or GPU resources. Foreground/background colors are simple sRGB-like 8-bit editor working values for future tools; they are not serialized document color management.

The session caches its detached document projection. Layer targeting, pixel-selection, and color changes publish a new session snapshot while reusing that projection; expansion changes rebuild the UI hierarchy but remain renderer-neutral. Render-affecting document commands rebuild the projection and create exactly one downstream render-input notification; pixel-selection commands deliberately do neither. `replaceDocument` clears stale layer targeting, resets expansion IDs against the replacement hierarchy, preserves session colors, and notifies the existing renderer integration without replacing workspace or theme state.

Theme switching is a workspace-only token change. It does not invalidate the renderer because the current document board and pixels are renderer-owned and theme-independent. Viewport resize remains the only workspace geometry signal sent to the renderer.

## Command, history, and tool interaction boundary

`EditorSessionController.executeDocumentCommand` is the single application-layer execution seam for current panel commands and future History integration. Commands already carry reversal data, but there is no History stack, Undo/Redo, coalescing, or panel-local alternate history. A downstream synchronization failure is reported as a warning after the authoritative Core change and UI projection have been published, so the UI never rolls back to stale optimistic state.

Continuous interactions will use a transaction lifecycle rather than commit every preview sample:

```text
pointer/keyboard input
  -> active tool controller
  -> session-owned preview transaction
  -> renderer preview/invalidation as required
  -> one Core command through executeDocumentCommand on commit
  -> future History records one transaction
```

The active tool and its options are editor-session state. Transient pointer coordinates and previews never enter project serialization or workspace state. Cancellation discards preview state; only commit mutates the Core. The Tool Engine foundation is implemented below; History remains deferred.

## Tool and interaction foundation

`src/ui/tools` is the sole interaction boundary for the document viewport. Its immutable `ToolRegistry` maps stable session IDs (`move`, `transform`, `marquee`, `brush`, `eraser`, `crop`, `text`, `shape`, `hand`, and `zoom`) to display metadata, icon identity, cursor intent, optional shortcut metadata, and controller factories. The tool strip derives from that registry. Active tool selection is low-frequency `EditorSessionSnapshot` state, never Document or workspace state; changing it does not create a `RenderInput`.

```text
DOM Pointer / keyboard event
  -> ToolInputRouter
  -> active ToolController
  -> InteractionTransaction + session preview
  -> DOM interaction overlay
  -> optional one executeDocumentCommand() commit
  -> Core -> RenderInput -> Renderer
```

`ToolContext` is deliberately narrow: it supplies a detached session snapshot, renderer viewport read access, preview begin/update/finish functions, and the existing command boundary. It never provides a mutable Document, React state setter, DOM ownership, or GPU resource. Controllers have optional activate/deactivate, pointer, keyboard, and disposal callbacks; they may not bypass `executeDocumentCommand` for committed changes.

Move is the first real editing controller. It currently targets only the selected visible layer (no canvas auto-selection); targeting eligibility is intentionally centralized for future layer locks. Pointer down records the original local transform and parent affine inverse. Pointer movement calculates a document-space delta, converts it to parent-local translation for the eventual transform, and sends a typed renderer preview. Pointer up executes exactly one `SetTransformCommand` through `executeDocumentCommand`; no-op movement creates no command. Escape, `pointercancel`, a tool switch, document replacement, a changed/deleted target, or a non-invertible parent cancel safely without mutation.

### Coordinates, input, and focus

The only coordinate pipeline is:

```text
client CSS coordinates -> logical viewport coordinates -> document coordinates -> future layer-local coordinates
```

`clientToViewport` accounts for the surface bounding rectangle and logical viewport dimensions; `viewportToDocument` remains the renderer-owned zoom/pan conversion. Device pixel ratio is intentionally absent from tool coordinates because it belongs only to physical surface sizing. One active editing pointer is captured on the viewport after controller acceptance and released on pointer up, cancellation, tool replacement, document replacement, or teardown. Pointer type, buttons, pressure, and tilt are retained for future pen/brush work.

Modifier state is normalized to Shift, Alt/Option semantic modifier, Control, and Meta. Tool shortcuts are registry metadata and run only on the focused viewport when the target is not an input, textarea, select, or content-editable element. Escape cancels an active viewport interaction; Escape in a field remains local to that field.

### Preview, overlay, and future tools

`InteractionTransaction` defines begin, update, commit, and cancel semantics. Preview state is private session interaction state rather than a React subscription: pointer movement does not rebuild document projections, RenderInput, render plans, textures, or GPU resources. The overlay is an independent, requestAnimationFrame-coalesced DOM surface above the renderer canvas. It is not part of document pixels or raster compositing.

Move and Transform preview metadata is renderer-owned (`layerId` plus a document-space affine override), while the parent-local candidate remains transient session interaction data. The renderer applies this metadata directly to the existing render plan during its normal coalesced frame; it does not receive a new RenderInput, rebuild GPU resources, or upload textures on pointer movement. On commit, the normal Core → RenderInput route replaces the preview without a visible position jump. Properties intentionally continue showing committed values during the drag and update only after the command succeeds.

Transform geometry is isolated in `transform-engine.ts`; pointer lifecycle, modifier policy, and hit testing live in its controller. A bounds-provider callback decouples the engine from raster-only targets: today it resolves raster source dimensions and conservatively unions group descendants, while future text/vector/smart-object targets may provide their own local bounds. The overlay owns only projected affordances. Stable logical-pixel hit targets and resize cursors are used; cursor directions are currently screen-axis presets rather than dynamically rotated artwork cursors.

**Marquee** uses the same transaction lifecycle but owns no raster or renderer preview. Pointer samples produce a requestAnimationFrame-coalesced DOM rectangle over the surface in document-to-viewport coordinates. Pointer-up replaces the normalized/clipped Core `PixelSelection` with one command; a click clears an existing selection. Its persistent outline is the same renderer-independent overlay, projected from Core state. Selection must never enter `RenderInput` or affect raster/GPU resources until a future Core operation (copy, fill, transform, filter, mask) explicitly consumes it.

**Crop** is a persistent transient transaction while the tool is active. It starts at the full document, supports moving and eight resize handles, and keeps all geometry in document coordinates. Its outline, handles, and document-only outside dimming are DOM overlay affordances; pointer movement does not mutate Core, rebuild `RenderInput`, or touch raster/GPU resources. Enter snaps to integer pixels and commits one `CropDocumentCommand`; a full-document rectangle commits nothing. Escape, pointer cancellation, tool changes, and document replacement discard the preview. A successful crop fits the new document through the renderer viewport API. The Core command changes document bounds, translates roots once, and adjusts the Core pixel selection; it deliberately preserves raster sources and off-canvas layer content. Expansion, rotation/straighten, destructive trimming, and resampling are deferred.

**Hand** and **Zoom** operate renderer viewport pan/zoom only, never Core document commands. **Brush** will use a specialized high-frequency stroke system rather than React state. **Text** will enter an explicit editable mode that suspends tool keyboard routing. Shape, paths, masks, filters, and all final editing behaviors remain deferred.

## Docking and magnetic attachment

Docking is represented as panel stacks, nested splits, edge regions, and floating bounds. The pure `detectSnapIntent` function is only an architectural prototype: it selects the closest in-threshold edge deterministically, keeps geometric candidacy separate from target validity, and returns token-addressable preview geometry. A complete interaction will follow four phases: free movement, local target detection, visible preview, and commit on release. Snap thresholds must be large enough to feel intentional but must not force accidental docking.

[Pragmatic Drag and Drop's core package](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/) was evaluated. Its optional entry points, requestAnimationFrame-throttled events, hitbox helpers, and [accessibility guidance](https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines/) are valuable for list and reorder interactions. It is deferred because free-position desktop panels, magnetic workspace edges, transforms, resize coordination, and custom preview/commit semantics still require application-owned orchestration; adding it now would not remove meaningful code.

The planned docking engine therefore starts with native Pointer Events, pointer capture, transform-based movement, requestAnimationFrame-coalesced geometry work, and localized drag state. Pragmatic Drag and Drop should be reevaluated when tab/panel reordering and real keyboard drag alternatives are designed. Pointer dragging alone is never the accessible interface: docking commands need keyboard/menu equivalents, descriptive announcements, deliberate focus restoration, and visible focus states.

## Performance and renderer isolation

Pointer coordinates and transient preview geometry must remain local to the dragged surface/controller, not broad React context or Editor Core. Movement should update transforms at most once per animation frame and avoid layout reads after writes. Stable panel IDs allow localized reconciliation. Large backdrop filters, deep wrapper trees, broad animation frameworks, and document-sized translucent surfaces are prohibited.

The renderer owns the canvas, viewport, frame scheduler, and GPU resources. Workspace movement does not create render inputs, execute Core commands, or reconstruct the renderer. When docking changes document-area dimensions, the UI reports the new logical size and DPR through the renderer's existing resize API; its current viewport transform is preserved unless an explicit fit command is requested.

## Accessibility

Primitives use native buttons, inputs, selects, headings, and regions first. Icon-only controls have accessible names; selected toggle-like controls expose pressed state; keyboard focus is visibly drawn with the semantic focus token. Layer rows select with Enter/Space and expand or collapse groups with ArrowRight/ArrowLeft; disclosure and visibility controls retain explicit accessible names. Property inputs retain valid Core state while allowing temporary text, commit on blur/Enter, cancel with Escape, and resynchronize when the selected Core layer changes. Scroll regions can receive keyboard focus. Contrast must remain sufficient in every theme, interaction cannot depend on color alone, reduced motion is respected, and eventual floating/docking operations require non-pointer alternatives. These rules align with the [Atlassian accessibility foundation](https://atlassian.design/foundations/accessibility) without binding the application to Atlassian implementation details.

## Current limits

The professional shell is not a docking engine. Layers supports hierarchy, selection, expansion, and visibility; Properties exposes the current Core scalar layer properties; Color provides session RGB/hex values. The recursive hierarchy is suitable for current lightweight documents; row virtualization should be considered when profiling shows hundreds or thousands of visible rows, without changing the session projection contract. There is no layer reordering UI, multi-selection, history stack, live GPU thumbnails, persistence adapter, drag gesture, resizing, close/open command, keyboard docking workflow, tooltip/menu primitive, or panel plugin API yet. Theme C is reserved. These capabilities should extend the current data contracts incrementally without leaking UI state into Core, platform, or Renderer ownership.
