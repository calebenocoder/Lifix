import { PanelChrome, ScrollArea } from "../primitives";
import type { EditorSessionAction, EditorSessionSnapshot } from "../editor";
import { LayerRow } from "./LayerRow";

export function LayersPanel({ editor, dispatch }: { readonly editor: EditorSessionSnapshot; readonly dispatch: (action: EditorSessionAction) => void }) {
  return <PanelChrome title="Layers" icon="layers"><ScrollArea className="layers-panel"><div role="tree" aria-label="Document layers">{editor.document.layers.map(layer => <LayerRow key={layer.id} layer={layer} depth={0} selectedLayerId={editor.selectedLayerId} dispatch={dispatch} />)}</div></ScrollArea></PanelChrome>;
}
