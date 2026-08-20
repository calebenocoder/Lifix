import { IconButton } from "../primitives";
import { Icon } from "../icons";
import type { EditorLayerView, EditorSessionAction } from "../editor";

export function LayerRow({ layer, depth, selectedLayerId, dispatch }: { readonly layer: EditorLayerView; readonly depth: number; readonly selectedLayerId: string | null; readonly dispatch: (action: EditorSessionAction) => void }) {
  const selected = layer.id === selectedLayerId;
  const select = () => dispatch({ type: "select-layer", layerId: layer.id });
  return <>
    <div className="layer-row" role="treeitem" aria-level={depth + 1} aria-selected={selected} aria-expanded={layer.kind === "group" ? layer.expanded : undefined} tabIndex={0} style={{ paddingInlineStart: `calc(var(--ui-space-050) + ${depth} * var(--ui-space-150))` }} onClick={select} onKeyDown={event => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(); }
      if (layer.kind === "group" && ((event.key === "ArrowRight" && !layer.expanded) || (event.key === "ArrowLeft" && layer.expanded))) { event.preventDefault(); dispatch({ type: "toggle-group", layerId: layer.id }); }
    }}>
      {layer.kind === "group" ? <IconButton className={`layer-row__disclosure${layer.expanded ? " layer-row__disclosure--expanded" : ""}`} label={`${layer.expanded ? "Collapse" : "Expand"} ${layer.name}`} icon="chevron" onClick={event => { event.stopPropagation(); dispatch({ type: "toggle-group", layerId: layer.id }); }} /> : <span className="layer-row__spacer" />}
      <IconButton className="layer-row__visibility" label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`} icon={layer.visible ? "eye" : "eye-off"} onClick={event => { event.stopPropagation(); dispatch({ type: "set-visibility", layerId: layer.id, visible: !layer.visible }); }} />
      <span className={`layer-thumbnail layer-thumbnail--${layer.kind}`} aria-hidden="true"><Icon name={layer.kind === "group" ? "layers" : "raster"} /></span>
      <span className="layer-row__name">{layer.name}</span>
    </div>
    {layer.kind === "group" && layer.expanded ? <div role="group">{layer.children.map(child => <LayerRow key={child.id} layer={child} depth={depth + 1} selectedLayerId={selectedLayerId} dispatch={dispatch} />)}</div> : null}
  </>;
}
