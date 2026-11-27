//! swift-rs bridge for the app (WidgetCenter, SMAppService).
//!
//! Only `harvey-app` may depend on this crate.
//!
//! Allowed workspace dependencies: none.

#![allow(unsafe_code)] // reason: swift-rs calls cross the Swift/Rust FFI boundary.

// Fake implementation, also used by tests.
#[cfg(any(not(target_os = "macos"), feature = "fake-platform"))]
mod fake;
// Real implementation; gated by `target_os`, never by the feature alone.
#[cfg(all(target_os = "macos", not(feature = "fake-platform")))]
mod macos;

#[cfg(test)]
mod tests {
    #[test]
    fn skeleton_compiles() {}
}
