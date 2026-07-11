#!/usr/bin/env bash
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${1:-$HOME/.local/bin}"

command -v bun >/dev/null || { echo "install.sh: bun not found" >&2; exit 1; }

mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/cclaunch" <<EOF
#!/usr/bin/env bash
exec bun run "$REPO/src/cli.ts" "\$@"
EOF
chmod +x "$BIN_DIR/cclaunch"

echo "installed: $BIN_DIR/cclaunch -> $REPO/src/cli.ts"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "note: $BIN_DIR is not in PATH" >&2 ;;
esac
