import type { ChangeEvent, FocusEvent, KeyboardEvent } from "react";
import type { BlendMode, GroupCompositingMode, Transform } from "../../core";
import type { EditorActionResult, EditorSessionAction, EditorSessionSnapshot } from "../editor";
import { PanelChrome, ScrollArea, Select, TextInput } from "../primitives";
import { Icon } from "../icons";

function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) { if (event.key === "Enter") event.currentTarget.blur(); }

export function PropertiesPanel({ editor, dispatch }: { readonly editor: EditorSessionSnapshot; readonly dispatch: (action: EditorSessionAction) => EditorActionResult | void }) {
  const layer = editor.selectedLayer;
  if (!layer) return <PanelChrome title="Properties" icon="properties"><div className="panel-empty-state"><Icon name="properties" /><strong>No active selection</strong><span>Select a layer to inspect its properties.</span></div></PanelChrome>;
  const commitNumber = (event: FocusEvent<HTMLInputElement>, current: number, update: (value: number) => EditorSessionAction) => { const value = Number(event.currentTarget.value); const result = Number.isFinite(value) ? dispatch(update(value)) : { ok: false }; if (result && !result.ok) event.currentTarget.value = String(current); };
  const transform = (patch: Partial<{ x: number; y: number; scaleX: number; scaleY: number; rotation: number }>): Transform => ({ position: { x: patch.x ?? layer.transform.position.x, y: patch.y ?? layer.transform.position.y }, scale: { x: patch.scaleX ?? layer.transform.scale.x, y: patch.scaleY ?? layer.transform.scale.y }, rotation: patch.rotation ?? layer.transform.rotation });
  return <PanelChrome title="Properties" icon="properties"><ScrollArea className="properties-panel" key={layer.id}>
    <TextInput id="layer-name" label="Name" defaultValue={layer.name} onKeyDown={blurOnEnter} onBlur={event => { const result = dispatch({ type: "rename-layer", layerId: layer.id, name: event.currentTarget.value }); if (result && !result.ok) event.currentTarget.value = layer.name; }} />
    <label className="property-toggle"><input type="checkbox" checked={layer.visible} onChange={event => dispatch({ type: "set-visibility", layerId: layer.id, visible: event.currentTarget.checked })} /><span>Visible</span></label>
    <TextInput id="layer-opacity" label="Opacity (%)" type="number" min="0" max="100" step="1" defaultValue={Math.round(layer.opacity * 100)} onKeyDown={blurOnEnter} onBlur={event => commitNumber(event, Math.round(layer.opacity * 100), value => ({ type: "set-opacity", layerId: layer.id, opacity: value / 100 }))} />
    <Select id="layer-blend-mode" label="Blend mode" value={layer.blendMode} onChange={(event: ChangeEvent<HTMLSelectElement>) => dispatch({ type: "set-blend-mode", layerId: layer.id, blendMode: event.currentTarget.value as BlendMode })}><option value="normal">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="overlay">Overlay</option></Select>
    {layer.kind === "group" ? <Select id="group-compositing" label="Group compositing" value={layer.compositing} onChange={(event: ChangeEvent<HTMLSelectElement>) => dispatch({ type: "set-group-compositing", layerId: layer.id, compositing: event.currentTarget.value as GroupCompositingMode })}><option value="pass-through">Pass through</option><option value="isolated">Isolated</option></Select> : null}
    <div className="property-section"><h3>Transform</h3><div className="property-grid">
      <TextInput id="transform-x" label="X" type="number" step="1" defaultValue={layer.transform.position.x} onKeyDown={blurOnEnter} onBlur={event => commitNumber(event, layer.transform.position.x, value => ({ type: "set-transform", layerId: layer.id, transform: transform({ x: value }) }))} />
      <TextInput id="transform-y" label="Y" type="number" step="1" defaultValue={layer.transform.position.y} onKeyDown={blurOnEnter} onBlur={event => commitNumber(event, layer.transform.position.y, value => ({ type: "set-transform", layerId: layer.id, transform: transform({ y: value }) }))} />
      <TextInput id="transform-scale-x" label="Scale X" type="number" step="0.1" defaultValue={layer.transform.scale.x} onKeyDown={blurOnEnter} onBlur={event => commitNumber(event, layer.transform.scale.x, value => ({ type: "set-transform", layerId: layer.id, transform: transform({ scaleX: value }) }))} />
      <TextInput id="transform-scale-y" label="Scale Y" type="number" step="0.1" defaultValue={layer.transform.scale.y} onKeyDown={blurOnEnter} onBlur={event => commitNumber(event, layer.transform.scale.y, value => ({ type: "set-transform", layerId: layer.id, transform: transform({ scaleY: value }) }))} />
      <TextInput id="transform-rotation" label="Rotation" type="number" step="1" defaultValue={layer.transform.rotation} onKeyDown={blurOnEnter} onBlur={event => commitNumber(event, layer.transform.rotation, value => ({ type: "set-transform", layerId: layer.id, transform: transform({ rotation: value }) }))} />
    </div></div>
  </ScrollArea></PanelChrome>;
}
