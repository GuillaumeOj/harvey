# Architecture (Rust workspace)

See `SPEC.md` §6.3, §6.4, §12.1 and §12.2 for the rationale.

## Crates

| Crate | Kind | Responsibility |
|---|---|---|
| `harvey-db` | lib | Connection factory, migrations, SQL repositories, ids and clock primitives (`Id`, `Clock`). |
| `harvey-core` | lib | Domain model, services, business rules. No Tauri, no EventKit, no direct filesystem. Owns `FileResolver` and the `Repository` unit-of-work trait. |
| `harvey-calendar` | lib | `CalendarProvider` trait, EventKit actor (macOS) and a fake. |
| `harvey-backup` | lib | Snapshot, encryption, retention, restore. Owns `KeyStore` (Keychain on macOS, and a fake). |
| `harvey-ffi` | lib + staticlib | UniFFI surface for the widget (timer only). |
| `harvey-swift-bridge` | lib | swift-rs bridge for the app (WidgetCenter, SMAppService). Only `harvey-app` may depend on it. |
| `harvey-mcp` | bin | MCP server over stdio. `main` writes nothing but protocol messages to stdout. |
| `harvey-bench` | bin | Dataset seeder and performance harness. |

`harvey-app` (Tauri) is added by a later issue.

## Dependency direction

```
harvey-mcp ─┐
harvey-ffi ─┼─> harvey-core ─┬─> harvey-calendar ─> harvey-db
harvey-bench┘                ├─> harvey-backup   ─> harvey-db
                             └─> harvey-db
harvey-swift-bridge   (no workspace deps; used by harvey-app only)
```

Dependencies are declared once in `[workspace.dependencies]` and used with `{ workspace = true }`.
Traits live in the crate that owns the capability (`CalendarProvider` in calendar, `KeyStore` in backup,
`FileResolver` and `Repository` in core). No third-party dependencies yet.

## `fake-platform` convention

Every crate declares a `fake-platform` feature, so `cargo … --workspace --features fake-platform` works
everywhere. Crates with macOS-only code (`harvey-calendar`, `harvey-backup`, `harvey-swift-bridge`) use:

```rust
#[cfg(all(target_os = "macos", not(feature = "fake-platform")))]
mod eventkit; // real implementation
#[cfg(any(not(target_os = "macos"), feature = "fake-platform"))]
mod fake; // fake implementation
```

macOS code is gated by `target_os`, never by the feature alone, so `--all-features` on Linux pulls
none of it. Other crates forward the feature to their workspace dependencies. Linux CI builds with the fakes.

`unsafe_code` is `deny` workspace-wide; FFI crates opt out with a crate-level `#![allow(unsafe_code)]` and a reason.

## Commands

Always pass `--locked`.

```sh
cargo build  --workspace --locked [--features fake-platform]
cargo test   --workspace --locked [--features fake-platform]
cargo clippy --workspace --all-targets [--all-features] --locked -- -D warnings
scripts/fmt.sh [--check]   # rustfmt from the nightly pinned in rustfmt-nightly.toolchain
```

The stable toolchain is pinned in `rust-toolchain.toml`; the nightly is used only by rustfmt.
