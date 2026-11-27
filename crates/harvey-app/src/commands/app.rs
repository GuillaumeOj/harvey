//! `app_info`: the IPC round-trip sample. No paths, no user data.

use serde::Serialize;
use tauri::AppHandle;

use crate::error::AppError;

/// Which data the app touches: `Dev` for the `.dev` bundle identifier, `Release` otherwise. It names the data set,
/// not the cargo profile (a release build of the dev bundle is still `Dev`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum BuildChannel {
    Dev,
    Release,
}

impl BuildChannel {
    pub fn from_identifier(identifier: &str) -> Self {
        if identifier.ends_with(".dev") {
            Self::Dev
        } else {
            Self::Release
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
pub struct AppInfo {
    pub version: String,
    pub build_channel: BuildChannel,
}

impl AppInfo {
    pub fn new(version: String, identifier: &str) -> Self {
        Self {
            version,
            build_channel: BuildChannel::from_identifier(identifier),
        }
    }
}

#[tauri::command]
#[specta::specta]
#[allow(
    clippy::needless_pass_by_value,
    reason = "Tauri passes injected arguments by value"
)]
pub fn app_info(app: AppHandle) -> Result<AppInfo, AppError> {
    Ok(AppInfo::new(
        app.package_info().version.to_string(),
        &app.config().identifier,
    ))
}

#[cfg(test)]
mod tests {
    use super::{AppInfo, BuildChannel};

    #[test]
    fn app_info_carries_version_and_channel() {
        let info = AppInfo::new("0.1.0".into(), "com.harvey.dev");
        assert_eq!(
            serde_json::to_value(info).unwrap(),
            serde_json::json!({ "version": "0.1.0", "build_channel": "dev" })
        );
    }

    #[test]
    fn channel_follows_the_identifier_suffix() {
        assert_eq!(
            BuildChannel::from_identifier("com.harvey.dev"),
            BuildChannel::Dev
        );
        assert_eq!(
            BuildChannel::from_identifier("com.harvey"),
            BuildChannel::Release
        );
        assert_eq!(
            BuildChannel::from_identifier("com.harvey.devtools"),
            BuildChannel::Release
        );
        assert_eq!(BuildChannel::from_identifier("dev"), BuildChannel::Release);
    }

    #[test]
    fn channel_serializes_snake_case() {
        assert_eq!(serde_json::to_value(BuildChannel::Dev).unwrap(), "dev");
        assert_eq!(
            serde_json::to_value(BuildChannel::Release).unwrap(),
            "release"
        );
    }
}
