# Developer setup

How to install the pinned tools and the git hooks. Every tool version is pinned in exactly one place (spec §12.1);
CI (#21) runs the same commands as the hooks, never with extra flags.

## Pinned versions

| Tool | Version | Pinned in |
| --- | --- | --- |
| bun | 1.4.2 | `package.json` `packageManager` |
| Biome | 2.6.9 | root `package.json` `devDependencies` |
| lefthook | 2.2.4 | root `package.json` `devDependencies` |
| markdownlint-cli2 | 0.24.2 | root `package.json` `devDependencies` |
| sqlfluff | 4.5.0 | `requirements-dev.in` (locked with hashes in `requirements-dev.txt`) |
| yamllint | 1.38.0 | `requirements-dev.in` (locked with hashes in `requirements-dev.txt`) |
| swift-format | 604.0.0 | `tools/swift-format-pin/Package.swift` (`exact:`) + `Package.resolved` |
| Rust | 1.100.0 | `rust-toolchain.toml` |
| rustfmt (nightly) | nightly-2026-11-01 | `rustfmt-nightly.toolchain` |

## 1. JavaScript tools (bun)

```sh
bun install --frozen-lockfile
```

Installs Biome, lefthook and markdownlint-cli2 from `bun.lock`. `trustedDependencies` is empty, so no package
install script runs (lefthook's npm postinstall included); the hooks are installed explicitly in step 5.

## 2. Python tools (sqlfluff, yamllint)

They live in a repo-local virtualenv `.venv/` (gitignored). The wrappers in `scripts/` always call `.venv/bin/<tool>`,
never whatever is on `PATH`.

With [uv](https://docs.astral.sh/uv/):

```sh
uv venv .venv
uv pip install --python .venv --require-hashes -r requirements-dev.txt
```

Without uv (Python 3 with `venv` and `pip`):

```sh
python3 -m venv .venv
.venv/bin/pip install --require-hashes -r requirements-dev.txt
```

To change a version, edit `requirements-dev.in` (top-level tools only, `name==x.y.z`), then regenerate the lockfile
with the command recorded in its header:

```sh
uv pip compile --generate-hashes requirements-dev.in -o requirements-dev.txt
```

## 3. swift-format

Needs Xcode (or the Command Line Tools) with Swift 6.4. swift-format is pinned by a tiny SwiftPM package,
`tools/swift-format-pin/`, whose release matches the Swift toolchain's major.minor (604.x for Swift 6.4). The
directory is not named `tools/swift-format/` because SwiftPM names a root package after its directory and that name
would clash with the `swift-format` dependency.

```sh
swift build --package-path tools/swift-format-pin -c release --product swift-format
```

The first build compiles swift-format and swift-syntax from source and takes a few minutes; later runs reuse
`tools/swift-format-pin/.build/` (gitignored). `scripts/swift-format.sh` builds it on demand if you skip this step.
Use the pinned tool, not Xcode's bundled `swift format`, which drifts with Xcode updates.

When Xcode moves to a new Swift minor version, bump `exact:` in `Package.swift` to the matching swift-format release
and run `swift package --package-path tools/swift-format-pin update` to refresh `Package.resolved`.

## 4. Nightly rustfmt

`scripts/fmt.sh` formats Rust with the nightly pinned in `rustfmt-nightly.toolchain` (stable rustfmt lacks the
import-grouping options in `rustfmt.toml`):

```sh
rustup toolchain install "$(cat rustfmt-nightly.toolchain)" --component rustfmt
```

## 5. Git hooks (lefthook)

```sh
bunx lefthook install
```

`lefthook.yml` defines:

- **pre-commit** (parallel, staged files only): `scripts/fmt.sh` (Rust), Biome `check --write` (TS/JS/JSON/CSS),
  `scripts/sqlfluff.sh fix` + `lint` (migrations), markdownlint-cli2 (Markdown), `scripts/yamllint.sh` (YAML),
  `scripts/swift-format.sh format` + `lint` (Swift), and `bun scripts/deps-exact.ts` when a dependency or toolchain
  file is staged. Formatters re-stage the files they fix; linters block the commit.
- **pre-push** (parallel): clippy with `-D warnings`, the UI typecheck, `cargo test` with `fake-platform`, and the UI
  tests.

Generated files are never linted: `brand/generated/`, `ui/src/bindings.ts`, `.sqlx/`, `Package.resolved`,
`bun.lock`, `Cargo.lock`.

## SQL migrations and the FTS5 / trigger convention

sqlfluff's SQLite dialect cannot parse `CREATE VIRTUAL TABLE … USING fts5(…)` or `CREATE TRIGGER … BEGIN … END;`.
Keep those statements in dedicated migration files whose description ends in `_fts5` or `_triggers`, for example
`20261201000005_notes_fts5.sql` or `20261201000006_change_log_triggers.sql`. `.sqlfluffignore` excludes
`crates/harvey-db/migrations/*_fts5.sql` and `*_triggers.sql`; that file is the only place the patterns live.
sqlfluff honours it for files passed explicitly too (the hook case), as long as it runs from the repo root, which
`scripts/sqlfluff.sh` ensures. Every other migration must pass `scripts/sqlfluff.sh lint`.

`scripts/fixtures/sqlfluff/` holds sample files used to check the configuration (a clean file, a badly formatted
file that `fix` repairs, an `_fts5` file that is skipped). They are not migrations.

## Dependency pins (`deps-exact`)

```sh
bun scripts/deps-exact.ts          # exit 0 when every dependency and toolchain pin is exact
bun scripts/deps-exact.ts --json   # machine-readable output
```

It checks every `package.json`, `Cargo.toml`, `Package.swift`, `requirements*.in` / `requirements*.txt`, workflow
`uses:`, `bunfig.toml`, `rust-toolchain.toml` and `rustfmt-nightly.toolchain`, offline. Its tests run with
`bun test scripts/`.

## Full-repo commands (what CI runs)

The same commands, with no file arguments, run on the whole repository. CI (#21) calls exactly these:

```sh
scripts/fmt.sh --check
bunx biome ci .
scripts/sqlfluff.sh lint
bunx markdownlint-cli2
scripts/yamllint.sh
scripts/swift-format.sh lint
bun scripts/deps-exact.ts
bun test scripts/
cargo clippy --workspace --all-targets --all-features --locked -- -D warnings
cargo test --workspace --locked --features fake-platform
bun run --cwd ui typecheck
bun run --cwd ui test
```

To fix instead of check locally: `scripts/fmt.sh`, `bunx biome check --write .`, `scripts/sqlfluff.sh fix`,
`scripts/swift-format.sh format`.
