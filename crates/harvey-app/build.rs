// `COMMANDS` is the single list of app commands (src/commands/names.rs). Declaring them in the app manifest makes
// every command require a permission, so a command no capability grants is rejected at runtime (§6.10).
include!("src/commands/names.rs");

fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("failed to run tauri-build");
}
