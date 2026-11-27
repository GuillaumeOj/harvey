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
| `harvey-app` | bin + lib | Tauri 2 shell: windows, typed commands, capabilities, §6.10 hardening. Thin adapters over `harvey-core`. |

## Dependency direction

```
harvey-app ─┬─> harvey-core ─┬─> harvey-calendar ─> harvey-db
harvey-mcp ─┤                ├─> harvey-backup   ─> harvey-db
harvey-ffi ─┤                └─> harvey-db
harvey-bench┘
harvey-app ───> harvey-swift-bridge   (no workspace deps; used by harvey-app only)
```

Dependencies are declared once in `[workspace.dependencies]` and used with `{ workspace = true }`.
Traits live in the crate that owns the capability (`CalendarProvider` in calendar, `KeyStore` in backup,
`FileResolver` and `Repository` in core). Third-party dependencies are pinned exactly (`=x.y.z`).

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

## IPC (`harvey-app`)

Spec refs: §6.10, §10, NFR-02. The source of truth for the shapes is the generated `ui/src/bindings.ts`.

### Typed commands

- Commands live in `crates/harvey-app/src/commands/`, carry `#[tauri::command]` and `#[specta::specta]`, and are
  registered once in `specta_builder()` (`collect_commands![…]`, `collect_events![…]`). `run()` takes the invoke
  handler and the events from that builder.
- Naming: `snake_case` `<domain>_<verb>` (`app_info`, `invoice_create`). TS accessors are camel-cased by tauri-specta
  (`commands.appInfo()`).
- Every command returns `Result<T, AppError>`. The bindings resolve to
  `{ status: "ok"; data: T } | { status: "error"; error: AppError }` (`ErrorHandlingMode::Result`). A framework
  failure (an ACL denial, a bad argument) is a string, not an `AppError`; `ui/src/lib/ipc.ts` handles that case.
- Commands are thin adapters (§6.4): parse input, call a `harvey-core` service, map the output. They take entity ids
  or opaque tokens, **never filesystem paths** from the webview (file pickers are Rust-side and return tokens).
- `src/commands/names.rs` holds `COMMANDS`, the single list of command names. `build.rs` includes it and declares it
  in the Tauri app manifest, so a command no capability grants is rejected at runtime. A test fails if `COMMANDS`
  and `collect_commands!` differ.
- Bindings: `cargo test -p harvey-app export_bindings` writes `ui/src/bindings.ts` (deterministic, never written at
  app start-up). Commit it. CI fails when it is stale:
  `cargo test -p harvey-app export_bindings && git diff --exit-code ui/src/bindings.ts`.

Adding a command: write it, add it to `collect_commands!` and `COMMANDS`, grant `allow-<kebab-name>` in exactly one
capability file, regenerate the bindings.

### `AppError`

`src/error.rs`, one enum for every command, tagged on `kind` (snake_case): `not_found`, `validation { field, key }`,
`conflict { key }`, `permission_denied { resource }`, `calendar_unavailable`, `maintenance`, `schema_mismatch`,
`storage`, `internal`.

- `field`, `key` and `resource` are identifiers (`"siren"`, `"validation.siren.invalid"`, `"calendar"`), never user
  values, personal-data ids, paths or SQL (NFR-02). The payload fields are an `Ident` newtype with a private field, so only the `&'static str` constructors can build one.
- `message_key()` returns `error.<kind>`; `ui/src/lib/errors.ts` maps the same keys to French copy.
- `Display` and `Debug` print the kind and the identifiers only. `Internal` details are logged Rust-side through
  the redacting logger (#34), never sent to the UI.

### Capabilities

One file per window in `crates/harvey-app/capabilities/` (`main.json` today; `settings.json` with #42,
`tray-popover.json` with #86). The test `capabilities_are_exclusive` runs `check_capabilities`
(`src/capabilities.rs`) on the real files and `COMMANDS`:

1. Each file has exactly one window label, no glob, and no `remote` or `webviews` key. No two files share a label.
   Capability files are top-level `.json` files only (Tauri also loads `toml` and subfolders; the test refuses them).
2. Permissions are `allow-<command>` or one of `ALLOWED_CORE_PERMISSIONS` (today `core:event:allow-listen` and
   `core:event:allow-unlisten`). Any other `core:*`, plugin permissions, `deny-*` and unknown identifiers fail.
   Widening the list is a reviewed change. There are no `tauri-plugin-*` crates.
3. Every command is granted in exactly one file, and every `allow-*` names a command in `COMMANDS`.
4. A `<window>__<base>` wrapper is granted only in the file of window `<window>`, and `<base>` exists.

### The WS3 convention

Every command name is granted in exactly one capability file (§10). When another window needs the same operation
(`calendar_access_status` from main and settings, `mcp_approval_decide` from main and the tray popover), that window
gets its own wrapper command `<window>__<base>` (double underscore): `settings__calendar_access_status`,
`tray_popover__mcp_approval_decide`.

- The base command belongs to the window that owns the feature (usually `main`). The wrapper is granted only in the
  other window's capability (`allow-settings--calendar-access-status`).
- Window labels use `-`, prefixes `_`: label `tray-popover` ↔ `tray_popover__…`.
- Wrappers have no logic. `window_alias!` (`src/commands/alias.rs`) generates one that calls the base function:

  ```rust
  window_alias!(settings, calendar_access_status(app: AppHandle) -> Result<Status, AppError>);
  window_alias!(settings, async firm_profile_get(state: State<'_, Core>) -> Result<FirmProfile, AppError>);
  ```

  The signature is written once in the call; it is passed through to the base, so a mismatch does not compile. Add
  the wrapper to `collect_commands!` and `COMMANDS`; the bindings expose both names with the same types
  (`commands.calendarAccessStatus`, `commands.settingsCalendarAccessStatus`).
- Frontend: `forWindow(base)` in `ui/src/lib/ipc.ts` picks the wrapper from the current window label, so components
  call one function. Onboarding runs in `main` and uses base commands.

### Webview hardening (§6.10)

- Capabilities are never declared inline: a test fails if `app.security.capabilities` in `tauri.conf.json` or the dev
  overlay holds a capability object, so every grant goes through the checker. A test also keeps the dev overlay's
  `windows` equal to the base entries (it replaces the whole array), apart from the titles.
- `tauri.conf.json`: the §6.10 CSP exactly, `devCsp` adding only the Vite dev server (`ws://localhost:1420`,
  `http://localhost:1420`; on desktop Tauri loads `devUrl` directly, so the dev page runs without a CSP and only
  bundled builds enforce `csp`), `withGlobalTauri: false`, `freezePrototype: true`.
- Window `main` is `incognito` (non-persistent `WKWebsiteDataStore`: no cache, cookies or localStorage on disk) and
  `create: false`: `run()` builds it from its config entry to attach the navigation handlers.
- Navigation lock-down (`src/navigation.rs`): `on_navigation` allows only the app origin (`tauri://localhost`,
  `http(s)://tauri.localhost`) and, in dev builds only (`tauri::is_dev()`), the exact `devUrl` origin. `on_new_window` denies every
  `window.open`. External links go through the Rust-side opener (#48).
- No `devtools` feature. Debug and dev builds (`debug_assertions` or `tauri::is_dev()`) refuse to start unless the identifier ends in `.dev` (`com.harvey.dev`), so
  development never touches production data (`bun run dev` applies `tauri.dev.conf.json`).
