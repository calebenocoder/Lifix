/** Commands define the future undoable state transition boundary. */
export interface EditorCommand<State> { readonly label: string; execute(state: State): State; undo(state: State): State; }
export interface History<State> { readonly canUndo: boolean; readonly canRedo: boolean; execute(command: EditorCommand<State>): void; undo(): void; redo(): void; }
export interface Tool { readonly id: string; readonly label: string; }

