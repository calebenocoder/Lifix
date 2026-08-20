import type { FocusEvent, KeyboardEvent } from "react";
import { colorToHex, parseHexColor, type EditorColor, type EditorSessionAction, type EditorSessionSnapshot } from "../editor";
import { PanelChrome, TextInput } from "../primitives";

function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) { if (event.key === "Enter") event.currentTarget.blur(); }

export function ColorPanel({ editor, dispatch }: { readonly editor: EditorSessionSnapshot; readonly dispatch: (action: EditorSessionAction) => void }) {
  const updateChannel = (target: "foreground" | "background", color: EditorColor, channel: keyof EditorColor, event: FocusEvent<HTMLInputElement>) => { const value = Number(event.currentTarget.value); if (!Number.isInteger(value) || value < 0 || value > 255) { event.currentTarget.value = String(color[channel]); return; } dispatch({ type: target === "foreground" ? "set-foreground-color" : "set-background-color", color: { ...color, [channel]: value } }); };
  const hex = colorToHex(editor.foregroundColor);
  const backgroundHex = colorToHex(editor.backgroundColor);
  return <PanelChrome title="Color" icon="color"><div className="color-panel" key={`${hex}-${backgroundHex}`}>
    <div className="color-swatches" aria-label="Foreground and background colors"><label><span>Foreground</span><input type="color" value={hex} aria-label="Foreground color" onChange={event => { const color = parseHexColor(event.currentTarget.value); if (color) dispatch({ type: "set-foreground-color", color }); }} /></label><label><span>Background</span><input type="color" value={backgroundHex} aria-label="Background color" onChange={event => { const color = parseHexColor(event.currentTarget.value); if (color) dispatch({ type: "set-background-color", color }); }} /></label></div>
    <TextInput id="foreground-hex" label="Hex" defaultValue={hex} onKeyDown={blurOnEnter} onBlur={event => { const color = parseHexColor(event.currentTarget.value); if (color) dispatch({ type: "set-foreground-color", color }); else event.currentTarget.value = hex; }} />
    <div className="color-channel-grid">{(["r", "g", "b"] as const).map(channel => <TextInput key={channel} id={`foreground-${channel}`} label={channel.toUpperCase()} type="number" min="0" max="255" step="1" defaultValue={editor.foregroundColor[channel]} onKeyDown={blurOnEnter} onBlur={event => updateChannel("foreground", editor.foregroundColor, channel, event)} />)}</div>
    <p className="panel-note">Editor-session RGB color · sRGB preview</p>
  </div></PanelChrome>;
}
