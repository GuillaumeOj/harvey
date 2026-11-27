# Contract — `deps-exact` CLI (T1 → T2, #21)

The interface T2 (lefthook, `docs/dev-setup.md`) and later CI (#21) rely on. T1 implements it; neither side changes
it without the lead.

## Invocation

```sh
bun scripts/deps-exact.ts            # scan the repo root (the git top-level, else the script's parent dir)
bun scripts/deps-exact.ts --root DIR # scan DIR instead (used by tests on fixtures)
bun scripts/deps-exact.ts --json     # machine-readable output
```

No other flags. No network access. No third-party dependency (uses `Bun.TOML.parse`, `Bun.Glob`, `node:fs`).
Takes no file arguments: it always scans the whole tree (fast enough for a pre-commit hook; lefthook only decides
*when* to run it).

## Exit codes

| Code | Meaning |
|---|---|
| 0 | No violation |
| 1 | At least one violation |
| 2 | Usage error or unreadable/unparseable file (message on stderr) |

## Text output (default)

On success, one line on stdout: `deps-exact: OK (N files checked)`.

On failure, on stderr, one line per violation, sorted by file then dependency, then a summary:

```text
ui/package.json: dependencies.react → "^19.3.1" (range; use an exact version x.y.z)
Cargo.toml: workspace.dependencies.serde → "1.0" (use "=x.y.z")
.github/workflows/ci.yml: uses actions/checkout@v4 (pin to a 40-hex commit SHA)
deps-exact: 3 violations in 3 files
```

Format: `<repo-relative path>: <location> → <offending spec> (<reason>)`. `<location>` is the dotted key path
(`dependencies.react`, `target.'cfg(unix)'.dependencies.libc`, `packageManager`, `toolchain.channel`, …) or, for
Swift/YAML, the package URL / `uses` value.

## JSON output (`--json`)

stdout, always (exit code unchanged):

```json
{
  "ok": false,
  "filesChecked": 12,
  "violations": [
    { "file": "ui/package.json", "location": "dependencies.react", "spec": "^19.3.1", "reason": "range; use an exact version x.y.z" }
  ]
}
```

## Library surface (for the tests)

`scripts/deps-exact.ts` exports `checkRepo(root: string): { filesChecked: number; violations: Violation[] }` and
the per-format checkers; the CLI runs only under `import.meta.main`.
