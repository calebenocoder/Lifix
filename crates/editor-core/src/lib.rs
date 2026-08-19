//! Platform-independent editor domain. Keep React, DOM, Tauri, and OS APIs out.

pub type DocumentId = String;
pub type LayerId = String;

#[derive(Debug, Clone, PartialEq)]
pub struct Document {
    pub id: DocumentId,
    pub name: String,
    pub root_layer_ids: Vec<LayerId>,
}

pub trait Command<State> {
    fn label(&self) -> &str;
    fn execute(&self, state: State) -> State;
    fn undo(&self, state: State) -> State;
}

