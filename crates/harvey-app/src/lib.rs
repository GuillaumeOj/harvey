//! `harvey-app`: the Tauri 2 shell. Windows, typed commands, capabilities and the §6.10 hardening. No business
//! logic: commands are thin adapters over `harvey-core` (§6.4). See `docs/architecture.md` › IPC.

pub mod capabilities;
pub mod commands;
pub mod error;
pub mod navigation;

pub use commands::BuildChannel;
pub use error::AppError;
use tauri::webview::NewWindowResponse;
use tauri::{App, WebviewWindowBuilder};

/// Label of the main window (`tauri.conf.json`, `capabilities/main.json`).
pub const MAIN_WINDOW: &str = "main";

/// A debug or dev build (`debug_assertions`, or Tauri's `is_dev()`: `tauri dev`, including `tauri dev --release`) must
/// run with the dev identifier (`*.dev`), so it never touches production data. Bundled release builds may use either
/// identifier (`bun run tauri build --config crates/harvey-app/tauri.dev.conf.json` is allowed).
pub fn check_dev_identifier(identifier: &str, debug: bool) -> Result<(), String> {
    if debug && BuildChannel::from_identifier(identifier) != BuildChannel::Dev {
        return Err(format!(
            "debug build with identifier `{identifier}`: debug builds must use the dev identifier so they never \
             touch production data. Start the app with `bun run dev`."
        ));
    }
    Ok(())
}

pub fn run() {
    let context = tauri::generate_context!();
    if let Err(message) = check_dev_identifier(
        &context.config().identifier,
        cfg!(debug_assertions) || tauri::is_dev(),
    ) {
        eprintln!("harvey: {message}");
        std::process::exit(1);
    }

    let specta = commands::specta_builder();
    tauri::Builder::default()
        .invoke_handler(specta.invoke_handler())
        .setup(move |app| {
            specta.mount_events(app);
            create_main_window(app)?;
            Ok(())
        })
        .run(context)
        .expect("error while running Harvey");
}

/// Builds the main window from its config entry (`create: false`), so the config stays the single source of its
/// attributes and the navigation handlers can be attached.
fn create_main_window(app: &App) -> tauri::Result<()> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == MAIN_WINDOW)
        .ok_or_else(|| tauri::Error::WindowNotFound)?
        .clone();
    let dev_url = navigation::allowed_dev_url(app.config().build.dev_url.as_ref());

    WebviewWindowBuilder::from_config(app.handle(), &config)?
        .on_navigation(move |url| navigation::is_app_url(url, dev_url.as_ref()))
        .on_new_window(|_, _| NewWindowResponse::Deny)
        .build()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::check_dev_identifier;

    #[test]
    fn debug_builds_need_the_dev_identifier() {
        assert_eq!(check_dev_identifier("com.harvey.dev", true), Ok(()));
        assert!(
            check_dev_identifier("com.harvey", true)
                .unwrap_err()
                .contains("bun run dev")
        );
        assert_eq!(check_dev_identifier("com.harvey", false), Ok(()));
        assert_eq!(check_dev_identifier("com.harvey.dev", false), Ok(()));
    }
}
