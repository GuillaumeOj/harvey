# Spec: Tauri 2 app scaffold (issue #19)

`crates/harvey-app`: the Tauri 2 shell with typed IPC (`specta` + `tauri-specta`), a single `AppError`, one
capability file per window, the strict CSP and the §6.10 hardening, plus the UI glue (`ipc.ts`, `errors.ts`, the
`app_info` round trip). The issue body (GuillaumeOj/harvey#19) is the reference. This file records the decisions the
issue leaves open, the deviations from it, and how the work is split. The IPC shapes are in `api-contract.md`.

Spec refs: `docs/SPEC.md` §6.1–§6.5, §6.10, §10, §11, NFR-02, NFR-06.

## Base

The work builds on #17 (Cargo workspace, `origin/main` 6780624) and #18 (UI scaffold, `origin/main` c3cb5c3). The
integration branch is rebased onto `origin/main` before the first task starts.

## Deviations from the issue text

| Issue says | Decision | Why |
|---|---|---|
| `identifier: "com.fusily.harvey"`, dev `com.fusily.harvey.dev` | **`com.harvey`** and dev **`com.harvey.dev`** | The user renamed the identifier on `main` after the issue was written (commit 5abf919, SPEC §6.5, ADR-001, entitlements). `productName` stays "Harvey" / "Harvey Dev". |
| `bun run tauri dev` opens "Harvey Dev" | Root script **`bun run dev`** runs `tauri dev --config crates/harvey-app/tauri.dev.conf.json`. `bun run tauri …` stays the raw CLI. | The Tauri CLI does not apply an overlay by itself, and the base config is the production one. |
| (not in the issue) | **Debug-build guard**: a `debug_assertions` build whose identifier does not end in `.dev` refuses to start, with a clear message (use `bun run dev`). | Enforces "dev builds must never touch production data" from day one. A release build with the dev overlay is allowed. |

## `crates/harvey-app`

### Crate and dependencies

- Tauri 2 layout from the issue: `Cargo.toml`, `build.rs`, `tauri.conf.json`, `tauri.dev.conf.json`, `capabilities/`,
  `icons/` (only if needed, see Icon), `src/main.rs`, `src/lib.rs`, `src/error.rs`, `src/commands/`,
  `src/navigation.rs`, `src/capabilities.rs` (the checker, see below).
- `[lints] workspace = true`. Feature `fake-platform` forwards to `harvey-core/fake-platform` and
  `harvey-swift-bridge/fake-platform`. Workspace deps `harvey-core` and `harvey-swift-bridge` are declared (unused for
  now, allowed by the workspace lints), matching §6.1.
- Exact pins in `[workspace.dependencies]`: `tauri`, `tauri-build`, `specta`, `tauri-specta`, `specta-typescript`,
  `serde`, `serde_json`. Use the latest stable Tauri 2.x. Pick a `specta` / `tauri-specta` / `specta-typescript` set
  released together (RCs are fine, the exact trio must be the one `tauri-specta` documents). Record the versions in
  the report.
- `tauri` features: none beyond the defaults needed for a macOS window. **Never** `devtools`. **No** plugin crates at
  all (`tauri-plugin-*`): there are no plugins in this feature.
- `unsafe_code` stays `deny`. If a Tauri macro needs an exception, use a narrow `#[allow]` with a reason comment.
- `main.rs` is a one-liner calling `harvey_app::run()`. All logic that can be tested lives in pure functions in
  `lib.rs` and its modules (coverage ≥ 70 % lines).
- `.gitignore`: add `crates/harvey-app/gen/` (Tauri's generated schemas). Capability files reference
  `../gen/schemas/desktop-schema.json` as `$schema`.

### `tauri.conf.json` / `tauri.dev.conf.json`

As in the issue, with these details:

- `productName: "Harvey"`, `identifier: "com.harvey"`, `version` read from the crate (`"../Cargo.toml"`, or the
  workspace version).
- `build`: `devUrl: "http://localhost:1420"`, `frontendDist: "../../ui/dist"`, `beforeDevCommand` /
  `beforeBuildCommand` `bun run --cwd ui dev|build`. Use the object form with an explicit `cwd` pointing at the repo
  root if the CLI does not run them from the repo root. Verify both from a clean shell.
- `app.withGlobalTauri: false`, `app.security.freezePrototype: true`, `app.security.csp` = the §6.10 string
  **exactly**:
  `default-src 'self'; script-src 'self'; connect-src ipc: http://ipc.localhost; img-src 'self' data: asset:; style-src 'self' 'unsafe-inline'; object-src 'none'; frame-src 'none'; base-uri 'none'`
- `app.security.devCsp`: the same, with `ws://localhost:1420 http://localhost:1420` added to `connect-src`. If the
  Vite React-Refresh inline preamble is blocked in dev, add the smallest fix to `devCsp` only, and say so in the
  report. `csp` never changes.
- `app.security.capabilities` is left at its default (every file in `capabilities/`). No `dangerousDisableAssetCspModification`
  and no `assetProtocol` scope.
- Window `main`: `label: "main"`, `title: "Harvey"`, `width` 1200 / `height` 800, `minWidth` 960 / `minHeight` 640,
  `incognito: true`, **`create: false`**. The window is built in `setup` from this config entry
  (`WebviewWindowBuilder::from_config`) so the navigation handlers can be attached, and the config stays the single
  source of its attributes.
- `bundle.macOS.minimumSystemVersion: "14.0"`. `bundle.targets: ["app"]`.
- `tauri.dev.conf.json`: only `identifier: "com.harvey.dev"`, `productName: "Harvey Dev"`, and the window title
  "Harvey Dev".

### Icon

Reference `../../brand/icon/Harvey.icns` in `bundle.icon`. If `generate_context!` also needs a PNG (window or dev
icon), reference `../../brand/icon/preview/harvey-icon-default-1024.png`. Copy into `icons/` only if a reference is
rejected. In that case, add `icons/README.md` pointing to `brand/icon/` as the source.

### Navigation lock-down (`src/navigation.rs`)

- Pure predicate `is_app_url(url: &Url, dev_url: Option<&Url>) -> bool`. It allows `tauri://localhost`,
  `http://tauri.localhost` and `https://tauri.localhost` (any path), plus the dev URL's exact origin (scheme, host,
  port) when `dev_url` is `Some`. Everything else returns false: other hosts and ports, `file:`, `data:`, `javascript:`,
  `about:`, `blob:`, `harvey:`, userinfo tricks (`http://tauri.localhost@evil.com`), `tauri://localhost.evil.com`.
- `dev_url` is `Some(config devUrl)` only under `cfg(debug_assertions)`, and `None` in release.
- `on_navigation(|url| is_app_url(url, dev))` and `on_new_window(...) → Deny` on the main window builder. If the
  pinned Tauri has no `on_new_window`, use the closest API that denies new windows, and report what you used.
- Table-driven unit tests for the predicate (allowed and denied cases above).

### Debug identifier guard

Pure `fn check_dev_identifier(identifier: &str, debug: bool) -> Result<(), String>`, called first in `run()`. It
is unit-tested for the four cases.

### Errors (`src/error.rs`)

See `api-contract.md` for the wire format. Rust side:

- `#[derive(Serialize, specta::Type)]`, `#[serde(tag = "kind", rename_all = "snake_case")]`, the 9 variants of §10,
  with `String` fields as in the issue. Constructors take `&'static str` (`AppError::validation("siren",
  "validation.siren.invalid")`, `conflict(key)`, `permission_denied(resource)`), so user values cannot reach a
  payload by accident. No `Deserialize`.
- `message_key(&self) -> &'static str` returns `error.<kind>`.
- Hand-written `Display` and `Debug` print only the kind and the identifier fields, e.g.
  `Validation(field=siren, key=validation.siren.invalid)`. `impl std::error::Error`.
- Tests: a JSON snapshot per variant (inline `serde_json::json!` comparison, no snapshot crate needed),
  `message_key` for each variant, and `Display`/`Debug` output.

### Commands (`src/commands/`)

- `mod.rs`: `pub fn specta_builder() -> tauri_specta::Builder<tauri::Wry>` with `collect_commands![app_info]` and
  `collect_events![]` (empty for now). `run()` uses it for `invoke_handler` and `mount_events`.
- `names.rs`: `pub const COMMANDS: &[&str] = &["app_info"];` is the single list of app commands. `build.rs` pulls it
  in with `include!` and passes it to
  `tauri_build::Attributes::new().app_manifest(AppManifest::new().commands(COMMANDS))`. A test asserts that
  `COMMANDS` equals the set of commands the specta builder registers (through the exported bindings or a builder
  accessor). Adding a command without listing it fails a test.
- `app.rs`: `app_info(app: AppHandle) -> Result<AppInfo, AppError>`. `version` comes from `app.package_info()`.
  `build_channel` comes from `BuildChannel::from_identifier(&app.config().identifier)`: `Dev` if it ends in `.dev`,
  otherwise `Release`. The channel names the data the app touches, not the cargo profile. No paths, no user data.
- Naming: `snake_case` `<domain>_<verb>`. Wrappers are `<window>__<base>` (see WS3 below).
- `export_bindings` test (`cargo test -p harvey-app export_bindings`) writes `ui/src/bindings.ts` with
  `specta_typescript::Typescript` and a fixed header ("Generated by tauri-specta. Do not edit."). The output is
  deterministic (same bytes on every run and platform). Bindings are **not** written at app start-up.

### WS3 convention: per-window wrappers (`src/commands/alias.rs`)

As in the issue. Details:

- `window_alias!` generates `#[tauri::command] #[specta::specta] pub fn <window>__<base>(…) -> … { <base>(…) }`.
  The wrapper **calls the base command function**, so a signature mismatch fails to compile, and it has no logic of
  its own. It supports sync and `async` commands and arguments such as `AppHandle` / `State<'_, T>`. A declarative
  macro cannot read the base signature, so the signature is written once in the macro call, e.g.
  `window_alias!(settings, app_info(app: AppHandle) -> Result<AppInfo, AppError>)`. The compiler checks it against
  the base.
- Window ident → label: `_` becomes `-` (`tray_popover` ↔ label `tray-popover`). Label → TS prefix: `-` becomes `_`.
- No production wrapper ships now. The sample is test-only: `#[cfg(test)]` generates `settings__app_info`, registers
  both in a test builder, exports to a string, and asserts that both functions exist with identical argument and
  result types.

### Capabilities (`capabilities/main.json` + `src/capabilities.rs`)

- `main.json`: `identifier: "main"`, `windows: ["main"]`, permissions `core:event:allow-listen`,
  `core:event:allow-unlisten`, `allow-app-info`. No `core:window:*` (nothing needs one yet), and no `remote`.
- Checker `check_capabilities(files: &[Capability], commands: &[&str]) -> Result<(), Vec<Violation>>`, a pure
  function. `Violation` is an enum. Rules:
  1. Each file has exactly one window label, no glob, and no `remote` key. No two files share a label.
  2. Permissions are either `core:*` or `allow-<command>` (kebab, mapped back with `-` → `_`). Anything else fails,
     including plugin permissions, `deny-*` and unknown identifiers. Object-form permissions (`{ "identifier": … }`)
     are read by their identifier.
  3. Every command in `COMMANDS` is granted in exactly one file, and every `allow-*` maps to a command in `COMMANDS`.
  4. A `<window>__<base>` command is granted only in the file whose label is `<window>` (after mapping), and `<base>`
     is in `COMMANDS`.
- Test `capabilities_are_exclusive` runs the checker on the real `capabilities/*.json` and `COMMANDS`. Fixture tests
  check one violation per rule: missing, duplicated, unknown, wrapper in the wrong window, orphan wrapper, plugin
  permission, shared label, `remote`.

### Docs

- `docs/architecture.md`: add `harvey-app` to the crate table and the dependency graph, plus a new **IPC** section:
  typed commands and bindings regeneration, the `AppError` contract, capabilities and how the checker enforces them,
  the **WS3 convention** (named as such), the navigation lock-down, and the no-paths rule.
- `docs/dev-setup.md` (new): prerequisites (Xcode CLT, rustup, bun), `bun install --frozen-lockfile`, `bun run dev`,
  `bun run tauri build --bundles app` (with and without `--config crates/harvey-app/tauri.dev.conf.json`), how to
  regenerate bindings, how to check that the WebView keeps nothing on disk
  (`~/Library/WebKit/com.harvey*`, `~/Library/Caches/com.harvey*`), and the Linux build packages (WebKitGTK 4.1,
  libsoup-3.0, libayatana-appindicator3, librsvg2) for #21.
- CI: #21 is not merged yet. The lead adds a comment on #21 asking for the bindings freshness check
  (`cargo test -p harvey-app export_bindings && git diff --exit-code ui/src/bindings.ts`) and the Linux packages. The
  same command goes in `docs/dev-setup.md`.

## `ui/` and root (JS)

- Root `package.json`: `@tauri-apps/cli` exact devDependency, scripts `"tauri": "tauri"` and
  `"dev": "tauri dev --config crates/harvey-app/tauri.dev.conf.json"`. `ui/package.json`: `@tauri-apps/api` exact
  dependency. `trustedDependencies` stays empty. The back task adds both, so `bun.lock` changes only once.
- `ui/src/bindings.ts`: generated and committed by the back task, never hand-edited.
- `ui/src/lib/errors.ts`: `errorMessages: Record<\`error.${AppError["kind"]}\`, string>` with the French copy from
  the issue (typographic apostrophes and « » not needed inside the strings), and `messageFor(error: AppError): string`.
  The type makes the map exhaustive, so a new Rust variant breaks the typecheck after regeneration.
- `ui/src/lib/ipc.ts`: re-exports `commands` and the types from `bindings.ts`. It also provides
  `unwrap<T>(p: Promise<Result<T, AppError>>): Promise<T>`, which throws `IpcError` (`class IpcError extends Error`,
  `readonly error: AppError`, `message = messageFor(error)`), and `forWindow(base)`, which returns
  `commands[base]` in `main` and `commands[\`${prefix}__${base}\`]` elsewhere. The prefix comes from
  `getCurrentWindow().label` with `-` → `_`. If the wrapper does not exist, it throws `IpcError` with `Internal`. It
  is typed so that callers keep the base command's argument and result types.
- `App.tsx`: keep the #18 placeholder and add one line showing `app_info`, e.g. `Version 0.1.0 · dev` in `mono`
  (`legende` colour), with a French loading state (« Chargement… ») and the French error message on failure.
  `useEffect` + `useState` (TanStack Query comes with #36). No `localStorage`.
- Tests (Vitest, `mockIPC` from `@tauri-apps/api/mocks`, and `clearMocks` after each): the `unwrap` OK path and each
  of the 9 error kinds, `forWindow` in `main`, in `settings` (wrapper present, via a mocked label) and with a missing
  wrapper, `messageFor`, and `App` showing version and channel, then the error message. Coverage stays ≥ 90 %.
- `ui/README.md`: one paragraph on `bindings.ts` and `ipc.ts`.

## Acceptance (feature level)

The issue's acceptance criteria, read with the deviations above (`com.harvey*`, `bun run dev`). Checks the back node
cannot run in the sandbox (opening the window, the WebKit data check, `window.open` by hand) are listed in its report
for the user to run before the PR.

## Work split

No design tasks: the visible change is one line in the existing placeholder, using existing text styles. The UI/UX
nodes are not used.

1. **back** (opus): everything under `crates/harvey-app/`, `Cargo.toml`/`Cargo.lock`, `.gitignore`, root
   `package.json` + `ui/package.json` deps + `bun.lock`, the generated `ui/src/bindings.ts`, `docs/architecture.md`,
   and `docs/dev-setup.md`.
2. **front** (depends on 1): `ui/src/lib/ipc.ts`, `ui/src/lib/errors.ts`, `App.tsx`, their tests, and `ui/README.md`.
