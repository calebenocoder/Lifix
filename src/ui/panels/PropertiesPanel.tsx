import { useEffect, useState, type ChangeEvent, type InputHTMLAttributes, type KeyboardEvent } from "react";
import type { BlendMode, GroupCompositingMode, Transform } from "../../core";
import type { EditorActionResult, EditorSessionAction, EditorSessionSnapshot } from "../editor";
import { PanelChrome, ScrollArea, Select, TextInput } from "../primitives";
import { Icon } from "../icons";

function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) { if (event.key === "Enter") event.currentTarget.blur(); }

function DraftInput({ value, commit, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange" | "onBlur"> & { readonly id: string; readonly label: string; readonly value: string | number; readonly commit: (value: string) => EditorActionResult | void }) {
  const canonical = String(value);
  const [draft, setDraft] = useState(canonical);
  useEffect(() => setDraft(canonical), [canonical]);
  return <TextInput {...props} value={draft} onChange={event => setDraft(event.currentTarget.value)} onKeyDown={event => {
    blurOnEnter(event);
    if (event.key === "Escape") { setDraft(canonical); event.currentTarget.blur(); }
  }} onBlur={() => { const result = commit(draft); if (result && !result.ok) setDraft(canonical); }} />;
}

export function PropertiesPanel({ editor, dispatch }: { readonly editor: EditorSessionSnapshot; readonly dispatch: (action: EditorSessionAction) => EditorActionResult | void }) {
  const layer = editor.selectedLayer;
  if (!layer) return <PanelChrome title="Properties" icon="properties"><div className="panel-empty-state"><Icon name="properties" /><strong>No active selection</strong><span>Select a layer to inspect its properties.</span></div></PanelChrome>;
  const commitNumber = (draft: string, update: (value: number) => EditorSessionAction): EditorActionResult | void => {
    if (!draft.trim()) return { ok: false, error: "A numeric value is required" };
    const value = Number(draft);
    return Number.isFinite(value) ? dispatch(update(value)) : { ok: false, error: "A finite numeric value is required" };
  };
  const transform = (patch: Partial<{ x: number; y: number; scaleX: number; scaleY: number; rotation: number }>): Transform => ({ position: { x: patch.x ?? layer.transform.position.x, y: patch.y ?? layer.transform.position.y }, scale: { x: patch.scaleX ?? layer.transform.scale.x, y: patch.scaleY ?? layer.transform.scale.y }, rotation: patch.rotation ?? layer.transform.rotation });
  return <PanelChrome title="Properties" icon="properties"><ScrollArea className="properties-panel" key={layer.id}>
    <DraftInput id="layer-name" label="Name" value={layer.name} commit={name => dispatch({ type: "rename-layer", layerId: layer.id, name })} />
    <label className="property-toggle"><input type="checkbox" checked={layer.visible} onChange={event => dispatch({ type: "set-visibility", layerId: layer.id, visible: event.currentTarget.checked })} /><span>Visible</span></label>
    <DraftInput id="layer-opacity" label="Opacity (%)" type="number" min="0" max="100" step="1" value={Math.round(layer.opacity * 100)} commit={draft => commitNumber(draft, value => ({ type: "set-opacity", layerId: layer.id, opacity: value / 100 }))} />
    <Select id="layer-blend-mode" label="Blend mode" value={layer.blendMode} onChange={(event: ChangeEvent<HTMLSelectElement>) => dispatch({ type: "set-blend-mode", layerId: layer.id, blendMode: event.currentTarget.value as BlendMode })}><option value="normal">Normal</option><option value="multiply">Multiply</option><option value="screen">Screen</option><option value="overlay">Overlay</option></Select>
    {layer.kind === "group" ? <Select id="group-compositing" label="Group compositing" value={layer.compositing} onChange={(event: ChangeEvent<HTMLSelectElement>) => dispatch({ type: "set-group-compositing", layerId: layer.id, compositing: event.currentTarget.value as GroupCompositingMode })}><option value="pass-through">Pass through</option><option value="isolated">Isolated</option></Select> : null}
    <div className="property-section"><h3>Transform</h3><div className="property-grid">
      <DraftInput id="transform-x" label="X" type="number" step="1" value={layer.transform.position.x} commit={draft => commitNumber(draft, value => ({ type: "set-transform", layerId: layer.id, transform: transform({ x: value }) }))} />
      <DraftInput id="transform-y" label="Y" type="number" step="1" value={layer.transform.position.y} commit={draft => commitNumber(draft, value => ({ type: "set-transform", layerId: layer.id, transform: transform({ y: value }) }))} />
      <DraftInput id="transform-scale-x" label="Scale X" type="number" step="0.1" value={layer.transform.scale.x} commit={draft => commitNumber(draft, value => ({ type: "set-transform", layerId: layer.id, transform: transform({ scaleX: value }) }))} />
      <DraftInput id="transform-scale-y" label="Scale Y" type="number" step="0.1" value={layer.transform.scale.y} commit={draft => commitNumber(draft, value => ({ type: "set-transform", layerId: layer.id, transform: transform({ scaleY: value }) }))} />
      <DraftInput id="transform-rotation" label="Rotation" type="number" step="1" value={layer.transform.rotation} commit={draft => commitNumber(draft, value => ({ type: "set-transform", layerId: layer.id, transform: transform({ rotation: value }) }))} />
    </div></div>
  </ScrollArea></PanelChrome>;
}
