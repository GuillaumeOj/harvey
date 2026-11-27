//! `CalendarProvider` trait, EventKit actor (macOS) and its fake.
//!
//! Allowed workspace dependencies: `harvey-db`.

// The EventKit actor will need FFI calls into Objective-C.
#![allow(unsafe_code)] // reason: EventKit access goes through objc2 bindings.

// Fake implementation, also used by tests.
#[cfg(any(not(target_os = "macos"), feature = "fake-platform"))]
mod fake;
// Real implementation; gated by `target_os`, never by the feature alone.
#[cfg(all(target_os = "macos", not(feature = "fake-platform")))]
mod eventkit;

#[cfg(test)]
mod tests {
    #[test]
    fn skeleton_compiles() {}
}
