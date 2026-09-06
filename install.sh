#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${1:-$HOME/.local/bin}"

command -v go >/dev/null || { echo "install.sh: go not found" >&2; exit 1; }

mkdir -p "$BIN_DIR"
(cd "$REPO" && go build -o "$BIN_DIR/cclaunch" ./cmd/cclaunch)

echo "installed: $BIN_DIR/cclaunch"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "note: $BIN_DIR is not in PATH" >&2 ;;
esac
