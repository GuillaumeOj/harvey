#!/usr/bin/env bash
# Lints YAML with the pinned yamllint from .venv/ (see requirements-dev.txt) and .yamllint.yml.
# Usage: scripts/yamllint.sh [files…]   (no files: the whole repo)
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

yamllint=".venv/bin/yamllint"
if [[ ! -x "$yamllint" ]]; then
  echo "yamllint: $yamllint not found; run \`uv venv .venv && uv pip install --python .venv --require-hashes -r requirements-dev.txt\` (see docs/dev-setup.md)" >&2
  exit 1
fi

[[ $# -gt 0 ]] || set -- .
exec "$yamllint" --strict "$@"
