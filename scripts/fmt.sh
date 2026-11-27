#!/usr/bin/env bash
# Formats Rust with the pinned nightly rustfmt (see rustfmt-nightly.toolchain).
# Usage: scripts/fmt.sh [--check] [files…]
#   No files: the whole workspace (`cargo fmt --all`).
#   Files: only those (the pre-commit hook); `mod foo;` is not followed into files that were not given.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
toolchain="$(cat rustfmt-nightly.toolchain)"
for arg in "$@"; do
  if [[ "$arg" != -* ]]; then
    exec rustfmt +"$toolchain" --config skip_children=true "$@"
  fi
done
exec cargo +"$toolchain" fmt --all -- "$@"
