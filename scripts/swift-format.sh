#!/usr/bin/env bash
# Formats or lints Swift with the swift-format pinned in tools/swift-format-pin/Package.swift (+ Package.resolved).
# Usage: scripts/swift-format.sh {format|lint} [files…]   (file paths relative to the repo root)
#   No files: every tracked *.swift outside brand/generated/ (exit 0 when there is none).
#   lint always runs with --strict (warnings fail).
# The first run builds swift-format and swift-syntax from source (a few minutes); later runs reuse
# tools/swift-format-pin/.build/.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

usage() {
  echo "usage: scripts/swift-format.sh {format|lint} [files…]" >&2
  exit 2
}
mode="${1:-}"
case "$mode" in
  format) args=(format --in-place) ;;
  lint) args=(lint --strict) ;;
  *) usage ;;
esac
shift

if ! command -v swift >/dev/null 2>&1; then
  echo "swift-format: \`swift\` not found; install Xcode (or the Xcode Command Line Tools) and run \`swift build --package-path tools/swift-format-pin -c release --product swift-format\` (see docs/dev-setup.md)" >&2
  exit 1
fi

# Generated Swift (brand/build-tokens.ts output) is never formatted or linted.
excluded="brand/generated/"
files=()
if [[ $# -eq 0 ]]; then
  # Skip tracked files deleted from the working tree (not yet staged as deleted).
  while IFS= read -r f; do if [[ -f "$f" ]]; then files+=("$f"); fi; done < <(git ls-files -- '*.swift' ":(exclude)$excluded")
else
  for f in "$@"; do
    [[ "${f#./}" == "$excluded"* ]] || files+=("$f")
  done
fi
if [[ ${#files[@]} -eq 0 ]]; then
  echo "swift-format: no Swift files to $mode"
  exit 0
fi

exec swift run --quiet --package-path tools/swift-format-pin -c release swift-format \
  "${args[@]}" --configuration .swift-format -- "${files[@]}"
