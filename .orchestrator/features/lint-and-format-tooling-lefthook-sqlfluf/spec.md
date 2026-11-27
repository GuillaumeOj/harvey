# Spec — Lint and format tooling (issue #20)

lefthook, sqlfluff, markdownlint-cli2, yamllint, swift-format and the `deps-exact` guard, with the **same commands
locally and in CI**. The issue body (GuillaumeOj/harvey#20) is the reference; this file records the decisions it
leaves open and how the work is split.

Spec refs: `docs/SPEC.md` §12.1, §12.2, §12.3, NFR-10.

## Starting point

The integration branch is brought up to date with `origin/main` (#17 Cargo workspace + `scripts/fmt.sh` +
`rustfmt-nightly.toolchain`, #18 bun workspace + `biome.json` + `ui/` scripts) **before** any task starts.
Existing pins to respect: `packageManager: bun@1.4.2`, `@biomejs/biome 2.6.9`, `rust-toolchain.toml`
`channel = "1.100.0"`, `nightly-2026-11-01`.

## Decisions

| Topic | Decision |
|---|---|
| Versions | Latest stable of each tool at install time, exact. Record the chosen versions in the task report and in `docs/dev-setup.md`. |
| JS tools | `lefthook` and `markdownlint-cli2` as exact root `devDependencies` (next to Biome), `bun.lock` updated with `bun install`. `trustedDependencies` stays `[]`: lefthook's npm postinstall must **not** run; hooks are installed explicitly with `bunx lefthook install`. |
| Python tools | `requirements-dev.in` lists the two top-level tools with `==` (`sqlfluff`, `yamllint`) — the one place their version is chosen. `requirements-dev.txt` is the lockfile compiled from it (`uv pip compile --generate-hashes requirements-dev.in -o requirements-dev.txt`, command written in its header): every package incl. transitive ones `==` + hashes. Installed into a repo-local **`.venv/`** (gitignored): `uv venv .venv && uv pip install --python .venv --require-hashes -r requirements-dev.txt` (pip fallback documented). Hooks and CI call `.venv/bin/<tool>` (through the wrappers below), never whatever is on `PATH`. |
| Swift | `tools/swift-format/Package.swift` (swift-tools-version matching the installed Xcode), one dependency `.package(url: "https://github.com/swiftlang/swift-format.git", exact: "x.y.z")` — the release matching the installed Swift toolchain's major.minor (e.g. `602.0.0` for Swift 6.2) — plus a committed `tools/swift-format/Package.resolved`. Run via `swift run --package-path tools/swift-format -c release swift-format …`. `.build/` gitignored. |
| Wrapper scripts | One script per tool that needs path/venv logic, used **identically** by lefthook and by CI (#21). With file args: only those files. Without args: full repo run. `scripts/sqlfluff.sh {fix\|lint} [files…]` (no files → `crates/harvey-db/migrations/`; missing or empty dir → exit 0 with a one-line notice), `scripts/yamllint.sh [files…]` (no files → `.`), `scripts/swift-format.sh {format\|lint} [files…]` (`lint` always `--strict`; no files → every tracked `*.swift` outside excluded paths; no Swift files → exit 0). Each fails with a clear "run `…` to install" message when its tool is missing. markdownlint-cli2 needs no wrapper (`globs` live in its config). |
| SQL exclusion | Convention: FTS5 virtual tables and triggers go in dedicated migration files whose description ends in `_fts5` or `_triggers` (e.g. `20261201000005_notes_fts5.sql`, `…_change_log_triggers.sql`). `.sqlfluffignore` excludes `crates/harvey-db/migrations/*_fts5.sql` and `*_triggers.sql`. The implementer verifies sqlfluff honours `.sqlfluffignore` for files passed explicitly (the lefthook case); if it does not, the wrapper filters them out using the same patterns read from `.sqlfluffignore` — the patterns live in one file only. Documented in `docs/dev-setup.md`. |
| SQL sample | No sample file under `crates/harvey-db/migrations/` (sqlx would run it as a real migration). The config is proven on fixtures under `scripts/fixtures/sqlfluff/` (one clean file, one badly formatted file that `fix` repairs, one `_fts5` file that is skipped). |
| `.sqlfluff` | `dialect = sqlite`, `templater = raw`, `max_line_length = 120`, `capitalisation.keywords = upper`, `capitalisation.identifiers = lower`, `capitalisation.functions = upper`, `capitalisation.literals = upper`, `capitalisation.types = upper`. |
| `.markdownlint-cli2.jsonc` | Default rules; `MD013: false`; `MD033: { allowed_elements: ["br", "details", "summary"] }`; `globs: ["**/*.md"]`; `ignores`: `**/node_modules/**`, `**/target/**`, `.venv/**`, `tools/swift-format/.build/**`, `.orchestrator/**`, `.claude/**`, `CHANGELOG.md`. Fix existing Markdown (`docs/**`, `brand/**`, `ui/README.md`) by formatting only — never change the spec's wording; if a rule would force rewriting content, disable that rule with a comment explaining why. |
| `.yamllint.yml` | As in the issue (`extends: default`, `line-length: {max: 160}`, `truthy: {check-keys: false}`, `document-start: disable`) plus `ignore:` for `node_modules/`, `target/`, `.venv/`, `tools/swift-format/.build/`, `.orchestrator/`, `.claude/`. |
| `.swift-format` | JSON, `version: 1`, `lineLength: 120`, `indentation: {spaces: 4}`, `rules.OrderedImports: true`. Excluded from Swift lint/format: `brand/generated/` (generated by `brand/build-tokens.ts`). |
| Generated files | Excluded from every linter: `brand/generated/`, `ui/src/bindings.ts`, `.sqlx/`, `Package.resolved`, `bun.lock`, `Cargo.lock`. |
| `lefthook.yml` | Exactly the commands in the issue, `pre-commit` `parallel: true`, `stage_fixed: true` on Rust, Biome, sqlfluff and swift-format; globs per language; `exclude` for generated paths. deps-exact runs when `package.json`, `Cargo.toml`, `Package.swift`, `bunfig.toml`, `rust-toolchain.toml`, `rustfmt-nightly.toolchain`, `requirements-dev.*` or `.github/**/*.yml` is staged. `pre-push` as in the issue (`parallel: true`). |
| `deps-exact` scope additions | On top of the issue's list: `requirements*.txt` / `requirements*.in` lines must be `name==x.y.z` (hash continuation lines allowed); `rustfmt-nightly.toolchain` must be `nightly-YYYY-MM-DD`. Repo scan skips `node_modules/`, `target/`, `.git/`, `.venv/`, `.build/` and `scripts/fixtures/`. |
| `deps-exact` tests | `bun test scripts/` from the repo root (Bun's built-in runner; `ui/` keeps Vitest). The script does **not** add a root `package.json` script, so the two tasks never edit the same file. |
| Network | `deps-exact` and every lint command work offline once tools are installed. Members request sandbox access for registries (npm, PyPI, GitHub for SwiftPM) when installing. |

## Work split

| Task | Node | Owns (files) | Depends on |
|---|---|---|---|
| T1 `deps-exact` | back | `scripts/deps-exact.ts`, `scripts/deps-exact.test.ts`, `scripts/fixtures/deps-exact/**` | — |
| T2 Linters + lefthook + docs | front (Opus) | root `package.json` devDependencies + `bun.lock`, `lefthook.yml`, `.sqlfluff`, `.sqlfluffignore`, `.markdownlint-cli2.jsonc`, `.yamllint.yml`, `.swift-format`, `requirements-dev.in/.txt`, `tools/swift-format/**`, `scripts/sqlfluff.sh`, `scripts/yamllint.sh`, `scripts/swift-format.sh`, `scripts/fixtures/sqlfluff/**`, `.gitignore`, Markdown fixes in `docs/**` / `brand/**` / `ui/README.md`, `docs/dev-setup.md` | — (runs in parallel with T1; calls T1's CLI as defined in `api-contract.md`) |

No design work: `ui` and `ux` stay idle for this feature (see `ux-brief.md`).

## Done when (lead checks on the integration branch)

- `bun install --frozen-lockfile`, `bunx lefthook install`, then committing a badly formatted `.rs`, `.ts`, `.sql`,
  `.md`, `.yml` and `.swift` file is fixed or blocked (checked with `bunx lefthook run pre-commit --files …` /
  real commits in a scratch clone).
- `bun scripts/deps-exact.ts` exits 0 on the repo; `bun test scripts/` passes and covers every accepted and rejected
  form of the issue plus the two additions above.
- `scripts/sqlfluff.sh lint` passes (empty migrations dir) and on the fixtures behaves as described.
- `bunx markdownlint-cli2` and `scripts/yamllint.sh` pass on the whole repo; `scripts/swift-format.sh lint` passes
  (no non-generated Swift yet).
- `bunx biome ci .`, `scripts/fmt.sh --check`, `cargo clippy …` and `bun run --cwd ui test` still pass.
- `docs/dev-setup.md` covers installing bun deps, the Python venv, swift-format, the nightly rustfmt, lefthook, the
  SQL exclusion convention, and the full-repo commands CI (#21) will call.

## Risks

- Branches in flight (#19 Tauri, #25/#26 spikes) add Markdown/YAML/Swift/Cargo files; they will meet these linters
  when they rebase. Nothing to do here; #21 makes the jobs required.
- swift-format builds swift-syntax from source on first run (minutes). Acceptable for a pinned tool; `.build/` is
  cached locally and in CI (#21).
