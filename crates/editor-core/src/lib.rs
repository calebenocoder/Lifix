//! Platform-independent editor domain. Keep React, DOM, Tauri, and OS APIs out.

pub type DocumentId = String;
pub type LayerId = String;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlendMode { Normal, Multiply, Screen, Overlay }

#[derive(Debug, Clone, PartialEq)]
pub struct Transform { pub x: f32, pub y: f32, pub scale_x: f32, pub scale_y: f32, pub rotation: f32 }

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RasterDataReference { pub storage: RasterStorage, pub source_id: Option<String> }

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RasterStorage { External, Tiled, Lazy, GpuCache }

#[derive(Debug, Clone, PartialEq)]
pub struct LayerProperties { pub id: LayerId, pub name: String, pub visible: bool, pub opacity: f32, pub blend_mode: BlendMode, pub transform: Transform, pub parent_id: Option<LayerId> }

#[derive(Debug, Clone, PartialEq)]
pub enum Layer { Raster { properties: LayerProperties, data: RasterDataReference }, Group { properties: LayerProperties, child_layer_ids: Vec<LayerId> } }

impl Layer { pub fn properties(&self) -> &LayerProperties { match self { Self::Raster { properties, .. } | Self::Group { properties, .. } => properties } } pub fn properties_mut(&mut self) -> &mut LayerProperties { match self { Self::Raster { properties, .. } | Self::Group { properties, .. } => properties } } pub fn is_group(&self) -> bool { matches!(self, Self::Group { .. }) } }

#[derive(Debug, Default, Clone, PartialEq)]
pub struct LayerTree { pub root_layer_ids: Vec<LayerId>, pub layers: std::collections::BTreeMap<LayerId, Layer> }

impl LayerTree {
    pub fn add(&mut self, mut layer: Layer, parent_id: Option<LayerId>) -> Result<(), &'static str> { let id = layer.properties().id.clone(); if self.layers.contains_key(&id) { return Err("duplicate layer id"); } if let Some(parent) = parent_id.as_ref() { if !self.layers.get(parent).is_some_and(Layer::is_group) { return Err("parent must be a group"); } } layer.properties_mut().parent_id = parent_id.clone(); self.layers.insert(id.clone(), layer); self.children_mut(parent_id.as_ref()).unwrap().push(id); Ok(()) }
    pub fn find(&self, id: &LayerId) -> Option<&Layer> { self.layers.get(id) }
    pub fn find_parent(&self, id: &LayerId) -> Option<&LayerId> { self.find(id).and_then(|layer| layer.properties().parent_id.as_ref()) }
    pub fn remove(&mut self, id: &LayerId) -> Option<Layer> { let layer = self.layers.remove(id)?; let parent = layer.properties().parent_id.clone(); self.children_mut(parent.as_ref()).map(|children| children.retain(|child| child != id)); if let Layer::Group { child_layer_ids, .. } = &layer { for child in child_layer_ids.clone() { self.remove(&child); } } Some(layer) }
    pub fn reorder(&mut self, id: &LayerId, index: usize) -> Result<(), &'static str> { let parent = self.find_parent(id).cloned(); let children = self.children_mut(parent.as_ref()).ok_or("unknown layer")?; let old = children.iter().position(|child| child == id).ok_or("unknown layer")?; let value = children.remove(old); children.insert(index.min(children.len()), value); Ok(()) }
    fn children_mut(&mut self, parent: Option<&LayerId>) -> Option<&mut Vec<LayerId>> { match parent { None => Some(&mut self.root_layer_ids), Some(id) => match self.layers.get_mut(id) { Some(Layer::Group { child_layer_ids, .. }) => Some(child_layer_ids), _ => None } } }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Document {
    pub id: DocumentId,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub resolution_ppi: (f32, f32),
    pub color: ColorInfo,
    pub layer_tree: LayerTree,
    pub metadata: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ColorInfo { pub profile: String, pub bit_depth: u8, pub alpha: bool }

pub trait Command<State> {
    fn label(&self) -> &str;
    fn execute(&self, state: State) -> State;
    fn undo(&self, state: State) -> State;
}
