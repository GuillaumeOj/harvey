# Spec — Cargo workspace, crate skeletons, pinned toolchain, rustfmt config, `fake-platform` (#17)

Parent epic: #3 (Workspace, tooling & CI). Spec refs: SPEC §6.3, §6.4, §12.1, §12.2, NFR-10.
Unblocks: #19, #20, #22, #25, #26, #27, #30, #31.

## Goal
Create the Rust half of the monorepo: a virtual Cargo workspace with eight crate skeletons, a pinned
stable toolchain, a pinned nightly used only by rustfmt, the import/format conventions, workspace
lints, and the `fake-platform` cfg convention so domain crates build and test on Linux CI.

This feature is Rust/tooling only: no UI, no IPC. `ux-brief.md` and `api-contract.md` are not
applicable; only the backend node works on it.

## Decisions (settled by the lead)
| Topic | Decision | Why |
|---|---|---|
| Stable toolchain | `channel = "1.100.0"`; `rust-version = "1.100"` in `[workspace.package]` | Latest stable on 2026-11-27 (released 2026-11-12). Edition 2024 needs ≥ 1.85. |
| Nightly for rustfmt | `rustfmt-nightly.toolchain` = `nightly-2026-11-01` | Recent nightly matching the brief; one line, read by scripts and quoted in `.vscode/settings.json`. If that nightly has no `rustfmt` component, use the closest earlier date that has it and say so in the report. |
| Third-party deps | **None.** `[workspace.dependencies]` holds only the workspace path crates. | Skeletons need none; the `harvey-mcp` stdout test uses `std::process::Command` + `env!("CARGO_BIN_EXE_harvey-mcp")`. Later issues add their own `=x.y.z` pins. |
| Internal deps | Declared once in `[workspace.dependencies]` as `harvey-xxx = { path = "crates/harvey-xxx" }`; members use `{ workspace = true }`. | Single place, no versions on path deps. |
| Dependency graph | Wired for real now (see below), not only documented. | Makes the direction concrete and lets features forward. |
| License | `publish = false`; no `license` field. | Private app; license choice is not part of this issue. |
| Pedantic lints | Listed lints at `"warn"`; CI runs clippy with `-D warnings`. `clippy::all = { level = "deny", priority = -1 }`. | Local dev isn't blocked mid-edit; CI is strict. |
| `unsafe_code` opt-out | `[lints] workspace = true` can't be combined with per-crate overrides, so FFI crates (`harvey-ffi`, `harvey-swift-bridge`, `harvey-calendar`) put `#![allow(unsafe_code)] // reason…` at the crate root. `harvey-db` will do the same later (#31/backup API). | `deny` (not `forbid`) so a crate-level `allow` works. |
| `fake-platform` | **Every** crate declares the feature, so `cargo … --workspace --features fake-platform` works everywhere. Crates with macOS-only code use it; the others forward it to their workspace deps (or leave it empty with a comment). | One feature name for CI and rust-analyzer. |

## Files to create (repository root)
- `Cargo.toml` — virtual workspace: `members = ["crates/*"]`, `resolver = "3"`;
  `[workspace.package]` (`edition = "2024"`, `rust-version = "1.100"`, `version = "0.1.0"`, `publish = false`);
  `[workspace.dependencies]` (internal path crates only); `[workspace.lints]`:
  - `rust`: `unsafe_code = "deny"`, `missing_debug_implementations = "warn"`.
  - `clippy`: `all = { level = "deny", priority = -1 }`, plus `cast_possible_truncation`, `cast_sign_loss`,
    `cloned_instead_of_copied`, `explicit_iter_loop`, `semicolon_if_nothing_returned`,
    `redundant_closure_for_method_calls`, `uninlined_format_args`, `needless_pass_by_value` (= `"warn"`).
  - `[profile.release]`: `lto = "thin"`, `codegen-units = 1`, `strip = "symbols"`.
- `Cargo.lock` — committed. Every cargo command in docs/scripts uses `--locked`.
- `rust-toolchain.toml` — `channel = "1.100.0"`, `components = ["rustfmt", "clippy", "llvm-tools-preview"]`,
  `targets = ["aarch64-apple-darwin"]`, `profile = "minimal"`.
- `rustfmt-nightly.toolchain` — one line: the nightly name.
- `scripts/fmt.sh` — executable, `set -euo pipefail`, resolves the repo root from the script path,
  runs `cargo +"$(cat rustfmt-nightly.toolchain)" fmt --all -- "$@"`; `scripts/fmt.sh --check` works.
- `rustfmt.toml` — exactly `edition = "2024"`, `group_imports = "StdExternalCrate"`, `imports_granularity = "Module"`.
- `.vscode/settings.json` — `rust-analyzer.rustfmt.overrideCommand = ["rustup","run","<nightly>","--","rustfmt","--edition","2024"]`,
  `rust-analyzer.cargo.features = ["fake-platform"]`.
