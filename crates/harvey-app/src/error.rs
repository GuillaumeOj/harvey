//! The single error type every command returns (§10, NFR-02).
//!
//! Payload fields are identifiers (`"siren"`, `"validation.siren.invalid"`, `"calendar"`), never user values,
//! personal-data ids, paths or SQL. They are [`Ident`]s, which only this module can build, from `&'static str`
//! constructors, so a runtime value cannot reach a payload. `Display` and `Debug` print the same identifiers and
//! nothing else.

use std::fmt;

use serde::Serialize;

/// A payload identifier. The field is private and there is no public constructor, so only the `&'static str`
/// constructors of [`AppError`] can make one. It serializes and exports as a plain string.
#[derive(Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(transparent)]
#[specta(inline)]
pub struct Ident(&'static str);

impl fmt::Display for Ident {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}

impl fmt::Debug for Ident {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self, f)
    }
}

/// Every command error. Tagged on `kind`; `field`, `key` and `resource` are identifiers, never user values.
#[derive(Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum AppError {
    NotFound,
    Validation { field: Ident, key: Ident },
    Conflict { key: Ident },
    PermissionDenied { resource: Ident },
    CalendarUnavailable,
    Maintenance,
    SchemaMismatch,
    Storage,
    Internal,
}

impl AppError {
    /// A field failed validation. `field` names the field, `key` the i18n key of the reason.
    pub fn validation(field: &'static str, key: &'static str) -> Self {
        Self::Validation {
            field: Ident(field),
            key: Ident(key),
        }
    }

    /// The entity changed since the UI read it. `key` is the i18n key of the reason.
    pub fn conflict(key: &'static str) -> Self {
        Self::Conflict { key: Ident(key) }
    }

    /// The OS or the user denied access to `resource` (e.g. `"calendar"`).
    pub fn permission_denied(resource: &'static str) -> Self {
        Self::PermissionDenied {
            resource: Ident(resource),
        }
    }

    /// The i18n key of the user-facing message: `error.<kind>`, the same keys as `ui/src/lib/errors.ts`.
    pub fn message_key(&self) -> &'static str {
        match self {
            Self::NotFound => "error.not_found",
            Self::Validation { .. } => "error.validation",
            Self::Conflict { .. } => "error.conflict",
            Self::PermissionDenied { .. } => "error.permission_denied",
            Self::CalendarUnavailable => "error.calendar_unavailable",
            Self::Maintenance => "error.maintenance",
            Self::SchemaMismatch => "error.schema_mismatch",
            Self::Storage => "error.storage",
            Self::Internal => "error.internal",
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotFound => f.write_str("NotFound"),
            Self::Validation { field, key } => write!(f, "Validation(field={field}, key={key})"),
            Self::Conflict { key } => write!(f, "Conflict(key={key})"),
            Self::PermissionDenied { resource } => {
                write!(f, "PermissionDenied(resource={resource})")
            }
            Self::CalendarUnavailable => f.write_str("CalendarUnavailable"),
            Self::Maintenance => f.write_str("Maintenance"),
            Self::SchemaMismatch => f.write_str("SchemaMismatch"),
            Self::Storage => f.write_str("Storage"),
            Self::Internal => f.write_str("Internal"),
        }
    }
}

/// Same output as `Display`: a derived `Debug` would be just as safe today, but writing it by hand keeps the rule
/// explicit when a variant gains a field.
impl fmt::Debug for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self, f)
    }
}

impl std::error::Error for AppError {}

#[cfg(test)]
mod tests {
    use serde_json::{Value, json};

    use super::AppError;

    /// Every variant, with its JSON payload, message key and `Display` output.
    fn cases() -> Vec<(AppError, Value, &'static str, &'static str)> {
        vec![
            (
                AppError::NotFound,
                json!({ "kind": "not_found" }),
                "error.not_found",
                "NotFound",
            ),
            (
                AppError::validation("siren", "validation.siren.invalid"),
                json!({ "kind": "validation", "field": "siren", "key": "validation.siren.invalid" }),
                "error.validation",
                "Validation(field=siren, key=validation.siren.invalid)",
            ),
            (
                AppError::conflict("conflict.invoice.changed"),
                json!({ "kind": "conflict", "key": "conflict.invoice.changed" }),
                "error.conflict",
                "Conflict(key=conflict.invoice.changed)",
            ),
            (
                AppError::permission_denied("calendar"),
                json!({ "kind": "permission_denied", "resource": "calendar" }),
                "error.permission_denied",
                "PermissionDenied(resource=calendar)",
            ),
            (
                AppError::CalendarUnavailable,
                json!({ "kind": "calendar_unavailable" }),
                "error.calendar_unavailable",
                "CalendarUnavailable",
            ),
            (
                AppError::Maintenance,
                json!({ "kind": "maintenance" }),
                "error.maintenance",
                "Maintenance",
            ),
            (
                AppError::SchemaMismatch,
                json!({ "kind": "schema_mismatch" }),
                "error.schema_mismatch",
                "SchemaMismatch",
            ),
            (
                AppError::Storage,
                json!({ "kind": "storage" }),
                "error.storage",
                "Storage",
            ),
            (
                AppError::Internal,
                json!({ "kind": "internal" }),
                "error.internal",
                "Internal",
            ),
        ]
    }

    #[test]
    fn covers_the_nine_variants() {
        assert_eq!(cases().len(), 9);
    }

    #[test]
    fn serializes_with_kind_tag() {
        for (error, expected, _, _) in cases() {
            assert_eq!(serde_json::to_value(&error).unwrap(), expected, "{error}");
        }
    }

    #[test]
    fn message_key_is_error_dot_kind() {
        for (error, payload, key, _) in cases() {
            assert_eq!(error.message_key(), key);
            assert_eq!(key, format!("error.{}", payload["kind"].as_str().unwrap()));
        }
    }

    #[test]
    fn display_and_debug_print_only_identifiers() {
        for (error, _, _, display) in cases() {
            assert_eq!(error.to_string(), display);
            assert_eq!(format!("{error:?}"), display);
        }
    }

    #[test]
    fn is_a_std_error() {
        let error: Box<dyn std::error::Error> = Box::new(AppError::Internal);
        assert_eq!(error.to_string(), "Internal");
    }
}
