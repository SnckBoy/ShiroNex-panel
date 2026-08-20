#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${SHIRONEX_REPO_URL:-https://github.com/SnckBoy/ShiroNex-panel.git}"
BRANCH="${SHIRONEX_BRANCH:-main}"
ARCHIVE_URL="${SHIRONEX_ARCHIVE_URL:-https://raw.githubusercontent.com/SnckBoy/ShiroNex-panel/main/ShiroNex-fixed-improved.zip}"
APP_DIR="${SHIRONEX_PANEL_DIR:-/opt/shironex-panel}"
PORT="${PORT:-6767}"
TMP_DIR="$(mktemp -d /tmp/shironex-install.XXXXXX)"
cleanup(){ rm -rf "$TMP_DIR"; }
trap cleanup EXIT

[[ "$EUID" -eq 0 ]] || { echo "Run as root: curl -fsSL https://raw.githubusercontent.com/SnckBoy/ShiroNex-panel/main/install-one-click.sh | sudo bash"; exit 1; }
apt-get update
apt-get install -y ca-certificates curl unzip
curl -fL "$ARCHIVE_URL" -o "$TMP_DIR/shironex.zip"
unzip -q "$TMP_DIR/shironex.zip" -d "$TMP_DIR/extracted"
SOURCE_DIR="$(find "$TMP_DIR/extracted" -mindepth 1 -maxdepth 2 -type f -name install.sh -printf '%h\n' | head -1)"
[[ -n "$SOURCE_DIR" && -f "$SOURCE_DIR/install.sh" ]] || { echo "Could not find install.sh in the ShiroNex archive"; exit 1; }
cd "$SOURCE_DIR"
PORT="$PORT" SHIRONEX_PANEL_DIR="$APP_DIR" bash ./install.sh
printf '\nShiroNex panel installation finished.\n'
printf 'Panel directory: %s\n' "$APP_DIR"
printf 'Check status: pm2 status\n'
printf 'View logs: pm2 logs shironex-panel\n'
printf 'Open: http://YOUR_PANEL_IP:%s\n' "$PORT"
