#!/usr/bin/env bash
# Formats the workspace with the pinned nightly rustfmt (see rustfmt-nightly.toolchain).
# Usage: scripts/fmt.sh [--check]
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
cargo +"$(cat rustfmt-nightly.toolchain)" fmt --all -- "$@"
