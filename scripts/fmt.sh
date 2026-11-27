#!/usr/bin/env bash
# Formats Rust with the pinned nightly rustfmt (see rustfmt-nightly.toolchain).
# Usage: scripts/fmt.sh [--check] [files…]
#   No files: the whole workspace (`cargo fmt --all`).
#   Files (*.rs, relative to the repo root): only those (the pre-commit hook); `mod foo;` is not followed
#   into files that were not given. Other arguments (e.g. `--config k=v`) are passed to rustfmt.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
toolchain="$(cat rustfmt-nightly.toolchain)"
for arg in "$@"; do
  if [[ "$arg" == *.rs ]]; then
    exec rustfmt +"$toolchain" --config skip_children=true "$@"
  fi
done
exec cargo +"$toolchain" fmt --all -- "$@"
