//! The WS3 convention: per-window wrapper commands.
//!
//! Every command is granted in exactly one capability file. When another window needs the same operation, it gets a
//! wrapper named `<window>__<base>` (double underscore), granted only in that window's capability. The wrapper has no
//! logic: it calls the base command function, so both share one handler and one signature.
//!
//! Window ident ↔ label: `_` in the ident is `-` in the label (`tray_popover` ↔ `tray-popover`).
//!
//! A declarative macro cannot read the base signature, so it is written once in the call:
//!
//! ```ignore
//! window_alias!(settings, app_info(app: AppHandle) -> Result<AppInfo, AppError>);
//! window_alias!(settings, async calendar_access_status(state: State<'_, Core>) -> Result<Status, AppError>);
//! ```
//!
//! The wrapper passes its arguments to the base function, so a signature that does not match the base fails to
//! compile. Add the wrapper to `collect_commands!` and to `COMMANDS` like any other command.

#[cfg_attr(
    not(test),
    allow(unused_macros, reason = "no production wrapper ships yet")
)]
/// Generates `<window>__<base>`, a `#[tauri::command]` + `#[specta::specta]` wrapper that calls `<base>`.
macro_rules! window_alias {
    ($window:ident, async $base:ident ( $($arg:ident : $ty:ty),* $(,)? ) -> $ret:ty) => {
        ::paste::paste! {
            #[doc = concat!("`", stringify!($base), "` for the `", stringify!($window), "` window (WS3 wrapper).")]
            #[allow(non_snake_case, reason = "WS3 wrapper names use a double underscore")]
            #[tauri::command]
            #[specta::specta]
            pub async fn [<$window __ $base>]($($arg: $ty),*) -> $ret {
                $base($($arg),*).await
            }
        }
    };
    ($window:ident, $base:ident ( $($arg:ident : $ty:ty),* $(,)? ) -> $ret:ty) => {
        ::paste::paste! {
            #[doc = concat!("`", stringify!($base), "` for the `", stringify!($window), "` window (WS3 wrapper).")]
            #[allow(non_snake_case, reason = "WS3 wrapper names use a double underscore")]
            #[tauri::command]
            #[specta::specta]
            pub fn [<$window __ $base>]($($arg: $ty),*) -> $ret {
                $base($($arg),*)
            }
        }
    };
}

#[allow(
    unused_imports,
    reason = "for command modules; no production wrapper ships yet"
)]
pub(crate) use window_alias;

#[cfg(test)]
mod tests {
    use tauri::AppHandle;
    use tauri_specta::collect_commands;

    use crate::commands::app::app_info;
    use crate::commands::{AppInfo, collected, render_bindings};
    use crate::error::AppError;

    window_alias!(
        settings,
        app_info(app: AppHandle) -> Result<AppInfo, AppError>
    );

    async fn echo(value: u32) -> Result<u32, AppError> {
        Ok(value)
    }
    window_alias!(settings, async echo(value: u32) -> Result<u32, AppError>);

    fn builder() -> tauri_specta::Builder<tauri::Wry> {
        crate::commands::configure(tauri_specta::Builder::new().commands(collect_commands![
            crate::commands::app::app_info,
            settings__app_info
        ]))
    }

    #[test]
    fn wrapper_has_the_base_signature() {
        let functions = collected(&builder());
        let find = |name: &str| {
            functions
                .iter()
                .find(|f| f.name() == name)
                .unwrap_or_else(|| panic!("{name} is not registered"))
        };
        let (base, wrapper) = (find("app_info"), find("settings__app_info"));
        assert_eq!(base.args(), wrapper.args());
        assert_eq!(base.result(), wrapper.result());
        assert_eq!(base.asyncness(), wrapper.asyncness());
    }

    #[test]
    fn bindings_expose_both_names() {
        let ts = render_bindings(&builder());
        for (accessor, command) in [
            ("appInfo", "app_info"),
            ("settingsAppInfo", "settings__app_info"),
        ] {
            let line = format!(
                "{accessor}: (options?: InvokeOptions) => typedError<AppInfo, AppError>(__TAURI_INVOKE(\"{command}\""
            );
            assert!(ts.contains(&line), "missing `{line}` in:\n{ts}");
        }
    }

    #[test]
    fn async_wrapper_calls_the_base() {
        let result = tauri::async_runtime::block_on(settings__echo(7));
        assert_eq!(result, Ok(7));
    }
}