- `.editorconfig` — utf-8, lf, final newline, trim trailing whitespace; 4 spaces for `*.rs`, 2 for json/yaml/toml/md/ts/tsx/css; no trimming for `*.md`.
- `.gitignore` — `target/`, `node_modules/`, `.DS_Store`, `dist/`, coverage outputs (`coverage/`, `lcov.info`, `*.profraw`, `*.profdata`).
- `docs/architecture.md` — short: crate list + responsibilities, dependency direction, trait placement, `fake-platform` cfg convention, the commands (`--locked`) to build/test/lint/format.

## Crates (`crates/<name>/`)
Each: `Cargo.toml` (`[package]` fields via `*.workspace = true`, `[lints] workspace = true`, `[features] fake-platform = …`),
`src/lib.rs` or `src/main.rs` with a crate-level `//!` doc comment stating the responsibility (below) and its allowed
dependencies, and one trivial `#[cfg(test)]` unit test.

| Crate | Kind | Responsibility | Workspace deps |
|---|---|---|---|
| `harvey-db` | lib | Connection factory, migrations, SQL repositories, ids and clock primitives (hosts `Id`, `Clock`; re-exported by `harvey-core`) | none |
| `harvey-core` | lib | Domain model, services, business rules — no Tauri, no EventKit, no direct filesystem. Owns `FileResolver` and the `Repository` unit-of-work trait. | db, calendar, backup |
| `harvey-calendar` | lib | `CalendarProvider` trait, EventKit actor (macOS) + fake | db |
| `harvey-backup` | lib | Snapshot, encryption, retention, restore. Owns `KeyStore` (Keychain on macOS + fake). | db |
| `harvey-ffi` | lib, `crate-type = ["lib", "staticlib"]` | UniFFI surface for the widget (timer only) | core |
| `harvey-swift-bridge` | lib | swift-rs bridge for the app (WidgetCenter, SMAppService). Only `harvey-app` may depend on it. | none |
| `harvey-mcp` | bin | MCP server (stdio) — `main` writes **nothing** to stdout | core |
| `harvey-bench` | bin | Dataset seeder + perf harness | core |

`harvey-app` is **not** created (#19).

### `fake-platform` features
- `harvey-calendar`, `harvey-backup`, `harvey-swift-bridge`: `fake-platform = []` and the cfg pattern in `lib.rs`:
  ```rust
  #[cfg(all(target_os = "macos", not(feature = "fake-platform")))]
  mod eventkit; // real implementation (keychain / bridge for the other crates)
  #[cfg(any(not(target_os = "macos"), feature = "fake-platform"))]
  mod fake; // fake implementation, also used by tests
  ```
  with empty placeholder module files behind each branch (`src/eventkit.rs` + `src/fake.rs`; `src/keychain.rs` for backup; `src/macos.rs` for swift-bridge).
  macOS code is gated by `target_os`, never by the feature alone, so `--all-features` on Linux pulls no macOS code.
- `harvey-core`: `fake-platform = ["harvey-calendar/fake-platform", "harvey-backup/fake-platform"]` (re-exports the fakes later).
- `harvey-mcp`, `harvey-ffi`, `harvey-bench`: `fake-platform = ["harvey-core/fake-platform"]`.
- `harvey-db`: `fake-platform = []` with a comment (no macOS code; declared so the workspace-wide flag is uniform).

### `harvey-mcp`
`main` returns without writing to stdout (stdout is the MCP protocol channel, FR-161). Integration test
`tests/stdout_silent.rs` runs `env!("CARGO_BIN_EXE_harvey-mcp")` with empty stdin and asserts success and empty stdout.

## Acceptance (verified by back and re-checked by lead before merge)
1. `cargo build --workspace --locked` and `cargo test --workspace --locked` pass, with and without `--features fake-platform` (macOS arm64 locally; Linux by construction — `target_os` gates, no macOS deps — and by CI in #21; if a Linux toolchain/container is available, run it).
2. `cargo clippy --workspace --all-targets --all-features --locked -- -D warnings` and the same without `--all-features` pass.
3. `scripts/fmt.sh --check` passes with the pinned nightly.
4. `rust-toolchain.toml` pins `1.100.0` with rustfmt, clippy, llvm-tools-preview; nightly pinned in one file.
5. No third-party dependency; `Cargo.lock` committed.
6. All eight crates exist with the doc comments above; the stdout test passes.
7. `docs/architecture.md` records the dependency direction and the cfg convention.

## Out of scope
Tauri app (#19), UI (#18), lefthook/sqlfluff/deps-exact (#20), CI workflows (#21), cargo-deny/Renovate (#22), any real code (#31, #34, spikes #25–#30).

## Plan
One task, `back`: everything above (single Cargo workspace — splitting it would only create conflicts on `Cargo.toml`/`Cargo.lock`).
Note for back: rustup must download `1.100.0`'s `llvm-tools-preview` and the pinned nightly from `static.rust-lang.org`; request sandbox access for that host.
