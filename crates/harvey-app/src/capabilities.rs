//! Checker for `capabilities/*.json` (§6.10, §10, the WS3 convention).
//!
//! Rules:
//! 1. Each file has exactly one window label, no glob, and no `remote` or `webviews` key. No two files share a label.
//! 2. Permissions are `core:*` or `allow-<command>`. Anything else (plugin permissions, `deny-*`, unknown) fails.
//! 3. Every command is granted in exactly one file, and every `allow-*` names a known command.
//! 4. A `<window>__<base>` wrapper is granted only in the file of window `<window>`, and `<base>` is a command.
//!
//! Window labels use `-`, command prefixes `_` (`tray-popover` ↔ `tray_popover__…`).

use std::collections::BTreeMap;
use std::fmt;

use serde::Deserialize;

/// The part of a Tauri capability file the checker reads. Other keys are ignored.
#[derive(Debug, Clone, Deserialize)]
pub struct Capability {
    pub identifier: String,
    #[serde(default)]
    pub windows: Vec<String>,
    #[serde(default)]
    pub permissions: Vec<Permission>,
    /// Only its presence matters: remote URLs must never get IPC access.
    #[serde(default)]
    pub remote: Option<serde::de::IgnoredAny>,
    /// Webview labels (Tauri grants the capability to these too, globs included). Must be empty: grants go by window.
    #[serde(default)]
    pub webviews: Vec<String>,
}

/// A permission entry: a plain identifier, or the object form `{ "identifier": …, "allow": … }`.
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum Permission {
    Identifier(String),
    Object { identifier: String },
}

impl Permission {
    pub fn identifier(&self) -> &str {
        match self {
            Self::Identifier(identifier) | Self::Object { identifier } => identifier,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Violation {
    /// Rule 1: `windows` must hold exactly one label.
    WindowCount { file: String, count: usize },
    /// Rule 1: no glob in the window label.
    WindowGlob { file: String, label: String },
    /// Rule 1: no `remote` key.
    Remote { file: String },
    /// Rule 1: no `webviews` key.
    Webviews { file: String },
    /// Rule 1: two files for one window.
    SharedLabel { label: String, files: [String; 2] },
    /// Rule 2: neither `core:*` nor `allow-<command>`.
    ForeignPermission { file: String, permission: String },
    /// Rule 3: `allow-<command>` for a command that does not exist.
    UnknownCommand { file: String, command: String },
    /// Rule 3: a command no file grants.
    NotGranted { command: String },
    /// Rule 3: a command granted in more than one place.
    GrantedTwice { command: String, files: [String; 2] },
    /// Rule 4: a wrapper granted to another window than its prefix.
    WrapperInWrongWindow { file: String, command: String },
    /// Rule 4: a wrapper whose base command does not exist.
    OrphanWrapper { command: String, base: String },
}

impl fmt::Display for Violation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::WindowCount { file, count } => write!(
                f,
                "{file}: `windows` has {count} labels, expected exactly 1"
            ),
            Self::WindowGlob { file, label } => {
                write!(f, "{file}: window label `{label}` is a glob")
            }
            Self::Remote { file } => write!(f, "{file}: `remote` is not allowed"),
            Self::Webviews { file } => write!(f, "{file}: `webviews` is not allowed"),
            Self::SharedLabel {
                label,
                files: [a, b],
            } => write!(f, "window `{label}` has two files: {a} and {b}"),
            Self::ForeignPermission { file, permission } => {
                write!(
                    f,
                    "{file}: `{permission}` is neither `core:*` nor `allow-<command>`"
                )
            }
            Self::UnknownCommand { file, command } => {
                write!(f, "{file}: `{command}` is not in COMMANDS")
            }
            Self::NotGranted { command } => {
                write!(f, "`{command}` is granted in no capability file")
            }
            Self::GrantedTwice {
                command,
                files: [a, b],
            } => write!(f, "`{command}` is granted in {a} and {b}"),
            Self::WrapperInWrongWindow { file, command } => {
                write!(
                    f,
                    "{file}: wrapper `{command}` belongs to another window's file"
                )
            }
            Self::OrphanWrapper { command, base } => {
                write!(f, "wrapper `{command}`: base `{base}` is not in COMMANDS")
            }
        }
    }
}

/// `allow-foo-bar` → `foo_bar`, `allow-settings--app-info` → `settings__app_info`.
fn command_of(permission: &str) -> Option<String> {
    permission
        .strip_prefix("allow-")
        .map(|kebab| kebab.replace('-', "_"))
}

/// `settings__app_info` → `("settings", "app_info")`.
fn split_wrapper(command: &str) -> Option<(&str, &str)> {
    command.split_once("__")
}

fn is_glob(label: &str) -> bool {
    label.contains(['*', '?', '[', ']', '{', '}'])
}

