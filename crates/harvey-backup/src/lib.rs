//! Snapshot, encryption, retention and restore.
//!
//! Owns `KeyStore` (Keychain on macOS, plus a fake).
//!
//! Allowed workspace dependencies: `harvey-db`.

// Fake implementation, also used by tests.
#[cfg(any(not(target_os = "macos"), feature = "fake-platform"))]
mod fake;
// Real implementation; gated by `target_os`, never by the feature alone.
#[cfg(all(target_os = "macos", not(feature = "fake-platform")))]
mod keychain;

#[cfg(test)]
mod tests {
    #[test]
    fn skeleton_compiles() {}
}
