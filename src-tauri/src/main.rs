// Desktop shell only: editor domain logic belongs in editor-core.
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running Image Editor desktop application");
}

