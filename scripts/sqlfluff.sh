#!/usr/bin/env bash
# Formats or lints SQL migrations with the pinned sqlfluff from .venv/ (see requirements-dev.txt).
# Usage: scripts/sqlfluff.sh {fix|lint} [files…]
#   No files: the whole crates/harvey-db/migrations/ directory (exit 0 when it is missing or empty).
#   Files matching .sqlfluffignore (FTS5 / trigger migrations) are skipped by sqlfluff itself,
#   which honours that file for explicit paths as long as it runs from the repo root.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

usage() {
  echo "usage: scripts/sqlfluff.sh {fix|lint} [files…]" >&2
  exit 2
}
[[ $# -ge 1 ]] || usage
mode="$1"
shift
case "$mode" in
  fix | lint) ;;
  *) usage ;;
esac

sqlfluff=".venv/bin/sqlfluff"
if [[ ! -x "$sqlfluff" ]]; then
  echo "sqlfluff: $sqlfluff not found; run \`uv venv .venv && uv pip install --python .venv --require-hashes -r requirements-dev.txt\` (see docs/dev-setup.md)" >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  migrations="crates/harvey-db/migrations"
  if ! compgen -G "$migrations/*.sql" >/dev/null; then
    echo "sqlfluff: no SQL files in $migrations/, nothing to do"
    exit 0
  fi
  set -- "$migrations"
fi

exec "$sqlfluff" "$mode" "$@"
