/// Every app command, by its Tauri name. `build.rs` includes this file to declare them in the app manifest, and
/// tests check it against the specta builder and the capability files. Add a command here when you add one there.
pub const COMMANDS: &[&str] = &["app_info"];
