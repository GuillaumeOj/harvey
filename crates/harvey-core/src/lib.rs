//! Domain model, services and business rules.
//!
//! No Tauri, no EventKit, no direct filesystem access. Owns the `FileResolver`
//! and the `Repository` unit-of-work traits.
//!
//! Allowed workspace dependencies: `harvey-db`, `harvey-calendar`, `harvey-backup`.

#[cfg(test)]
mod tests {
    #[test]
    fn skeleton_compiles() {}
}