pub fn check_capabilities(files: &[Capability], commands: &[&str]) -> Result<(), Vec<Violation>> {
    let mut violations = Vec::new();
    let mut labels: BTreeMap<&str, &str> = BTreeMap::new();
    let mut grants: BTreeMap<String, &str> = BTreeMap::new();

    for file in files {
        let name = file.identifier.as_str();
        if file.remote.is_some() {
            violations.push(Violation::Remote { file: name.into() });
        }
        if !file.webviews.is_empty() {
            violations.push(Violation::Webviews { file: name.into() });
        }
        let label = match file.windows.as_slice() {
            [label] => Some(label.as_str()),
            other => {
                violations.push(Violation::WindowCount {
                    file: name.into(),
                    count: other.len(),
                });
                None
            }
        };
        if let Some(label) = label {
            if is_glob(label) {
                violations.push(Violation::WindowGlob {
                    file: name.into(),
                    label: label.into(),
                });
            }
            if let Some(previous) = labels.insert(label, name) {
                violations.push(Violation::SharedLabel {
                    label: label.into(),
                    files: [previous.into(), name.into()],
                });
            }
        }

        for permission in &file.permissions {
            let permission = permission.identifier();
            if permission.starts_with("core:") {
                continue;
            }
            let Some(command) = command_of(permission) else {
                violations.push(Violation::ForeignPermission {
                    file: name.into(),
                    permission: permission.into(),
                });
                continue;
            };
            if !commands.contains(&command.as_str()) {
                violations.push(Violation::UnknownCommand {
                    file: name.into(),
                    command,
                });
                continue;
            }
            if let Some((window, _)) = split_wrapper(&command)
                && label.map(|l| l.replace('-', "_")).as_deref() != Some(window)
            {
                violations.push(Violation::WrapperInWrongWindow {
                    file: name.into(),
                    command: command.clone(),
                });
            }
            if let Some(previous) = grants.insert(command.clone(), name) {
                violations.push(Violation::GrantedTwice {
                    command,
                    files: [previous.into(), name.into()],
                });
            }
        }
    }

    for &command in commands {
        if !grants.contains_key(command) {
            violations.push(Violation::NotGranted {
                command: command.into(),
            });
        }
        if let Some((_, base)) = split_wrapper(command)
            && !commands.contains(&base)
        {
            violations.push(Violation::OrphanWrapper {
                command: command.into(),
                base: base.into(),
            });
        }
    }

    if violations.is_empty() {
        Ok(())
    } else {
        Err(violations)
    }
}

#[cfg(test)]
mod tests {
    use serde_json::json;

    use super::{Capability, Violation, check_capabilities};
    use crate::commands::COMMANDS;

    fn cap(value: serde_json::Value) -> Capability {
        serde_json::from_value(value).expect("valid capability")
    }

    fn main_file(permissions: &serde_json::Value) -> Capability {
        cap(json!({ "identifier": "main", "windows": ["main"], "permissions": permissions }))
    }

    fn settings_file(permissions: &serde_json::Value) -> Capability {
        cap(
            json!({ "identifier": "settings", "windows": ["settings"], "permissions": permissions }),
        )
    }

    fn violations(files: &[Capability], commands: &[&str]) -> Vec<Violation> {
        check_capabilities(files, commands).expect_err("expected violations")
    }

