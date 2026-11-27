# Developer setup

Harvey targets macOS 14+ on Apple silicon (NFR-06). Linux is used by CI only, with `fake-platform`.

## Prerequisites

- Xcode Command Line Tools: `xcode-select --install`.
- [rustup](https://rustup.rs). The toolchain is pinned in `rust-toolchain.toml` and installs itself on the first
  `cargo` call. `scripts/fmt.sh` uses the nightly pinned in `rustfmt-nightly.toolchain`.
- [bun](https://bun.sh), the version in the root `package.json` (`packageManager`).

```sh
bun install --frozen-lockfile
```

## Run the app

```sh
bun run dev
```

This runs `tauri dev --config crates/harvey-app/tauri.dev.conf.json`: it starts Vite on `http://localhost:1420`
(`bun run --cwd ui dev`) and opens the **Harvey Dev** window, with the dev identifier `com.harvey.dev`, so it never
touches production data. A debug or dev build without the dev overlay (`bun run tauri dev`, even with `--release`)
refuses to start (it would use `com.harvey`).

`bun run tauri …` is the raw Tauri CLI (pinned `@tauri-apps/cli`).

## Build a bundle

```sh
bun run tauri build --bundles app                                                   # Harvey.app, com.harvey
bun run tauri build --bundles app --config crates/harvey-app/tauri.dev.conf.json    # Harvey Dev.app, com.harvey.dev
```

Bundles land in `target/release/bundle/macos/`. Both are release builds: no devtools, the production CSP, and no dev
server origin in the navigation allow-list. A `--debug` bundle (`tauri build --debug`) with the production identifier
hits the dev-identifier guard and refuses to start: add the dev overlay.

## Rust checks

See `docs/architecture.md` › Commands. In short, from the repo root:

```sh
cargo build  --workspace --locked [--features fake-platform]
cargo test   --workspace --locked [--features fake-platform]
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
scripts/fmt.sh --check
```

## Regenerate the IPC bindings

`ui/src/bindings.ts` is generated from the Rust commands and committed. After changing a command or a type it uses:

```sh
cargo test -p harvey-app export_bindings
```

CI fails when the committed file is stale:

```sh
cargo test -p harvey-app export_bindings && git diff --exit-code ui/src/bindings.ts
```

## Check that the WebView keeps nothing on disk

The main window is `incognito` (non-persistent WebKit data store, NFR-02). After a session with `bun run dev` or a
bundle, quit the app and check that nothing was written:

```sh
ls -d ~/Library/WebKit/com.harvey* ~/Library/Caches/com.harvey* 2>/dev/null
```

The command prints nothing when no WebKit data exists. If a folder does exist, it must hold no cache, cookie or
`LocalStorage` files (`find ~/Library/WebKit/com.harvey* -type f`).

## Linux (CI)

Tauri needs the WebKitGTK stack on Ubuntu runners (#21):

```sh
sudo apt-get install -y libwebkit2gtk-4.1-dev libsoup-3.0-dev libayatana-appindicator3-dev librsvg2-dev
```

CI builds and tests with `--features fake-platform`.
