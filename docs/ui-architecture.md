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

`EditorSessionController` is an application-layer adapter, not a second document engine. It keeps the mutable `Document` private, projects only UI-relevant scalar metadata, recursively clones transforms and layer hierarchy, and never copies raster pixel buffers. The Layers panel presents the conventional topmost-first view by reversing each Core sibling list during projection; Core and Renderer storage remain bottom-to-top.

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

- **Document state:** hierarchy, names, visibility, opacity, blend modes, transforms, and group compositing.
- **Editor-session state:** one selected layer, expanded group IDs, and foreground/background RGB colors.
- **Workspace state:** theme, registered panels, splits, positions, and future docking data.

Selection, group expansion, panel scrolling, and session colors publish UI snapshots only. They do not create `RenderInput`, invalidate the Renderer, or touch raster/GPU resources. Foreground/background colors are simple sRGB-like 8-bit editor working values for future tools; they are not serialized document color management.

## Docking and magnetic attachment

Docking is represented as panel stacks, nested splits, edge regions, and floating bounds. The pure `detectSnapIntent` function is only an architectural prototype: it selects the closest in-threshold edge deterministically, keeps geometric candidacy separate from target validity, and returns token-addressable preview geometry. A complete interaction will follow four phases: free movement, local target detection, visible preview, and commit on release. Snap thresholds must be large enough to feel intentional but must not force accidental docking.

[Pragmatic Drag and Drop's core package](https://atlassian.design/components/pragmatic-drag-and-drop/core-package/) was evaluated. Its optional entry points, requestAnimationFrame-throttled events, hitbox helpers, and [accessibility guidance](https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines/) are valuable for list and reorder interactions. It is deferred because free-position desktop panels, magnetic workspace edges, transforms, resize coordination, and custom preview/commit semantics still require application-owned orchestration; adding it now would not remove meaningful code.

The planned docking engine therefore starts with native Pointer Events, pointer capture, transform-based movement, requestAnimationFrame-coalesced geometry work, and localized drag state. Pragmatic Drag and Drop should be reevaluated when tab/panel reordering and real keyboard drag alternatives are designed. Pointer dragging alone is never the accessible interface: docking commands need keyboard/menu equivalents, descriptive announcements, deliberate focus restoration, and visible focus states.

## Performance and renderer isolation

Pointer coordinates and transient preview geometry must remain local to the dragged surface/controller, not broad React context or Editor Core. Movement should update transforms at most once per animation frame and avoid layout reads after writes. Stable panel IDs allow localized reconciliation. Large backdrop filters, deep wrapper trees, broad animation frameworks, and document-sized translucent surfaces are prohibited.

The renderer owns the canvas, viewport, frame scheduler, and GPU resources. Workspace movement does not create render inputs, execute Core commands, or reconstruct the renderer. When docking changes document-area dimensions, the UI reports the new logical size and DPR through the renderer's existing resize API; its current viewport transform is preserved unless an explicit fit command is requested.

## Accessibility

Primitives use native buttons, inputs, selects, headings, and regions first. Icon-only controls have accessible names; selected toggle-like controls expose pressed state; keyboard focus is visibly drawn with the semantic focus token. Scroll regions can receive keyboard focus. Contrast must remain sufficient in every theme, interaction cannot depend on color alone, reduced motion is respected, and eventual floating/docking operations require non-pointer alternatives. These rules align with the [Atlassian accessibility foundation](https://atlassian.design/foundations/accessibility) without binding the application to Atlassian implementation details.

## Current limits

The professional shell is not a docking engine. Layers supports hierarchy, selection, expansion, and visibility; Properties exposes the current Core scalar layer properties; Color provides session RGB/hex values. There is no layer reordering UI, multi-selection, history stack, live GPU thumbnails, persistence adapter, drag gesture, resizing, close/open command, keyboard docking workflow, tooltip/menu primitive, or panel plugin API yet. Theme C is reserved. These capabilities should extend the current data contracts incrementally without leaking UI state into Core, platform, or Renderer ownership.