    #[test]
    fn capabilities_are_exclusive() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("capabilities");
        let mut files = Vec::new();
        for entry in std::fs::read_dir(&dir).expect("read capabilities/") {
            let path = entry.expect("dir entry").path();
            // Tauri loads `capabilities/**/*` (json, toml, json5): anything the checker cannot read must not exist.
            assert!(
                path.is_file() && path.extension().is_some_and(|ext| ext == "json"),
                "{}: capability files must be top-level `.json` files",
                path.display()
            );
            let text = std::fs::read_to_string(&path).expect("read capability");
            let file: Capability =
                serde_json::from_str(&text).unwrap_or_else(|e| panic!("{}: {e}", path.display()));
            files.push(file);
        }
        assert!(!files.is_empty(), "no capability file in {}", dir.display());
        if let Err(violations) = check_capabilities(&files, COMMANDS) {
            let lines: Vec<String> = violations.iter().map(ToString::to_string).collect();
            panic!("capability violations:\n{}", lines.join("\n"));
        }
    }

    #[test]
    fn accepts_a_valid_set_with_a_wrapper() {
        let files = [
            main_file(&json!(["core:event:allow-listen", "allow-app-info"])),
            settings_file(&json!([{ "identifier": "allow-settings--app-info" }])),
        ];
        assert_eq!(
            check_capabilities(&files, &["app_info", "settings__app_info"]),
            Ok(())
        );
    }

    #[test]
    fn maps_hyphenated_labels_to_underscored_prefixes() {
        let files = [
            main_file(&json!(["allow-mcp-approval-decide"])),
            cap(json!({
                "identifier": "tray-popover",
                "windows": ["tray-popover"],
                "permissions": ["allow-tray-popover--mcp-approval-decide"],
            })),
        ];
        let commands = ["mcp_approval_decide", "tray_popover__mcp_approval_decide"];
        assert_eq!(check_capabilities(&files, &commands), Ok(()));
    }

    #[test]
    fn rejects_a_missing_command() {
        let files = [main_file(&json!(["core:event:allow-listen"]))];
        assert_eq!(
            violations(&files, &["app_info"]),
            [Violation::NotGranted {
                command: "app_info".into()
            }]
        );
    }

    #[test]
    fn rejects_a_duplicated_command() {
        let files = [
            main_file(&json!(["allow-app-info"])),
            settings_file(&json!(["allow-app-info"])),
        ];
        assert_eq!(
            violations(&files, &["app_info"]),
            [Violation::GrantedTwice {
                command: "app_info".into(),
                files: ["main".into(), "settings".into()],
            }]
        );
    }

    #[test]
    fn rejects_an_unknown_command() {
        let files = [main_file(&json!(["allow-app-info", "allow-ghost"]))];
        assert_eq!(
            violations(&files, &["app_info"]),
            [Violation::UnknownCommand {
                file: "main".into(),
                command: "ghost".into(),
            }]
        );
    }

    #[test]
    fn rejects_a_wrapper_in_the_wrong_window() {
        let files = [main_file(&json!([
            "allow-app-info",
            "allow-settings--app-info"
        ]))];
        assert_eq!(
            violations(&files, &["app_info", "settings__app_info"]),
            [Violation::WrapperInWrongWindow {
                file: "main".into(),
                command: "settings__app_info".into(),
            }]
        );
    }

    #[test]
    fn rejects_an_orphan_wrapper() {
        let files = [settings_file(&json!(["allow-settings--app-info"]))];
        assert_eq!(
            violations(&files, &["settings__app_info"]),
            [Violation::OrphanWrapper {
                command: "settings__app_info".into(),
                base: "app_info".into(),
            }]
        );
    }

    #[test]
    fn rejects_plugin_and_deny_permissions() {
        let files = [main_file(&json!([
            "allow-app-info",
            "shell:allow-open",
            { "identifier": "fs:allow-read", "allow": [{ "path": "$HOME/**" }] },
            "deny-app-info",
        ]))];
        let found = violations(&files, &["app_info"]);
        let permissions: Vec<&str> = found
            .iter()
            .map(|v| match v {
                Violation::ForeignPermission { permission, .. } => permission.as_str(),
                other => panic!("unexpected {other}"),
            })
            .collect();
        assert_eq!(
            permissions,
            ["shell:allow-open", "fs:allow-read", "deny-app-info"]
        );
    }

    #[test]
    fn rejects_a_shared_label() {
        let files = [
            main_file(&json!(["allow-app-info"])),
            cap(json!({ "identifier": "main-extra", "windows": ["main"], "permissions": [] })),
        ];
        assert_eq!(
            violations(&files, &["app_info"]),
            [Violation::SharedLabel {
                label: "main".into(),
                files: ["main".into(), "main-extra".into()],
            }]
        );
    }

    #[test]
    fn rejects_remote() {
        let files = [cap(json!({
            "identifier": "main",
            "windows": ["main"],
            "permissions": ["allow-app-info"],
            "remote": { "urls": ["https://*.example.com"] },
        }))];
        assert_eq!(
            violations(&files, &["app_info"]),
            [Violation::Remote {
                file: "main".into()
            }]
        );
    }

    #[test]
    fn rejects_webviews() {
        let files = [cap(json!({
            "identifier": "main",
            "windows": ["main"],
            "webviews": ["*"],
            "permissions": ["allow-app-info"],
        }))];
        assert_eq!(
            violations(&files, &["app_info"]),
            [Violation::Webviews {
                file: "main".into()
            }]
        );
    }

    #[test]
    fn rejects_window_globs_and_counts() {
        let files = [
            cap(
                json!({ "identifier": "all", "windows": ["*"], "permissions": ["allow-app-info"] }),
            ),
            cap(json!({ "identifier": "two", "windows": ["a", "b"], "permissions": [] })),
            cap(json!({ "identifier": "none", "permissions": [] })),
        ];
        assert_eq!(
            violations(&files, &["app_info"]),
            [
                Violation::WindowGlob {
                    file: "all".into(),
                    label: "*".into()
                },
                Violation::WindowCount {
                    file: "two".into(),
                    count: 2
                },
                Violation::WindowCount {
                    file: "none".into(),
                    count: 0
                },
            ]
        );
    }

    #[test]
    fn violations_explain_themselves() {
        let message = Violation::GrantedTwice {
            command: "app_info".into(),
            files: ["main".into(), "settings".into()],
        }
        .to_string();
        assert_eq!(message, "`app_info` is granted in main and settings");
    }
}
